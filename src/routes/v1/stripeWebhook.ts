import express, { Router } from 'express';
import { constructWebhookEvent } from '../../services/stripe/stripeWebhooks';
import { handleStripeEvent } from '../../services/webhooks/stripeWebhookService';
import { asyncHandler } from '../../utils/asyncHandler';
import { ApiError } from '../../utils/errors';

const router = Router();

// Stripe signs the raw request body, so this route must receive the raw
// buffer — it's mounted before the app-wide express.json() in app.ts.
router.post(
  '/',
  express.raw({ type: 'application/json' }),
  asyncHandler(async (req, res) => {
    const signature = req.headers['stripe-signature'];
    if (typeof signature !== 'string') {
      throw new ApiError(400, 'invalid_webhook_signature', 'Missing Stripe-Signature header.', null);
    }

    let event;
    try {
      event = constructWebhookEvent(req.body as Buffer, signature);
    } catch {
      throw new ApiError(400, 'invalid_webhook_signature', 'Webhook signature verification failed.', null);
    }

    await handleStripeEvent(event);
    res.status(200).json({ received: true });
  }),
);

export default router;
