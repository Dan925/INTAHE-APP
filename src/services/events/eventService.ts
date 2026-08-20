import { pool } from '../../config/database';
import { ApiError } from '../../utils/errors';
import { buildPage, decodeCursor, encodeCursor, type CursorPage } from '../../utils/pagination';
import type { EventRow, EventStatus } from '../../types/db';

export interface CreateEventInput {
  name: string;
  description?: string | undefined;
  start_at: string;
  end_at: string;
  address?: string | undefined;
  latitude?: number | undefined;
  longitude?: number | undefined;
  cover_image_url?: string | undefined;
  capacity?: number | undefined;
  fees_absorbed_by_organizer?: boolean | undefined;
  is_public_discoverable?: boolean | undefined;
}

export interface UpdateEventInput {
  name?: string | undefined;
  description?: string | null | undefined;
  start_at?: string | undefined;
  end_at?: string | undefined;
  address?: string | null | undefined;
  latitude?: number | null | undefined;
  longitude?: number | null | undefined;
  cover_image_url?: string | null | undefined;
  capacity?: number | null | undefined;
  fees_absorbed_by_organizer?: boolean | undefined;
  is_public_discoverable?: boolean | undefined;
}

export interface PublicEvent {
  id: string;
  organization_id: string;
  name: string;
  description: string | null;
  description_ai_generated: boolean;
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

function toPublicEvent(row: EventRow): PublicEvent {
  return {
    id: row.id,
    organization_id: row.organization_id,
    name: row.name,
    description: row.description,
    description_ai_generated: row.description_ai_generated,
    start_at: row.start_at.toISOString(),
    end_at: row.end_at.toISOString(),
    address: row.address,
    latitude: row.latitude === null ? null : Number(row.latitude),
    longitude: row.longitude === null ? null : Number(row.longitude),
    cover_image_url: row.cover_image_url,
    status: row.status,
    capacity: row.capacity,
    fees_absorbed_by_organizer: row.fees_absorbed_by_organizer,
    is_public_discoverable: row.is_public_discoverable,
    created_at: row.created_at.toISOString(),
  };
}

function notFound(): ApiError {
  return new ApiError(404, 'event_not_found', 'Event not found.', null);
}

export async function createEvent(organizationId: string, input: CreateEventInput): Promise<PublicEvent> {
  const result = await pool.query<EventRow>(
    `INSERT INTO events (
       organization_id, name, description, start_at, end_at, address,
       latitude, longitude, cover_image_url, capacity, fees_absorbed_by_organizer,
       is_public_discoverable
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
     RETURNING *`,
    [
      organizationId,
      input.name,
      input.description ?? null,
      input.start_at,
      input.end_at,
      input.address ?? null,
      input.latitude ?? null,
      input.longitude ?? null,
      input.cover_image_url ?? null,
      input.capacity ?? null,
      input.fees_absorbed_by_organizer ?? false,
      input.is_public_discoverable ?? false,
    ],
  );
  const event = result.rows[0];
  if (!event) {
    throw new Error('Insert into events did not return a row.');
  }
  return toPublicEvent(event);
}

export async function getEvent(organizationId: string, eventId: string): Promise<PublicEvent> {
  const result = await pool.query<EventRow>(
    `SELECT * FROM events WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL`,
    [eventId, organizationId],
  );
  const event = result.rows[0];
  if (!event) {
    throw notFound();
  }
  return toPublicEvent(event);
}

export async function updateEvent(
  organizationId: string,
  eventId: string,
  patch: UpdateEventInput,
): Promise<PublicEvent> {
  const fields: Array<[string, unknown]> = [];
  if ('name' in patch) fields.push(['name', patch.name]);
  if ('description' in patch) fields.push(['description', patch.description]);
  if ('start_at' in patch) fields.push(['start_at', patch.start_at]);
  if ('end_at' in patch) fields.push(['end_at', patch.end_at]);
  if ('address' in patch) fields.push(['address', patch.address]);
  if ('latitude' in patch) fields.push(['latitude', patch.latitude]);
  if ('longitude' in patch) fields.push(['longitude', patch.longitude]);
  if ('cover_image_url' in patch) fields.push(['cover_image_url', patch.cover_image_url]);
  if ('capacity' in patch) fields.push(['capacity', patch.capacity]);
  if ('fees_absorbed_by_organizer' in patch) {
    fields.push(['fees_absorbed_by_organizer', patch.fees_absorbed_by_organizer]);
  }
  if ('is_public_discoverable' in patch) {
    fields.push(['is_public_discoverable', patch.is_public_discoverable]);
  }

  if (fields.length === 0) {
    throw new ApiError(400, 'validation_error', 'At least one field must be provided.', null);
  }

  const setClause = fields.map(([column], i) => `${column} = $${i + 3}`).join(', ');
  const values = fields.map(([, value]) => value);

  const result = await pool.query<EventRow>(
    `UPDATE events SET ${setClause}
     WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL
     RETURNING *`,
    [eventId, organizationId, ...values],
  );
  const event = result.rows[0];
  if (!event) {
    throw notFound();
  }
  return toPublicEvent(event);
}

export async function publishEvent(organizationId: string, eventId: string): Promise<PublicEvent> {
  const existing = await pool.query<EventRow>(
    `SELECT * FROM events WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL`,
    [eventId, organizationId],
  );
  const event = existing.rows[0];
  if (!event) {
    throw notFound();
  }
  if (event.status !== 'draft') {
    throw new ApiError(
      409,
      'event_not_publishable',
      `Event cannot be published from status "${event.status}".`,
      'status',
    );
  }

  const result = await pool.query<EventRow>(
    `UPDATE events SET status = 'published'
     WHERE id = $1 AND organization_id = $2 AND status = 'draft'
     RETURNING *`,
    [eventId, organizationId],
  );
  const published = result.rows[0];
  if (!published) {
    throw notFound();
  }
  return toPublicEvent(published);
}

export async function cancelEvent(organizationId: string, eventId: string): Promise<PublicEvent> {
  const existing = await pool.query<EventRow>(
    `SELECT * FROM events WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL`,
    [eventId, organizationId],
  );
  const event = existing.rows[0];
  if (!event) {
    throw notFound();
  }
  if (event.status !== 'draft' && event.status !== 'published') {
    throw new ApiError(
      409,
      'event_not_cancellable',
      `Event cannot be cancelled from status "${event.status}".`,
      'status',
    );
  }

  // No automatic refunds here on purpose: cancelling an event and refunding
  // its orders are two separate, deliberate admin actions. Silently
  // triggering a wave of Stripe refunds as a side effect of a status change
  // would be a surprising, hard-to-undo thing for this endpoint to do.
  const result = await pool.query<EventRow>(
    `UPDATE events SET status = 'cancelled'
     WHERE id = $1 AND organization_id = $2 AND status IN ('draft', 'published')
     RETURNING *`,
    [eventId, organizationId],
  );
  const cancelled = result.rows[0];
  if (!cancelled) {
    throw notFound();
  }
  return toPublicEvent(cancelled);
}

export async function completeEvent(organizationId: string, eventId: string): Promise<PublicEvent> {
  const existing = await pool.query<EventRow>(
    `SELECT * FROM events WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL`,
    [eventId, organizationId],
  );
  const event = existing.rows[0];
  if (!event) {
    throw notFound();
  }
  if (event.status !== 'published') {
    throw new ApiError(
      409,
      'event_not_completable',
      `Event cannot be completed from status "${event.status}".`,
      'status',
    );
  }

  const result = await pool.query<EventRow>(
    `UPDATE events SET status = 'completed'
     WHERE id = $1 AND organization_id = $2 AND status = 'published'
     RETURNING *`,
    [eventId, organizationId],
  );
  const completed = result.rows[0];
  if (!completed) {
    throw notFound();
  }
  return toPublicEvent(completed);
}

/**
 * Public detail lookup by event id alone, no organization scope: used by
 * the unauthenticated discovery surface (web + mobile) so a direct link to
 * a published event works even when the organizer didn't opt it into the
 * "near me" browse list — only `is_public_discoverable` gates whether an
 * event appears in `listDiscoverableEvents`, not whether it's viewable.
 */
export async function getPublicEvent(eventId: string): Promise<PublicEvent> {
  const result = await pool.query<EventRow>(
    `SELECT * FROM events WHERE id = $1 AND status = 'published' AND deleted_at IS NULL`,
    [eventId],
  );
  const event = result.rows[0];
  if (!event) {
    throw notFound();
  }
  return toPublicEvent(event);
}

export interface DiscoverEventsParams {
  latitude?: number | undefined;
  longitude?: number | undefined;
  limit: number;
}

export interface DiscoverableEvent extends PublicEvent {
  distance_km: number | null;
}

/**
 * Published, opted-in, not-yet-over events. When a location is given,
 * results are sorted by great-circle distance (plain haversine in SQL — no
 * PostGIS extension available), events without coordinates are still
 * included but sorted last; otherwise sorted soonest-first. No cursor
 * pagination yet (deliberately out of scope for the first version) — just
 * a flat, capped list.
 */
export async function listDiscoverableEvents(
  params: DiscoverEventsParams,
): Promise<DiscoverableEvent[]> {
  const hasLocation = params.latitude !== undefined && params.longitude !== undefined;

  // The distance expression can't be referenced by its SELECT alias from
  // inside a CASE in ORDER BY (Postgres only resolves bare-identifier
  // ORDER BY items to output columns, not sub-expressions) — computed in a
  // subquery instead, then ordered from the outer query where the alias is
  // just a normal column.
  const result = await pool.query<EventRow & { distance_km: string | null }>(
    `SELECT * FROM (
       SELECT *,
         CASE
           WHEN $1::double precision IS NULL OR latitude IS NULL OR longitude IS NULL THEN NULL
           ELSE 6371 * acos(
             LEAST(1, GREATEST(-1,
               cos(radians($1::double precision)) * cos(radians(latitude::double precision)) *
                 cos(radians(longitude::double precision) - radians($2::double precision)) +
               sin(radians($1::double precision)) * sin(radians(latitude::double precision))
             ))
           )
         END AS distance_km
       FROM events
       WHERE status = 'published'
         AND is_public_discoverable = true
         AND deleted_at IS NULL
         AND end_at >= now()
     ) AS discoverable_events
     ORDER BY
       CASE WHEN $1::double precision IS NULL THEN start_at END ASC,
       CASE WHEN $1::double precision IS NOT NULL THEN distance_km END ASC NULLS LAST
     LIMIT $3`,
    [hasLocation ? params.latitude : null, hasLocation ? params.longitude : null, params.limit],
  );

  return result.rows.map((row) => ({
    ...toPublicEvent(row),
    distance_km: row.distance_km === null ? null : Number(row.distance_km),
  }));
}

export async function listEvents(
  organizationId: string,
  cursor: string | undefined,
  limit: number,
): Promise<CursorPage<PublicEvent>> {
  const decoded = cursor ? decodeCursor(cursor) : null;

  const result = await pool.query<EventRow & { cursor_created_at: string }>(
    `SELECT *, created_at::text AS cursor_created_at FROM events
     WHERE organization_id = $1
       AND deleted_at IS NULL
       AND (
         $2::timestamptz IS NULL
         OR (created_at, id) < ($2::timestamptz, $3::uuid)
       )
     ORDER BY created_at DESC, id DESC
     LIMIT $4`,
    [organizationId, decoded?.createdAt ?? null, decoded?.id ?? null, limit + 1],
  );

  return buildPage(result.rows, limit, toPublicEvent, (row) => encodeCursor(row.cursor_created_at, row.id));
}
