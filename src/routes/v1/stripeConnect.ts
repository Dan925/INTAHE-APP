import { Router } from 'express';
import { requireAuth } from '../../middleware/auth';
import { requireOrgRole } from '../../middleware/requireOrgRole';
import * as stripeConnectService from '../../services/stripeConnect/stripeConnectService';
import { getOrganizationPayoutOverview } from '../../services/payouts/organizerPayoutOverviewService';
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

// Collected/available balance, upcoming payout dates ("48h after the event
// ends"), and full attempt history — see organizerPayoutOverviewService.
router.get(
  '/payouts',
  asyncHandler(async (req, res) => {
    const overview = await getOrganizationPayoutOverview(req.params['organizationId']!);
    res.status(200).json(overview);
  }),
);

export default router;
