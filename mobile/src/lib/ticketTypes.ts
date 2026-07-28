import { apiRequest } from '@/lib/api';

export interface TicketType {
  id: string;
  event_id: string;
  name: string;
  price_cents: number;
  currency: string;
  quantity_total: number;
  quantity_sold: number;
  sale_starts_at: string | null;
  sale_ends_at: string | null;
  created_at: string;
}

interface CursorPage<T> {
  items: T[];
  next_cursor: string | null;
}

export function listTicketTypes(
  token: string,
  organizationId: string,
  eventId: string,
): Promise<CursorPage<TicketType>> {
  return apiRequest(`/v1/organizations/${organizationId}/events/${eventId}/ticket-types`, { token });
}

export function createTicketType(
  token: string,
  organizationId: string,
  eventId: string,
  input: { name: string; price_cents: number; quantity_total: number },
): Promise<{ ticket_type: TicketType }> {
  return apiRequest(`/v1/organizations/${organizationId}/events/${eventId}/ticket-types`, {
    method: 'POST',
    body: input,
    token,
  });
}
