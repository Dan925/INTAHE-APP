import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../../middleware/auth';
import { requireOrgRole } from '../../middleware/requireOrgRole';
import * as eventService from '../../services/events/eventService';
import * as ticketTypeService from '../../services/ticketTypes/ticketTypeService';
import { asyncHandler } from '../../utils/asyncHandler';
import { parseLimit } from '../../utils/pagination';
import { validateBody } from '../../utils/validate';

const router = Router({ mergeParams: true });

router.use(requireAuth);

// ticket_types only stores event_id, not organization_id, so every route
// re-confirms the event actually belongs to :organizationId (via the
// already-scoped eventService.getEvent) before touching ticket types —
// otherwise a member of one org could manage another org's ticket types by
// guessing an eventId in the URL.
async function assertEventInOrganization(organizationId: string, eventId: string): Promise<void> {
  await eventService.getEvent(organizationId, eventId);
}

const createSchema = z.object({
  name: z.string().trim().min(1, 'name is required.'),
  price_cents: z.number().int().min(0),
  currency: z.string().trim().length(3).toLowerCase().optional(),
  quantity_total: z.number().int().min(0),
  sale_starts_at: z.string().datetime().optional(),
  sale_ends_at: z.string().datetime().optional(),
});

router.post(
  '/',
  requireOrgRole('admin'),
  validateBody(createSchema),
  asyncHandler(async (req, res) => {
    const organizationId = req.params['organizationId']!;
    const eventId = req.params['eventId']!;
    await assertEventInOrganization(organizationId, eventId);
    const ticketType = await ticketTypeService.createTicketType(eventId, req.body);
    res.status(201).json({ ticket_type: ticketType });
  }),
);

router.get(
  '/',
  requireOrgRole('volunteer'),
  asyncHandler(async (req, res) => {
    const organizationId = req.params['organizationId']!;
    const eventId = req.params['eventId']!;
    await assertEventInOrganization(organizationId, eventId);
    const cursor = typeof req.query['cursor'] === 'string' ? req.query['cursor'] : undefined;
    const limit = parseLimit(req.query['limit']);
    const page = await ticketTypeService.listTicketTypes(eventId, cursor, limit);
    res.status(200).json(page);
  }),
);

router.get(
  '/:ticketTypeId',
  requireOrgRole('volunteer'),
  asyncHandler(async (req, res) => {
    const organizationId = req.params['organizationId']!;
    const eventId = req.params['eventId']!;
    await assertEventInOrganization(organizationId, eventId);
    const ticketType = await ticketTypeService.getTicketType(eventId, req.params['ticketTypeId']!);
    res.status(200).json({ ticket_type: ticketType });
  }),
);

const updateSchema = z
  .object({
    name: z.string().trim().min(1).optional(),
    price_cents: z.number().int().min(0).optional(),
    quantity_total: z.number().int().min(0).optional(),
    sale_starts_at: z.string().datetime().nullable().optional(),
    sale_ends_at: z.string().datetime().nullable().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, { message: 'At least one field must be provided.' });

router.patch(
  '/:ticketTypeId',
  requireOrgRole('admin'),
  validateBody(updateSchema),
  asyncHandler(async (req, res) => {
    const organizationId = req.params['organizationId']!;
    const eventId = req.params['eventId']!;
    await assertEventInOrganization(organizationId, eventId);
    const ticketType = await ticketTypeService.updateTicketType(
      eventId,
      req.params['ticketTypeId']!,
      req.body,
    );
    res.status(200).json({ ticket_type: ticketType });
  }),
);

export default router;
