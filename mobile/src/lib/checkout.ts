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
