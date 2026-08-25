import { Router } from 'express';
import { env } from '../../config/env';
import { asyncHandler } from '../../utils/asyncHandler';

// A tiny set of non-secret, operationally-tunable numbers the frontend needs
// to mirror without a build-time copy of env.ts — starting with
// MIN_TICKET_PRICE_CENTS, so the "$2.00" shown to an organizer while typing
// a price is always the actual configured floor, not a hardcoded guess that
// silently goes stale if MIN_TICKET_PRICE_CENTS is ever changed. Reads only,
// nothing here is sensitive, so it's deliberately unauthenticated.
const router = Router();

router.get(
  '/',
  asyncHandler(async (_req, res) => {
    res.status(200).json({ min_ticket_price_cents: env.MIN_TICKET_PRICE_CENTS });
  }),
);

export default router;
