import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../../middleware/auth';
import { requireOrgRole } from '../../middleware/requireOrgRole';
import * as quickSaleItemService from '../../services/quickSales/quickSaleItemService';
import * as quickSaleService from '../../services/quickSales/quickSaleService';
import * as quickSaleReaderService from '../../services/quickSales/quickSaleReaderService';
import { asyncHandler } from '../../utils/asyncHandler';
import { validateBody } from '../../utils/validate';

const router = Router({ mergeParams: true });

router.use(requireAuth);

const createItemSchema = z.object({
  name: z.string().trim().min(1, 'name is required.'),
  price_cents: z.number().int().min(1),
  currency: z.string().trim().length(3).toLowerCase().optional(),
});

// Catalog management (what a barbershop sells) is an admin action — taking
// an actual sale against that catalog (below) is a lower bar, since that's
// the everyday action a front-desk volunteer needs to perform.
router.post(
  '/quick-sale-items',
  requireOrgRole('admin'),
  validateBody(createItemSchema),
  asyncHandler(async (req, res) => {
    const item = await quickSaleItemService.createQuickSaleItem(req.params['organizationId']!, req.body);
    res.status(201).json({ quick_sale_item: item });
  }),
);

router.get(
  '/quick-sale-items',
  requireOrgRole('volunteer'),
  asyncHandler(async (req, res) => {
    const items = await quickSaleItemService.listQuickSaleItems(req.params['organizationId']!);
    res.status(200).json({ items });
  }),
);

router.delete(
  '/quick-sale-items/:quickSaleItemId',
  requireOrgRole('admin'),
  asyncHandler(async (req, res) => {
    await quickSaleItemService.deleteQuickSaleItem(req.params['organizationId']!, req.params['quickSaleItemId']!);
    res.status(204).send();
  }),
);

const createSaleSchema = z.object({
  quick_sale_item_id: z.string().uuid(),
  in_person: z.boolean().optional(),
});

router.post(
  '/quick-sales',
  requireOrgRole('volunteer'),
  validateBody(createSaleSchema),
  asyncHandler(async (req, res) => {
    const result = await quickSaleService.createQuickSale(req.params['organizationId']!, req.body);
    res.status(201).json(result);
  }),
);

router.get(
  '/quick-sales',
  requireOrgRole('volunteer'),
  asyncHandler(async (req, res) => {
    const items = await quickSaleService.listQuickSales(req.params['organizationId']!);
    res.status(200).json({ items });
  }),
);

// A financial retry action, so pitched at 'admin' rather than the
// 'volunteer' level that's enough to take the original sale.
router.post(
  '/quick-sales/:quickSaleId/retry-payout',
  requireOrgRole('admin'),
  asyncHandler(async (req, res) => {
    const quickSale = await quickSaleService.retryQuickSalePayout(
      req.params['organizationId']!,
      req.params['quickSaleId']!,
    );
    res.status(200).json({ quick_sale: quickSale });
  }),
);

// Fetched fresh by the mobile app every time it needs to (re)connect to a
// reader — a connection token is single-use and short-lived, so there's
// nothing to cache here. Volunteer-level: connecting to a reader is part of
// taking a sale, not managing the organization.
router.post(
  '/quick-sale-reader/connection-token',
  requireOrgRole('volunteer'),
  asyncHandler(async (req, res) => {
    const secret = await quickSaleReaderService.getReaderConnectionTokenSecret(req.params['organizationId']!);
    res.status(200).json({ secret });
  }),
);

router.get(
  '/quick-sale-reader/location',
  requireOrgRole('volunteer'),
  asyncHandler(async (req, res) => {
    const locationId = await quickSaleReaderService.getTerminalLocationId(req.params['organizationId']!);
    res.status(200).json({ location_id: locationId });
  }),
);

const setUpLocationSchema = z.object({
  display_name: z.string().trim().min(1, 'display_name is required.'),
  address: z.object({
    line1: z.string().trim().min(1, 'address.line1 is required.'),
    line2: z.string().trim().optional(),
    city: z.string().trim().min(1, 'address.city is required.'),
    state: z.string().trim().optional(),
    postal_code: z.string().trim().min(1, 'address.postal_code is required.'),
    country: z.string().trim().length(2, 'address.country must be a 2-letter code.').toUpperCase(),
  }),
});

// One-time setup, so pitched at 'admin' rather than the 'volunteer' level
// that's enough to take a sale once a reader is already set up.
router.post(
  '/quick-sale-reader/location',
  requireOrgRole('admin'),
  validateBody(setUpLocationSchema),
  asyncHandler(async (req, res) => {
    const locationId = await quickSaleReaderService.setUpTerminalLocation(req.params['organizationId']!, req.body);
    res.status(201).json({ location_id: locationId });
  }),
);

export default router;
