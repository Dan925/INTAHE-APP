import { Router } from 'express';
import { requireAuth } from '../../middleware/auth';
import { requireOrgRole } from '../../middleware/requireOrgRole';
import * as capacityOvershootService from '../../services/capacity/capacityOvershootService';
import * as eventService from '../../services/events/eventService';
import { asyncHandler } from '../../utils/asyncHandler';

const router = Router({ mergeParams: true });

router.use(requireAuth);
// Same tier as the financial reports (orders.ts) — this is operational/
// financial exposure info (buyer emails, order references), not something
// every volunteer scanning tickets at the door needs to see.
router.use(requireOrgRole('admin'));

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const organizationId = req.params['organizationId']!;
    const eventId = req.params['eventId']!;
    await eventService.getEvent(organizationId, eventId);
    const items = await capacityOvershootService.listCapacityOvershootIncidents(eventId);
    res.status(200).json({ items });
  }),
);

export default router;
