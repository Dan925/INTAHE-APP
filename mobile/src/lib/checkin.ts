import { apiRequest } from '@/lib/api';

export interface GuestListEntry {
  id: string;
  order_id: string;
  ticket_type_id: string;
  qr_code: string;
  ticket_type_name: string;
  buyer_email: string;
  attendee_name: string | null;
  attendee_email: string | null;
  checked_in_at: string | null;
  checked_in_by: string | null;
}

export interface CheckInResult extends GuestListEntry {
  ticket_type_capacity_exceeded: boolean;
  ticket_type_overshoot_quantity: number;
}

interface CursorPage<T> {
  items: T[];
  next_cursor: string | null;
}

export function checkInTicket(
  token: string,
  organizationId: string,
  eventId: string,
  qrCode: string,
): Promise<{ ticket: CheckInResult }> {
  return apiRequest(`/v1/organizations/${organizationId}/events/${eventId}/check-in`, {
    method: 'POST',
    body: { qr_code: qrCode },
    token,
  });
}

export function listGuestList(
  token: string,
  organizationId: string,
  eventId: string,
): Promise<CursorPage<GuestListEntry>> {
  return apiRequest(`/v1/organizations/${organizationId}/events/${eventId}/guest-list`, { token });
}
