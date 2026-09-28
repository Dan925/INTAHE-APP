import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../../middleware/auth';
import { requireOrgRole } from '../../middleware/requireOrgRole';
import { aiDescriptionRateLimitByUser } from '../../middleware/rateLimit';
import * as eventService from '../../services/events/eventService';
import * as eventDescriptionService from '../../services/ai/eventDescriptionService';
import { asyncHandler } from '../../utils/asyncHandler';
import { parseLimit } from '../../utils/pagination';
import { validateBody } from '../../utils/validate';

const router = Router({ mergeParams: true });

router.use(requireAuth);

// Previously bounded only by the global 100KB request body limit, not per
// field — generous enough for real use (description is long-form, ~2
// screens of text) while still rejecting an obviously-abusive payload.
const EVENT_NAME_MAX_LENGTH = 200;
const EVENT_DESCRIPTION_MAX_LENGTH = 5000;
const EVENT_ADDRESS_MAX_LENGTH = 300;

const createEventSchema = z
  .object({
    name: z.string().trim().min(1, 'name is required.').max(EVENT_NAME_MAX_LENGTH),
    description: z.string().trim().min(1).max(EVENT_DESCRIPTION_MAX_LENGTH).optional(),
    description_ai_generated: z.boolean().optional(),
    start_at: z.string().datetime({ message: 'start_at must be an ISO 8601 datetime.' }),
    end_at: z.string().datetime({ message: 'end_at must be an ISO 8601 datetime.' }),
    address: z.string().trim().min(1).max(EVENT_ADDRESS_MAX_LENGTH).optional(),
    latitude: z.number().min(-90).max(90).optional(),
    longitude: z.number().min(-180).max(180).optional(),
    cover_image_url: z.string().url().optional(),
    capacity: z.number().int().min(0).optional(),
    fees_absorbed_by_organizer: z.boolean().optional(),
    is_public_discoverable: z.boolean().optional(),
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

// Doesn't need an eventId — used from both the create-event form (before
// the event exists) and the edit form on an existing event, with the same
// request shape either way. organizationId is only used for auth
// (admin-only, same bar as actually creating/editing the event) and rate
// limiting; the generated text is never itself associated with the
// organization until the caller actually saves it via POST/PATCH above.
const aiDescriptionSchema = z.object({
  event_name: z.string().trim().min(1, 'event_name is required.').max(EVENT_NAME_MAX_LENGTH),
  tone: z.string().trim().min(1, 'tone is required.').max(100),
  locale: z.enum(['fr', 'en']),
  current_description: z.string().trim().max(EVENT_DESCRIPTION_MAX_LENGTH).optional(),
  custom_instructions: z.string().trim().max(500).optional(),
});

router.post(
  '/ai-description',
  requireOrgRole('admin'),
  aiDescriptionRateLimitByUser,
  validateBody(aiDescriptionSchema),
  asyncHandler(async (req, res) => {
    const body = req.body as z.infer<typeof aiDescriptionSchema>;
    const description = await eventDescriptionService.generateEventDescription({
      eventName: body.event_name,
      tone: body.tone,
      locale: body.locale,
      currentDescription: body.current_description,
      customInstructions: body.custom_instructions,
    });
    res.status(200).json({ description });
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
    name: z.string().trim().min(1).max(EVENT_NAME_MAX_LENGTH).optional(),
    description: z.string().trim().min(1).max(EVENT_DESCRIPTION_MAX_LENGTH).nullable().optional(),
    description_ai_generated: z.boolean().optional(),
    start_at: z.string().datetime().optional(),
    end_at: z.string().datetime().optional(),
    address: z.string().trim().min(1).max(EVENT_ADDRESS_MAX_LENGTH).nullable().optional(),
    latitude: z.number().min(-90).max(90).nullable().optional(),
    longitude: z.number().min(-180).max(180).nullable().optional(),
    cover_image_url: z.string().url().nullable().optional(),
    capacity: z.number().int().min(0).nullable().optional(),
    fees_absorbed_by_organizer: z.boolean().optional(),
    is_public_discoverable: z.boolean().optional(),
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

router.post(
  '/:eventId/cancel',
  requireOrgRole('admin'),
  asyncHandler(async (req, res) => {
    const event = await eventService.cancelEvent(req.params['organizationId']!, req.params['eventId']!);
    res.status(200).json({ event });
  }),
);

router.post(
  '/:eventId/complete',
  requireOrgRole('admin'),
  asyncHandler(async (req, res) => {
    const event = await eventService.completeEvent(req.params['organizationId']!, req.params['eventId']!);
    res.status(200).json({ event });
  }),
);

export default router;
