import crypto from 'node:crypto';
import type { PoolClient } from 'pg';
import { pool } from '../../config/database';
import { computeReservationExpiry, releaseExpiredReservations } from './orderReleaseService';
import { createPaymentIntent, retrievePaymentIntent } from '../stripe/stripePayments';
import { ApiError } from '../../utils/errors';
import { computeOrderFees } from '../../utils/fees';
import type { EventRow, OrderRow, OrganizationRow, StripeChargeMode, TicketTypeRow } from '../../types/db';

/**
 * Only a 'direct' charge's PaymentIntent lives in the connected account's
 * own Stripe context — 'platform' orders never touched Connect at all, and
 * 'destination' orders (legacy, pre-migration) had their PaymentIntent
 * created on the *platform* account with transfer_data pointing at the
 * connected account, so retrieving/refunding them is also a plain
 * platform-context call. Getting this wrong for a 'destination' order would
 * mean asking Stripe for a PaymentIntent inside an account that never had
 * it — a 404, not a stale value.
 */
async function connectedAccountIdForOrder(order: OrderRow): Promise<string | null> {
  if (order.stripe_charge_mode !== 'direct') {
    return null;
  }
  const result = await pool.query<{ stripe_account_id: string | null }>(
    `SELECT org.stripe_account_id
     FROM events e
     JOIN organizations org ON org.id = e.organization_id
     WHERE e.id = $1`,
    [order.event_id],
  );
  return result.rows[0]?.stripe_account_id ?? null;
}

export interface CheckoutLineItemInput {
  ticket_type_id: string;
  quantity: number;
}

export interface CreateOrderInput {
  buyer_email: string;
  line_items: CheckoutLineItemInput[];
}

export interface PublicOrder {
  id: string;
  event_id: string;
  buyer_user_id: string | null;
  buyer_email: string;
  subtotal_cents: number;
  stripe_fee_cents: number;
  intahe_fee_cents: number;
  total_cents: number;
  status: string;
  created_at: string;
}

export interface CheckoutResult {
  order: PublicOrder;
  client_secret: string | null;
  // Stripe.js on the client must be initialized with this connected
  // account's ID (the `stripeAccount` option) whenever set — a direct
  // charge's PaymentIntent (and its client_secret) lives in that account's
  // own Stripe context, not the platform's, so the Payment Element can't
  // load or confirm it otherwise. null for a 'platform'-mode order (free
  // event fallback), where the PaymentIntent is on the platform account and
  // the plain publishable key is all Stripe.js needs.
  stripe_account_id: string | null;
}

function toPublicOrder(row: OrderRow): PublicOrder {
  return {
    id: row.id,
    event_id: row.event_id,
    buyer_user_id: row.buyer_user_id,
    buyer_email: row.buyer_email,
    subtotal_cents: row.subtotal_cents,
    stripe_fee_cents: row.stripe_fee_cents,
    intahe_fee_cents: row.intahe_fee_cents,
    total_cents: row.total_cents,
    status: row.status,
    created_at: row.created_at.toISOString(),
  };
}

function canonicalRequestPayload(eventId: string, input: CreateOrderInput): string {
  const sortedItems = [...input.line_items]
    .map((item) => ({ ticket_type_id: item.ticket_type_id, quantity: item.quantity }))
    .sort((a, b) => a.ticket_type_id.localeCompare(b.ticket_type_id));
  return JSON.stringify({ event_id: eventId, buyer_email: input.buyer_email, line_items: sortedItems });
}

function hashPayload(payload: string): string {
  return crypto.createHash('sha256').update(payload).digest('hex');
}

interface ReservedLine {
  ticketTypeId: string;
  quantity: number;
  priceCents: number;
}

