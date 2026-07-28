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

export interface OrderTicket {
  id: string;
  ticket_type_id: string;
  qr_code: string;
  attendee_name: string | null;
  attendee_email: string | null;
  checked_in_at: string | null;
}

interface CursorPage<T> {
  items: T[];
  next_cursor: string | null;
}

export function listOrdersForEvent(
  token: string,
  organizationId: string,
  eventId: string,
): Promise<CursorPage<Order>> {
  return apiRequest(`/v1/organizations/${organizationId}/events/${eventId}/orders`, { token });
}

export function getOrderForEvent(
  token: string,
  organizationId: string,
  eventId: string,
  orderId: string,
): Promise<{ order: Order; tickets: OrderTicket[] }> {
  return apiRequest(`/v1/organizations/${organizationId}/events/${eventId}/orders/${orderId}`, { token });
}

export function refundOrder(
  token: string,
  organizationId: string,
  eventId: string,
  orderId: string,
  amountCents?: number,
): Promise<{ order: Order }> {
  return apiRequest(`/v1/organizations/${organizationId}/events/${eventId}/orders/${orderId}/refund`, {
    method: 'POST',
    body: amountCents !== undefined ? { amount_cents: amountCents } : {},
    token,
  });
}
