import { apiRequest } from '@/lib/api';
import type { Event } from '@/lib/events';
import type { TicketType } from '@/lib/ticketTypes';

export interface DiscoverableEvent extends Event {
  distance_km: number | null;
}

interface CursorPage<T> {
  items: T[];
  next_cursor: string | null;
}

export function listDiscoverableEvents(location?: {
  latitude: number;
  longitude: number;
}): Promise<{ items: DiscoverableEvent[] }> {
  const query = location ? `?latitude=${location.latitude}&longitude=${location.longitude}` : '';
  return apiRequest(`/v1/discover/events${query}`);
}

export function getPublicEvent(eventId: string): Promise<{ event: Event }> {
  return apiRequest(`/v1/discover/events/${eventId}`);
}

export function listPublicTicketTypes(eventId: string): Promise<CursorPage<TicketType>> {
  return apiRequest(`/v1/discover/events/${eventId}/ticket-types`);
}
