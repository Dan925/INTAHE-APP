import { Router } from 'express';
import { requireAuth } from '../../middleware/auth';
import { requireOrgRole } from '../../middleware/requireOrgRole';
import * as dashboardService from '../../services/dashboard/dashboardService';
import * as eventService from '../../services/events/eventService';
import { asyncHandler } from '../../utils/asyncHandler';

const router = Router({ mergeParams: true });

router.use(requireAuth);
// Same tier as orders/refunds — this is financial detail ("voir les
// rapports financiers"), not something every volunteer needs.
router.use(requireOrgRole('admin'));

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const organizationId = req.params['organizationId']!;
    const eventId = req.params['eventId']!;
    await eventService.getEvent(organizationId, eventId);
    const breakdown = await dashboardService.getEventFeeBreakdown(eventId);
    res.status(200).json(breakdown);
  }),
);

export default router;
