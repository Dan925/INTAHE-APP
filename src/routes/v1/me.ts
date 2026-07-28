import { Router } from 'express';
import { requireAuth } from '../../middleware/auth';
import * as memberService from '../../services/organizationMembers/organizationMemberService';
import { asyncHandler } from '../../utils/asyncHandler';

const router = Router();

router.use(requireAuth);

router.get(
  '/invites',
  asyncHandler(async (req, res) => {
    const invites = await memberService.listPendingInvitesForUser(req.user!.id);
    res.status(200).json({ items: invites });
  }),
);

export default router;
