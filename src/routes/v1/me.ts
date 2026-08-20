import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../../middleware/auth';
import * as authService from '../../services/auth/authService';
import * as memberService from '../../services/organizationMembers/organizationMemberService';
import { asyncHandler } from '../../utils/asyncHandler';
import { validateBody } from '../../utils/validate';

const router = Router();

router.use(requireAuth);

router.get(
  '/invites',
  asyncHandler(async (req, res) => {
    const invites = await memberService.listPendingInvitesForUser(req.user!.id);
    res.status(200).json({ items: invites });
  }),
);

const deleteAccountSchema = z.object({
  password: z.string().min(1).optional(),
});

router.delete(
  '/',
  validateBody(deleteAccountSchema),
  asyncHandler(async (req, res) => {
    const { password } = req.body as z.infer<typeof deleteAccountSchema>;
    await authService.deleteOwnAccount(req.user!.id, password);
    res.status(204).send();
  }),
);

export default router;
