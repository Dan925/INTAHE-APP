import { apiRequest } from '@/lib/api';

export interface BuyerTicket {
  id: string;
  order_id: string;
  ticket_type_id: string;
  qr_code: string;
  ticket_type_name: string;
  qr_code_image: string;
  attendee_name: string | null;
  attendee_email: string | null;
  checked_in_at: string | null;
  checked_in_by: string | null;
}

export function listTicketsForOrder(
  token: string | null,
  eventId: string,
  orderId: string,
  buyerEmail?: string,
): Promise<{ items: BuyerTicket[] }> {
  const query = token || !buyerEmail ? '' : `?buyer_email=${encodeURIComponent(buyerEmail)}`;
  return apiRequest(`/v1/events/${eventId}/orders/${orderId}/tickets${query}`, { token });
}
