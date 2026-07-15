import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../../middleware/auth';
import { requireOrgRole } from '../../middleware/requireOrgRole';
import * as eventService from '../../services/events/eventService';
import * as ticketService from '../../services/tickets/ticketService';
import { asyncHandler } from '../../utils/asyncHandler';
import { parseLimit } from '../../utils/pagination';
import { validateBody } from '../../utils/validate';

const router = Router({ mergeParams: true });

router.use(requireAuth);

const checkInSchema = z.object({
  qr_code: z.string().trim().min(1, 'qr_code is required.'),
});

router.post(
  '/check-in',
  requireOrgRole('volunteer'), // "Check-in / scanner des billets" — every role
  validateBody(checkInSchema),
  asyncHandler(async (req, res) => {
    const organizationId = req.params['organizationId']!;
    const eventId = req.params['eventId']!;
    await eventService.getEvent(organizationId, eventId);
    const ticket = await ticketService.checkInTicket(eventId, req.body.qr_code, req.user!.id);
    res.status(200).json({ ticket });
  }),
);

router.get(
  '/guest-list',
  requireOrgRole('staff'), // "Voir la guest list" — owner/admin/staff, not volunteer
  asyncHandler(async (req, res) => {
    const organizationId = req.params['organizationId']!;
    const eventId = req.params['eventId']!;
    await eventService.getEvent(organizationId, eventId);
    const cursor = typeof req.query['cursor'] === 'string' ? req.query['cursor'] : undefined;
    const limit = parseLimit(req.query['limit']);
    const page = await ticketService.listGuestList(eventId, cursor, limit);
    res.status(200).json(page);
  }),
);

export default router;