async function reserveInventory(
  client: PoolClient,
  eventId: string,
  lineItems: CheckoutLineItemInput[],
): Promise<{ subtotalCents: number; totalQuantity: number; currency: string; lines: ReservedLine[] }> {
  let subtotalCents = 0;
  let totalQuantity = 0;
  let currency: string | null = null;
  const lines: ReservedLine[] = [];

  // Release any abandoned reservations on exactly the ticket types this
  // order needs, in the same transaction, before attempting to reserve —
  // so a checkout doesn't fail as falsely sold out just because earlier
  // abandoned carts are still holding capacity nothing will ever pay for.
  await releaseExpiredReservations(
    client,
    [...new Set(lineItems.map((item) => item.ticket_type_id))],
  );

  for (const item of lineItems) {
    if (!Number.isInteger(item.quantity) || item.quantity < 1) {
      throw new ApiError(400, 'validation_error', 'quantity must be a positive integer.', 'line_items');
    }

    const ticketTypeResult = await client.query<TicketTypeRow>(
      `SELECT * FROM ticket_types WHERE id = $1 AND event_id = $2`,
      [item.ticket_type_id, eventId],
    );
    const ticketType = ticketTypeResult.rows[0];
    if (!ticketType) {
      throw new ApiError(404, 'ticket_type_not_found', 'Ticket type not found.', 'ticket_type_id');
    }

    const now = new Date();
    if (ticketType.sale_starts_at && now < ticketType.sale_starts_at) {
      throw new ApiError(409, 'ticket_sale_not_open', 'Ticket sales have not started yet.', 'ticket_type_id');
    }
    if (ticketType.sale_ends_at && now > ticketType.sale_ends_at) {
      throw new ApiError(409, 'ticket_sale_closed', 'Ticket sales have closed.', 'ticket_type_id');
    }

    if (currency === null) {
      currency = ticketType.currency;
    } else if (currency !== ticketType.currency) {
      throw new ApiError(
        400,
        'mixed_currency_order',
        'All ticket types in an order must share the same currency.',
        'line_items',
      );
    }

    const reserveResult = await client.query<TicketTypeRow>(
      `UPDATE ticket_types
       SET quantity_sold = quantity_sold + $2
       WHERE id = $1 AND quantity_sold + $2 <= quantity_total
       RETURNING *`,
      [ticketType.id, item.quantity],
    );
    if (reserveResult.rows.length === 0) {
      throw new ApiError(
        409,
        'ticket_sold_out',
        'Not enough tickets available for this ticket type.',
        'ticket_type_id',
      );
    }

    subtotalCents += ticketType.price_cents * item.quantity;
    totalQuantity += item.quantity;
    lines.push({ ticketTypeId: ticketType.id, quantity: item.quantity, priceCents: ticketType.price_cents });
  }

  return { subtotalCents, totalQuantity, currency: currency ?? 'usd', lines };
}

