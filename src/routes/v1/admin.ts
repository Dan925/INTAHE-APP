import { Router } from 'express';
import { requireAuth } from '../../middleware/auth';
import { requirePlatformAdmin } from '../../middleware/requirePlatformAdmin';
import { auditPlatformAdminAccess, resolveOrganizationIdForEvent } from '../../middleware/auditPlatformAdminAccess';
import * as adminService from '../../services/admin/adminService';
import { triggerPayoutForEvent } from '../../services/payouts/payoutService';
import { asyncHandler } from '../../utils/asyncHandler';

const router = Router();

router.use(requireAuth);
router.use(requirePlatformAdmin);

router.get(
  '/payouts/overview',
  auditPlatformAdminAccess('admin.payouts.overview', 'view'),
  asyncHandler(async (_req, res) => {
    const overview = await adminService.getAdminPayoutOverview();
    res.status(200).json(overview);
  }),
);

router.post(
  '/events/:eventId/payouts/trigger',
  auditPlatformAdminAccess('admin.event.payouts.trigger', 'trigger_payout', resolveOrganizationIdForEvent),
  asyncHandler(async (req, res) => {
    const outcome = await triggerPayoutForEvent(req.params['eventId']!);
    res.status(200).json({ outcome });
  }),
);

router.post(
  '/events/:eventId/payouts/hold',
  auditPlatformAdminAccess('admin.event.payouts.hold', 'hold_payout', resolveOrganizationIdForEvent),
  asyncHandler(async (req, res) => {
    const result = await adminService.holdEventPayout(req.params['eventId']!, req.user!.id);
    res.status(200).json(result);
  }),
);

router.delete(
  '/events/:eventId/payouts/hold',
  auditPlatformAdminAccess('admin.event.payouts.hold', 'unhold_payout', resolveOrganizationIdForEvent),
  asyncHandler(async (req, res) => {
    const result = await adminService.unholdEventPayout(req.params['eventId']!);
    res.status(200).json(result);
  }),
);

router.post(
  '/events/:eventId/unpublish',
  auditPlatformAdminAccess('admin.event.unpublish', 'unpublish_event', resolveOrganizationIdForEvent),
  asyncHandler(async (req, res) => {
    const result = await adminService.unpublishEvent(req.params['eventId']!);
    res.status(200).json(result);
  }),
);

router.post(
  '/organizations/:organizationId/approve',
  auditPlatformAdminAccess('admin.organization.approve', 'approve_organization'),
  asyncHandler(async (req, res) => {
    const result = await adminService.approveOrganization(req.params['organizationId']!);
    res.status(200).json(result);
  }),
);

export default router;
