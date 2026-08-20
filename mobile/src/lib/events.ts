import { apiRequest } from '@/lib/api';

export type EventStatus = 'draft' | 'published' | 'cancelled' | 'completed';

export interface Event {
  id: string;
  organization_id: string;
  name: string;
  description: string | null;
  start_at: string;
  end_at: string;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  cover_image_url: string | null;
  status: EventStatus;
  capacity: number | null;
  fees_absorbed_by_organizer: boolean;
  is_public_discoverable: boolean;
  created_at: string;
}

interface CursorPage<T> {
  items: T[];
  next_cursor: string | null;
}

export function listEvents(token: string, organizationId: string): Promise<CursorPage<Event>> {
  return apiRequest(`/v1/organizations/${organizationId}/events`, { token });
}

export function getEvent(
  token: string,
  organizationId: string,
  eventId: string,
): Promise<{ event: Event }> {
  return apiRequest(`/v1/organizations/${organizationId}/events/${eventId}`, { token });
}

export function createEvent(
  token: string,
  organizationId: string,
  input: {
    name: string;
    start_at: string;
    end_at: string;
    description?: string;
    address?: string;
    latitude?: number;
    longitude?: number;
    is_public_discoverable?: boolean;
  },
): Promise<{ event: Event }> {
  return apiRequest(`/v1/organizations/${organizationId}/events`, { method: 'POST', body: input, token });
}

export function publishEvent(
  token: string,
  organizationId: string,
  eventId: string,
): Promise<{ event: Event }> {
  return apiRequest(`/v1/organizations/${organizationId}/events/${eventId}/publish`, {
    method: 'POST',
    token,
  });
}

export function cancelEvent(
  token: string,
  organizationId: string,
  eventId: string,
): Promise<{ event: Event }> {
  return apiRequest(`/v1/organizations/${organizationId}/events/${eventId}/cancel`, {
    method: 'POST',
    token,
  });
}