export async function createOrder(
  eventId: string,
  buyerUserId: string | null,
  idempotencyKey: string,
  input: CreateOrderInput,
): Promise<CheckoutResult> {
  if (input.line_items.length === 0) {
    throw new ApiError(400, 'validation_error', 'At least one line item is required.', 'line_items');
  }

  const requestHash = hashPayload(canonicalRequestPayload(eventId, input));

  const existing = await pool.query<OrderRow>(`SELECT * FROM orders WHERE idempotency_key = $1`, [
    idempotencyKey,
  ]);
  const existingOrder = existing.rows[0];
  if (existingOrder) {
    if (existingOrder.idempotency_request_hash !== requestHash) {
      throw new ApiError(
        409,
        'idempotency_key_reused',
        'This Idempotency-Key was already used with a different request.',
        'Idempotency-Key',
      );
    }
    let clientSecret: string | null = null;
    const connectedAccountId = await connectedAccountIdForOrder(existingOrder);
    if (existingOrder.stripe_payment_intent_id) {
      clientSecret = (
        await retrievePaymentIntent(existingOrder.stripe_payment_intent_id, connectedAccountId)
      ).client_secret;
    }
    return { order: toPublicOrder(existingOrder), client_secret: clientSecret, stripe_account_id: connectedAccountId };
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const eventResult = await client.query<EventRow>(
      `SELECT * FROM events WHERE id = $1 AND deleted_at IS NULL`,
      [eventId],
    );
    const event = eventResult.rows[0];
    if (!event) {
      throw new ApiError(404, 'event_not_found', 'Event not found.', null);
    }
    if (event.status !== 'published') {
      throw new ApiError(409, 'event_not_on_sale', 'This event is not currently on sale.', null);
    }

    const orgResult = await client.query<OrganizationRow>(
      `SELECT * FROM organizations WHERE id = $1 AND deleted_at IS NULL`,
      [event.organization_id],
    );
    const organization = orgResult.rows[0];
    if (!organization) {
      throw new ApiError(404, 'event_not_found', 'Event not found.', null);
    }

    const { subtotalCents, currency, lines } = await reserveInventory(
      client,
      eventId,
      input.line_items,
    );

    const { stripeFeeCents, intaheFeeCents, totalCents } = computeOrderFees(
      lines.map((line) => ({ priceCents: line.priceCents, quantity: line.quantity })),
      event.fees_absorbed_by_organizer,
    );

    // A connected account existing isn't enough — onboarding can be started
    // and abandoned. Only route funds to it once Stripe has confirmed via
    // account.updated that it can actually accept charges.
    //
    // There used to be a fallback here to a plain platform charge when the
    // organization wasn't Connect-ready — money for an order the organizer
    // never had the means to receive would land in Intahe's own Stripe
    // balance instead, with no built-in mechanism to ever get it to them.
    // That's exactly the funds-custodian role this migration exists to
    // eliminate, and ticketTypeService.assertOrganizationCanSellPaidTickets
    // already refuses to let a *paid* ticket type exist without a
    // charges-enabled connected account — so a paid order reaching this
    // point with none is either a stale ticket type from before that gate,
    // or the account's charges_enabled regressing (a compliance hold)
    // after the ticket type was created. Either way: refuse outright,
    // never silently charge the platform account.
    const canUseDirectCharge = Boolean(organization.stripe_account_id) && organization.stripe_charges_enabled;
    if (totalCents > 0 && !canUseDirectCharge) {
      throw new ApiError(
        409,
        'stripe_not_connected',
        'This event cannot accept payment right now — its organizer needs to reconnect Stripe.',
        null,
      );
    }
    const stripeChargeMode: StripeChargeMode = canUseDirectCharge ? 'direct' : 'platform';

    // ticket_access_token_hash is deliberately NOT set here: the token it
    // guards is proof that tickets belonging to this order can be viewed,
    // and no tickets exist yet at order-creation time (payment hasn't even
    // been attempted). It's minted later, in stripeWebhookService, at the
    // exact moment payment_intent.succeeded issues the tickets — see
    // utils/ticketAccessToken.ts.
    const orderResult = await client.query<OrderRow>(
      `INSERT INTO orders (
         event_id, buyer_user_id, buyer_email, subtotal_cents, stripe_fee_cents,
         intahe_fee_cents, total_cents, status, idempotency_key, idempotency_request_hash,
         reservation_expires_at, stripe_charge_mode
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending', $8, $9, $10, $11)
       RETURNING *`,
      [
        eventId,
        buyerUserId,
        input.buyer_email,
        subtotalCents,
        stripeFeeCents,
        intaheFeeCents,
        totalCents,
        idempotencyKey,
        requestHash,
        computeReservationExpiry(),
        stripeChargeMode,
      ],
    );
    const order = orderResult.rows[0];
    if (!order) {
      throw new Error('Insert into orders did not return a row.');
    }

    for (const line of lines) {
      await client.query(
        `INSERT INTO order_line_items (order_id, ticket_type_id, quantity, unit_price_cents)
         VALUES ($1, $2, $3, $4)`,
        [order.id, line.ticketTypeId, line.quantity, line.priceCents],
      );
    }

    const paymentIntent = await createPaymentIntent({
      amountCents: totalCents,
      currency,
      orderId: order.id,
      connectedAccountId: canUseDirectCharge ? organization.stripe_account_id : null,
      applicationFeeCents: canUseDirectCharge ? intaheFeeCents : undefined,
      eventName: event.name,
    });

    const updatedOrderResult = await client.query<OrderRow>(
      `UPDATE orders SET stripe_payment_intent_id = $2 WHERE id = $1 RETURNING *`,
      [order.id, paymentIntent.id],
    );
    const updatedOrder = updatedOrderResult.rows[0];
    if (!updatedOrder) {
      throw new Error('Update to orders did not return a row.');
    }

    await client.query('COMMIT');

    return {
      order: toPublicOrder(updatedOrder),
      client_secret: paymentIntent.client_secret,
      stripe_account_id: canUseDirectCharge ? organization.stripe_account_id : null,
    };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
