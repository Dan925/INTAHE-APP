import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../../middleware/auth';
import { requireOrgRole } from '../../middleware/requireOrgRole';
import * as dashboardService from '../../services/dashboard/dashboardService';
import * as organizationService from '../../services/organizations/organizationService';
import { asyncHandler } from '../../utils/asyncHandler';
import { parseLimit } from '../../utils/pagination';
import { validateBody } from '../../utils/validate';

const router = Router();

router.use(requireAuth);

const createOrganizationSchema = z.object({
  name: z.string().trim().min(1, 'name is required.'),
  slug: z.string().trim().min(1).optional(),
  logo_url: z.string().url().optional(),
  contact_email: z.string().trim().toLowerCase().email().optional(),
});

router.post(
  '/',
  validateBody(createOrganizationSchema),
  asyncHandler(async (req, res) => {
    const organization = await organizationService.createOrganization(req.user!.id, req.body);
    res.status(201).json({ organization });
  }),
);

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const cursor = typeof req.query['cursor'] === 'string' ? req.query['cursor'] : undefined;
    const limit = parseLimit(req.query['limit']);
    const page = await organizationService.listOrganizationsForUser(req.user!.id, cursor, limit);
    res.status(200).json(page);
  }),
);

router.get(
  '/:organizationId',
  requireOrgRole('volunteer'),
  asyncHandler(async (req, res) => {
    const organization = await organizationService.getOrganization(req.params['organizationId']!);
    res.status(200).json({ organization });
  }),
);

const updateOrganizationSchema = z
  .object({
    name: z.string().trim().min(1).optional(),
    logo_url: z.string().url().nullable().optional(),
    contact_email: z.string().trim().toLowerCase().email().nullable().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, { message: 'At least one field must be provided.' });

router.patch(
  '/:organizationId',
  requireOrgRole('admin'),
  validateBody(updateOrganizationSchema),
  asyncHandler(async (req, res) => {
    const organization = await organizationService.updateOrganization(
      req.params['organizationId']!,
      req.body,
    );
    res.status(200).json({ organization });
  }),
);

router.get(
  '/:organizationId/dashboard',
  requireOrgRole('admin'), // "Voir les rapports financiers" — owner/admin only
  asyncHandler(async (req, res) => {
    const dashboard = await dashboardService.getOrganizationDashboard(req.params['organizationId']!);
    res.status(200).json(dashboard);
  }),
);

export default router;
