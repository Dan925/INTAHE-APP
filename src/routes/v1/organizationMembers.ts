import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../../middleware/auth';
import { requireOrgRole } from '../../middleware/requireOrgRole';
import * as memberService from '../../services/organizationMembers/organizationMemberService';
import { asyncHandler } from '../../utils/asyncHandler';
import { parseLimit } from '../../utils/pagination';
import { validateBody } from '../../utils/validate';

const router = Router({ mergeParams: true });

router.use(requireAuth);

const invitableRoleSchema = z.enum(['admin', 'staff', 'volunteer']);

const inviteSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  role: invitableRoleSchema,
});

router.post(
  '/invite',
  requireOrgRole('admin'),
  validateBody(inviteSchema),
  asyncHandler(async (req, res) => {
    const member = await memberService.inviteMember(req.params['organizationId']!, req.body);
    res.status(201).json({ member });
  }),
);

// Not gated by requireOrgRole: the invitee isn't an accepted member yet,
// which is exactly the condition that middleware requires to pass.
router.post(
  '/accept',
  asyncHandler(async (req, res) => {
    const member = await memberService.acceptInvite(req.params['organizationId']!, req.user!.id);
    res.status(200).json({ member });
  }),
);

router.get(
  '/',
  requireOrgRole('admin'),
  asyncHandler(async (req, res) => {
    const cursor = typeof req.query['cursor'] === 'string' ? req.query['cursor'] : undefined;
    const limit = parseLimit(req.query['limit']);
    const page = await memberService.listMembers(req.params['organizationId']!, cursor, limit);
    res.status(200).json(page);
  }),
);

const updateRoleSchema = z.object({
  role: invitableRoleSchema,
});

router.patch(
  '/:memberId',
  requireOrgRole('admin'),
  validateBody(updateRoleSchema),
  asyncHandler(async (req, res) => {
    const member = await memberService.updateMemberRole(
      req.params['organizationId']!,
      req.params['memberId']!,
      req.body.role,
    );
    res.status(200).json({ member });
  }),
);

router.delete(
  '/:memberId',
  requireOrgRole('admin'),
  asyncHandler(async (req, res) => {
    await memberService.removeMember(req.params['organizationId']!, req.params['memberId']!);
    res.status(204).send();
  }),
);

export default router;
