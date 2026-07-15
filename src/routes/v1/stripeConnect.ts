import { Router } from 'express';
import { requireAuth } from '../../middleware/auth';
import { requireOrgRole } from '../../middleware/requireOrgRole';
import * as stripeConnectService from '../../services/stripeConnect/stripeConnectService';
import { asyncHandler } from '../../utils/asyncHandler';

const router = Router({ mergeParams: true });

router.use(requireAuth);
// "Gérer facturation / Stripe" — owner only, per the brief's role table
// (the only row in that table with no admin access at all).
router.use(requireOrgRole('owner'));

router.post(
  '/onboarding-link',
  asyncHandler(async (req, res) => {
    const result = await stripeConnectService.createOnboardingLink(req.params['organizationId']!);
    res.status(200).json(result);
  }),
);

router.get(
  '/status',
  asyncHandler(async (req, res) => {
    const status = await stripeConnectService.getConnectStatus(req.params['organizationId']!);
    res.status(200).json(status);
  }),
);

export default router;
