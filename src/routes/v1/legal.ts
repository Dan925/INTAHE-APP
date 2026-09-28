import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../../middleware/auth';
import * as legalAcceptanceService from '../../services/legal/legalAcceptanceService';
import { asyncHandler } from '../../utils/asyncHandler';
import { validateBody } from '../../utils/validate';

const router = Router();

router.use(requireAuth);

// Only the document types an explicit UI action gates today (organizer
// onboarding's checkboxes, the Stripe Connect acknowledgment) — not
// refund_policy/terms_of_use for a buyer's checkout (logged automatically
// by checkoutService.createOrder, never client-driven) and not
// privacy_policy/acceptable_use (disclosed, not separately "accepted").
const recordAcceptanceSchema = z.object({
  document_type: z.enum(['terms_of_use', 'organizer_terms', 'stripe_connected_account_agreement']),
});

router.post(
  '/acceptances',
  validateBody(recordAcceptanceSchema),
  asyncHandler(async (req, res) => {
    const { document_type } = req.body as z.infer<typeof recordAcceptanceSchema>;
    const acceptance = await legalAcceptanceService.recordAcceptance({
      userId: req.user!.id,
      documentType: document_type,
      ipAddress: req.ip ?? null,
      userAgent: req.headers['user-agent'] ?? null,
    });
    res.status(201).json({
      document_type: acceptance.document_type,
      document_version: acceptance.document_version,
      accepted_at: acceptance.accepted_at.toISOString(),
    });
  }),
);

// Not called by any UI yet — the architecture's re-acceptance support
// (requirement: "if a material legal document changes, the architecture
// should support requiring re-acceptance"). A future gate on the
// organizer app would call this on load and block/prompt if the list is
// non-empty.
router.get(
  '/acceptances/outstanding',
  asyncHandler(async (req, res) => {
    const outstanding = await legalAcceptanceService.getOutstandingAcceptances(req.user!.id);
    res.status(200).json({ outstanding });
  }),
);

export default router;
