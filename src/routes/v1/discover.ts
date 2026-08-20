import { Router } from 'express';
import * as eventService from '../../services/events/eventService';
import * as ticketTypeService from '../../services/ticketTypes/ticketTypeService';
import { asyncHandler } from '../../utils/asyncHandler';
import { ApiError } from '../../utils/errors';
import { parseLimit } from '../../utils/pagination';

// Deliberately unauthenticated: this is the public "browse events near me"
// surface (web + mobile), reachable without an Intahe account, per the
// brief's differentiation goal of not requiring organizers to pay for
// marketing/discovery. Only events the organizer opted into with
// `is_public_discoverable` show up in the list; a direct link to a
// published-but-not-discoverable event still resolves via
// GET /:eventId (see eventService.getPublicEvent's comment).
const router = Router();

function parseCoordinate(raw: unknown, min: number, max: number): number | undefined {
  if (raw === undefined) return undefined;
  const value = Number(raw);
  if (Number.isNaN(value) || value < min || value > max) {
    throw new ApiError(400, 'validation_error', 'Invalid latitude/longitude.', null);
  }
  return value;
}

router.get(
  '/events',
  asyncHandler(async (req, res) => {
    const latitude = parseCoordinate(req.query['latitude'], -90, 90);
    const longitude = parseCoordinate(req.query['longitude'], -180, 180);
    if ((latitude === undefined) !== (longitude === undefined)) {
      throw new ApiError(400, 'validation_error', 'latitude and longitude must be given together.', null);
    }
    const limit = parseLimit(req.query['limit']);
    const items = await eventService.listDiscoverableEvents({ latitude, longitude, limit });
    res.status(200).json({ items });
  }),
);

router.get(
  '/events/:eventId',
  asyncHandler(async (req, res) => {
    const event = await eventService.getPublicEvent(req.params['eventId']!);
    res.status(200).json({ event });
  }),
);

router.get(
  '/events/:eventId/ticket-types',
  asyncHandler(async (req, res) => {
    const eventId = req.params['eventId']!;
    await eventService.getPublicEvent(eventId); // 404s if not published, before leaking ticket types
    const cursor = typeof req.query['cursor'] === 'string' ? req.query['cursor'] : undefined;
    const limit = parseLimit(req.query['limit']);
    const page = await ticketTypeService.listTicketTypes(eventId, cursor, limit);
    res.status(200).json(page);
  }),
);

export default router;
