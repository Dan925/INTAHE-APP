import type { RequestHandler } from 'express';
import { Router } from 'express';
import { z } from 'zod';
import { env } from '../../config/env';
import { optionalAuth } from '../../middleware/auth';
import {
  checkoutRateLimitByEmail,
  checkoutRateLimitByIp,
  confirmationRateLimitByIp,
  confirmationRateLimitByOrder,
  ticketLookupRateLimitByIp,
  ticketLookupRateLimitByOrder,
} from '../../middleware/rateLimit';
import * as checkoutService from '../../services/checkout/checkoutService';
import * as orderConfirmationService from '../../services/checkout/orderConfirmationService';
import * as ticketService from '../../services/tickets/ticketService';
import { asyncHandler } from '../../utils/asyncHandler';
import { ApiError } from '../../utils/errors';
import { validateBody } from '../../utils/validate';

const router = Router({ mergeParams: true });

// MAX_QUANTITY_PER_LINE_ITEM/MAX_QUANTITY_PER_ORDER exist to stop one
// checkout request from reserving a ticket type's (or event's) whole
// remaining stock for the reservation window — see env.ts for the full
// reasoning and default justification. Without these, nothing bounded
// line_items[].quantity or how many line items an order could hold.
const createOrderSchema = z
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
  checkoutRateLimitByIp,
  checkoutRateLimitByEmail,
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

// Polled by the buyer's own browser/app right after paying, using only the
// orderId from the checkout response — no token exists yet at that point.
// Deliberately unauthenticated for the same reason optionalAuth is used
// elsewhere in this router: guest checkout has no session to require.
router.get(
  '/:orderId/confirmation',
  confirmationRateLimitByIp,
  confirmationRateLimitByOrder,
  asyncHandler(async (req, res) => {
    const confirmation = await orderConfirmationService.getOrderConfirmation(
      req.params['eventId']!,
      req.params['orderId']!,
    );
    res.status(200).json(confirmation);
  }),
);

router.get(
  '/:orderId/tickets',
  optionalAuth,
  ticketLookupRateLimitByIp,
  ticketLookupRateLimitByOrder,
  asyncHandler(async (req, res) => {
    const eventId = req.params['eventId']!;
    const accessToken = typeof req.query['token'] === 'string' ? req.query['token'] : undefined;
    const tickets = await ticketService.listTicketsForOrder(
      eventId,
      req.params['orderId']!,
      req.user?.id ?? null,
      accessToken,
    );
    res.status(200).json({ items: tickets });
  }),
);

export default router;
