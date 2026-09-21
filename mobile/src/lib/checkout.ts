import { apiRequest } from '@/lib/api';

export interface Order {
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
  order: Order;
  client_secret: string | null;
  // The connected organizer account a direct charge's PaymentIntent lives
  // in — null for a 'platform'-mode order (free event fallback). The
  // Stripe SDK must be (re-)configured with this via initStripe() before
  // initPaymentSheet(), or it has no way to load/confirm a PaymentIntent
  // it can't see into. See the two checkout screens under app/.
  stripe_account_id: string | null;
}

export function createOrder(
  token: string | null,
  eventId: string,
  input: { buyer_email: string; line_items: { ticket_type_id: string; quantity: number }[] },
): Promise<CheckoutResult> {
  const idempotencyKey =
    globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return apiRequest(`/v1/events/${eventId}/orders`, {
    method: 'POST',
    body: input,
    token,
    headers: { 'Idempotency-Key': idempotencyKey },
  });
}

/** Staff-operated, org-scoped counterpart to createOrder — takes payment on a physical Stripe Terminal reader instead of Stripe.js/PaymentSheet. See doorSaleService.ts on the backend. */
export function createDoorSale(
  token: string,
  organizationId: string,
  eventId: string,
  input: { buyer_email: string; line_items: { ticket_type_id: string; quantity: number }[] },
): Promise<CheckoutResult> {
  return apiRequest(`/v1/organizations/${organizationId}/events/${eventId}/door-sales`, {
    method: 'POST',
    body: input,
    token,
  });
}

export type OrderConfirmationStatus = 'pending' | 'ready' | 'already_retrieved' | 'expired';

export interface OrderConfirmation {
  status: OrderConfirmationStatus;
  access_token?: string;
}

/** Polled after payment while waiting for the webhook to issue tickets — see checkout.ts's server-side counterpart. */
export function getOrderConfirmation(eventId: string, orderId: string): Promise<OrderConfirmation> {
  return apiRequest(`/v1/events/${eventId}/orders/${orderId}/confirmation`);
}
