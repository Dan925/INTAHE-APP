import type { RequestHandler } from 'express';
import { Router } from 'express';
import { z } from 'zod';
import { optionalAuth } from '../../middleware/auth';
import * as checkoutService from '../../services/checkout/checkoutService';
import * as ticketService from '../../services/tickets/ticketService';
import { asyncHandler } from '../../utils/asyncHandler';
import { ApiError } from '../../utils/errors';
import { validateBody } from '../../utils/validate';

const router = Router({ mergeParams: true });

const createOrderSchema = z.object({
  buyer_email: z.string().trim().toLowerCase().email(),
  line_items: z
    .array(
      z.object({
        ticket_type_id: z.string().uuid(),
        quantity: z.number().int().min(1),
      }),
    )
    .min(1, 'At least one line item is required.'),
});

// Checked before body validation: this is a protocol-level requirement
// ("blocking, pas optionnel" per the brief), so a malformed body shouldn't
// mask a missing header behind a validation_error instead.
const requireIdempotencyKey: RequestHandler = (req, _res, next) => {
  const header = req.headers['idempotency-key'];
  if (typeof header !== 'string' || header.trim().length === 0) {
    next(new ApiError(400, 'idempotency_key_required', 'The Idempotency-Key header is required.', null));
    return;
  }
  next();
};

router.post(
  '/',
  optionalAuth,
  requireIdempotencyKey,
  validateBody(createOrderSchema),
  asyncHandler(async (req, res) => {
    const idempotencyKey = req.headers['idempotency-key'] as string;
    const result = await checkoutService.createOrder(
      req.params['eventId']!,
      req.user?.id ?? null,
      idempotencyKey,
      req.body,
    );
    res.status(201).json(result);
  }),
);

router.get(
  '/:orderId/tickets',
  optionalAuth,
  asyncHandler(async (req, res) => {
    const eventId = req.params['eventId']!;
    const buyerEmail = typeof req.query['buyer_email'] === 'string' ? req.query['buyer_email'] : undefined;
    const tickets = await ticketService.listTicketsForOrder(
      eventId,
      req.params['orderId']!,
      req.user?.id ?? null,
      buyerEmail,
    );
    res.status(200).json({ items: tickets });
  }),
);

export default router;
