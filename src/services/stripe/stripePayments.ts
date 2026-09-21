import type Stripe from 'stripe';
import { env } from '../../config/env';
import { buildStatementDescriptorSuffix } from '../../utils/statementDescriptor';
import { stripeClient } from './stripeClient';

interface BasePaymentIntentInput {
  amountCents: number;
  currency: string;
  connectedAccountId?: string | null | undefined;
  applicationFeeCents?: number | undefined;
}

/**
 * Shared by createPaymentIntent (tickets) and createQuickSalePaymentIntent
 * (quick sales) — everything about how a direct-charge PaymentIntent is
 * built is identical between the two; only the metadata key that lets the
 * webhook tell which kind of PaymentIntent it's looking at differs.
 */
function buildPaymentIntentCreateParams(
  input: BasePaymentIntentInput,
  metadata: Record<string, string>,
  // So the buyer's bank statement shows what they actually bought instead
  // of just "INTAHE" — see ../../utils/statementDescriptor.ts. Optional
  // because not every caller has one handy, and
  // buildStatementDescriptorSuffix itself can still decide there's nothing
  // usable to send.
  statementDescriptorSource?: string | undefined,
): { params: Stripe.PaymentIntentCreateParams; options: Stripe.RequestOptions } {
  const params: Stripe.PaymentIntentCreateParams = {
    amount: input.amountCents,
    currency: input.currency,
    metadata,
  };
  const options: Stripe.RequestOptions = {};

  // Stripe Connect direct charge: the PaymentIntent is created directly in
  // the connected organization's own Stripe context (the `stripeAccount`
  // request option below) rather than on the platform account — the charge
  // belongs to the organizer from the moment it's created, and the
  // platform's balance is never touched. Intahe's cut is still carved out
  // via application_fee_amount, which works the same way for both charge
  // shapes. If the organization hasn't connected (or finished onboarding)
  // a Stripe account, fall back to a plain charge on the platform account
  // (the brief allows a simplified mode to start validating before every
  // organizer is onboarded to Connect).
  if (input.connectedAccountId) {
    options.stripeAccount = input.connectedAccountId;
    if (input.applicationFeeCents !== undefined) {
      params.application_fee_amount = input.applicationFeeCents;
    }
  }

  if (statementDescriptorSource) {
    const suffix = buildStatementDescriptorSuffix(statementDescriptorSource);
    if (suffix) {
      params.statement_descriptor_suffix = suffix;
    }
  }

  // Above the configured threshold, request 3D Secure explicitly rather
  // than leaving it to Stripe's automatic, risk-based decision — a
  // higher-value order is a more attractive chargeback target, so the
  // extra buyer friction is worth it. Below the threshold, omit the option
  // entirely so Stripe's own (regulatorily-required, e.g. EU/UK SCA)
  // automatic behavior is untouched.
  if (input.amountCents >= env.THREE_D_SECURE_THRESHOLD_CENTS) {
    params.payment_method_options = {
      card: { request_three_d_secure: 'any' },
    };
  }

  return { params, options };
}

export interface CreatePaymentIntentInput extends BasePaymentIntentInput {
  orderId: string;
  // The event's own name — optional because not every caller has one handy
  // (e.g. it isn't needed to retrieve/refund an existing PaymentIntent).
  eventName?: string | undefined;
}

export async function createPaymentIntent(input: CreatePaymentIntentInput): Promise<Stripe.PaymentIntent> {
  const { params, options } = buildPaymentIntentCreateParams(input, { order_id: input.orderId }, input.eventName);
  return stripeClient.paymentIntents.create(params, options);
}

export interface CreateQuickSalePaymentIntentInput extends BasePaymentIntentInput {
  quickSaleId: string;
  itemName?: string | undefined;
}

/** See stripeWebhookService.handleStripeEvent — it reads metadata.quick_sale_id to route here rather than to the ticket-order path. */
export async function createQuickSalePaymentIntent(
  input: CreateQuickSalePaymentIntentInput,
): Promise<Stripe.PaymentIntent> {
  const { params, options } = buildPaymentIntentCreateParams(
    input,
    { quick_sale_id: input.quickSaleId },
    input.itemName,
  );
  return stripeClient.paymentIntents.create(params, options);
}

/**
 * connectedAccountId must be omitted (or null) for a 'platform' or legacy
 * 'destination' order — both have their PaymentIntent on the platform
 * account — and must be the organization's stripe_account_id for a
 * 'direct' order, whose PaymentIntent lives in the connected account's own
 * context. See checkoutService.connectedAccountIdForOrder, the one place
 * that decides which of these applies for a given order.
 */
export async function retrievePaymentIntent(
  id: string,
  connectedAccountId?: string | null,
): Promise<Stripe.PaymentIntent> {
  const options: Stripe.RequestOptions = connectedAccountId ? { stripeAccount: connectedAccountId } : {};
  return stripeClient.paymentIntents.retrieve(id, undefined, options);
}
