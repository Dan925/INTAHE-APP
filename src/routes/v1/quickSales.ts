import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../../middleware/auth';
import { requireOrgRole } from '../../middleware/requireOrgRole';
import * as quickSaleItemService from '../../services/quickSales/quickSaleItemService';
import * as quickSaleService from '../../services/quickSales/quickSaleService';
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

export default router;
