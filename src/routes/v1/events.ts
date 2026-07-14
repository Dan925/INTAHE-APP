import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../../middleware/auth';
import { requireOrgRole } from '../../middleware/requireOrgRole';
import * as eventService from '../../services/events/eventService';
import { asyncHandler } from '../../utils/asyncHandler';
import { parseLimit } from '../../utils/pagination';
import { validateBody } from '../../utils/validate';

const router = Router({ mergeParams: true });

router.use(requireAuth);

const createEventSchema = z
  .object({
    name: z.string().trim().min(1, 'name is required.'),
    description: z.string().trim().min(1).optional(),
    start_at: z.string().datetime({ message: 'start_at must be an ISO 8601 datetime.' }),
    end_at: z.string().datetime({ message: 'end_at must be an ISO 8601 datetime.' }),
    address: z.string().trim().min(1).optional(),
    latitude: z.number().min(-90).max(90).optional(),
    longitude: z.number().min(-180).max(180).optional(),
    cover_image_url: z.string().url().optional(),
    capacity: z.number().int().min(0).optional(),
    fees_absorbed_by_organizer: z.boolean().optional(),
  })
  .refine((data) => new Date(data.end_at) > new Date(data.start_at), {
    message: 'end_at must be after start_at.',
    path: ['end_at'],
  });

router.post(
  '/',
  requireOrgRole('admin'),
  validateBody(createEventSchema),
  asyncHandler(async (req, res) => {
    const event = await eventService.createEvent(req.params['organizationId']!, req.body);
    res.status(201).json({ event });
  }),
);

router.get(
  '/',
  requireOrgRole('volunteer'),
  asyncHandler(async (req, res) => {
    const cursor = typeof req.query['cursor'] === 'string' ? req.query['cursor'] : undefined;
    const limit = parseLimit(req.query['limit']);
    const page = await eventService.listEvents(req.params['organizationId']!, cursor, limit);
    res.status(200).json(page);
  }),
);

router.get(
  '/:eventId',
  requireOrgRole('volunteer'),
  asyncHandler(async (req, res) => {
    const event = await eventService.getEvent(req.params['organizationId']!, req.params['eventId']!);
    res.status(200).json({ event });
  }),
);

const updateEventSchema = z
  .object({
    name: z.string().trim().min(1).optional(),
    description: z.string().trim().min(1).nullable().optional(),
    start_at: z.string().datetime().optional(),
    end_at: z.string().datetime().optional(),
    address: z.string().trim().min(1).nullable().optional(),
    latitude: z.number().min(-90).max(90).nullable().optional(),
    longitude: z.number().min(-180).max(180).nullable().optional(),
    cover_image_url: z.string().url().nullable().optional(),
    capacity: z.number().int().min(0).nullable().optional(),
    fees_absorbed_by_organizer: z.boolean().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, { message: 'At least one field must be provided.' })
  .refine(
    (data) => !data.start_at || !data.end_at || new Date(data.end_at) > new Date(data.start_at),
    { message: 'end_at must be after start_at.', path: ['end_at'] },
  );

router.patch(
  '/:eventId',
  requireOrgRole('admin'),
  validateBody(updateEventSchema),
  asyncHandler(async (req, res) => {
    const event = await eventService.updateEvent(
      req.params['organizationId']!,
      req.params['eventId']!,
      req.body,
    );
    res.status(200).json({ event });
  }),
);

router.post(
  '/:eventId/publish',
  requireOrgRole('admin'),
  asyncHandler(async (req, res) => {
    const event = await eventService.publishEvent(req.params['organizationId']!, req.params['eventId']!);
    res.status(200).json({ event });
  }),
);

export default router;
