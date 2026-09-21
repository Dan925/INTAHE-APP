import { Router } from 'express';
import { z } from 'zod';
import { env } from '../../config/env';
import { requireAuth } from '../../middleware/auth';
import { requireOrgRole } from '../../middleware/requireOrgRole';
import * as doorSaleService from '../../services/checkout/doorSaleService';
import { asyncHandler } from '../../utils/asyncHandler';
import { validateBody } from '../../utils/validate';

const router = Router({ mergeParams: true });

router.use(requireAuth);

// Mirrors checkout.ts's createOrderSchema (same quantity bounds) — a door
// sale is still a real order against the same ticket types, just taken by
// staff on a physical reader instead of the buyer typing a card online.
const createDoorSaleSchema = z
  .object({
    buyer_email: z.string().trim().toLowerCase().email(),
    line_items: z
      .array(
        z.object({
          ticket_type_id: z.string().uuid(),
          quantity: z
            .number()
            .int()
            .min(1)
            .max(env.MAX_QUANTITY_PER_LINE_ITEM, `quantity cannot exceed ${env.MAX_QUANTITY_PER_LINE_ITEM} per line item.`),
        }),
      )
      .min(1, 'At least one line item is required.'),
  })
  .refine((data) => data.line_items.reduce((sum, item) => sum + item.quantity, 0) <= env.MAX_QUANTITY_PER_ORDER, {
    message: `An order cannot exceed ${env.MAX_QUANTITY_PER_ORDER} tickets in total.`,
    path: ['line_items'],
  });

// Volunteer-level, same as taking a Quick Sale — the everyday action a
// front-desk/door person needs, not an admin-only one.
router.post(
  '/',
  requireOrgRole('volunteer'),
  validateBody(createDoorSaleSchema),
  asyncHandler(async (req, res) => {
    const result = await doorSaleService.createDoorSale(
      req.params['organizationId']!,
      req.params['eventId']!,
      req.body,
    );
    res.status(201).json(result);
  }),
);

export default router;
