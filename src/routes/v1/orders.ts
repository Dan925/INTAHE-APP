import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../../middleware/auth';
import { requireOrgRole } from '../../middleware/requireOrgRole';
import * as eventService from '../../services/events/eventService';
import * as orderService from '../../services/orders/orderService';
import { asyncHandler } from '../../utils/asyncHandler';
import { parseLimit } from '../../utils/pagination';
import { validateBody } from '../../utils/validate';

const router = Router({ mergeParams: true });

router.use(requireAuth);
// "Voir les rapports financiers" — owner/admin only, per the brief's role table.
router.use(requireOrgRole('admin'));

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const organizationId = req.params['organizationId']!;
    const eventId = req.params['eventId']!;
    await eventService.getEvent(organizationId, eventId);
    const cursor = typeof req.query['cursor'] === 'string' ? req.query['cursor'] : undefined;
    const limit = parseLimit(req.query['limit']);
    const page = await orderService.listOrdersForEvent(eventId, cursor, limit);
    res.status(200).json(page);
  }),
);

router.get(
  '/:orderId',
  asyncHandler(async (req, res) => {
    const organizationId = req.params['organizationId']!;
    const eventId = req.params['eventId']!;
    await eventService.getEvent(organizationId, eventId);
    const result = await orderService.getOrderForEvent(eventId, req.params['orderId']!);
    res.status(200).json(result);
  }),
);

const refundSchema = z.object({
  // Omit for a full refund of the remaining refundable balance.
  amount_cents: z.number().int().min(1).optional(),
});

router.post(
  '/:orderId/refund',
  validateBody(refundSchema),
  asyncHandler(async (req, res) => {
    const organizationId = req.params['organizationId']!;
    const eventId = req.params['eventId']!;
    await eventService.getEvent(organizationId, eventId);
    const order = await orderService.refundOrder(
      organizationId,
      eventId,
      req.params['orderId']!,
      req.body.amount_cents,
    );
    res.status(200).json({ order });
  }),
);

export default router;
