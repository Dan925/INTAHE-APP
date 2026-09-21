import { pool } from '../../config/database';
import { ApiError } from '../../utils/errors';
import type { QuickSaleItemRow } from '../../types/db';

export interface CreateQuickSaleItemInput {
  name: string;
  price_cents: number;
  currency?: string | undefined;
}

export interface PublicQuickSaleItem {
  id: string;
  organization_id: string;
  name: string;
  price_cents: number;
  currency: string;
  created_at: string;
}

function toPublic(row: QuickSaleItemRow): PublicQuickSaleItem {
  return {
    id: row.id,
    organization_id: row.organization_id,
    name: row.name,
    price_cents: row.price_cents,
    currency: row.currency,
    created_at: row.created_at.toISOString(),
  };
}

function notFound(): ApiError {
  return new ApiError(404, 'quick_sale_item_not_found', 'Quick sale item not found.', null);
}

export async function createQuickSaleItem(
  organizationId: string,
  input: CreateQuickSaleItemInput,
): Promise<PublicQuickSaleItem> {
  const result = await pool.query<QuickSaleItemRow>(
    `INSERT INTO quick_sale_items (organization_id, name, price_cents, currency)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [organizationId, input.name, input.price_cents, input.currency ?? 'cad'],
  );
  const row = result.rows[0];
  if (!row) {
    throw new Error('Insert into quick_sale_items did not return a row.');
  }
  return toPublic(row);
}

export async function listQuickSaleItems(organizationId: string): Promise<PublicQuickSaleItem[]> {
  const result = await pool.query<QuickSaleItemRow>(
    `SELECT * FROM quick_sale_items WHERE organization_id = $1 AND deleted_at IS NULL ORDER BY created_at DESC`,
    [organizationId],
  );
  return result.rows.map(toPublic);
}

/** Used internally by quickSaleService to snapshot name/price at sale time — not exposed as a route. */
export async function getActiveQuickSaleItem(
  organizationId: string,
  quickSaleItemId: string,
): Promise<QuickSaleItemRow> {
  const result = await pool.query<QuickSaleItemRow>(
    `SELECT * FROM quick_sale_items WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL`,
    [quickSaleItemId, organizationId],
  );
  const row = result.rows[0];
  if (!row) {
    throw notFound();
  }
  return row;
}

// Soft delete, matching events/organizations' own convention — a deleted
// catalog item must stay resolvable by its id for quick_sales rows that
// already reference it (see quick_sales.item_name/price snapshot columns,
// which exist precisely so a deletion here never corrupts past records).
export async function deleteQuickSaleItem(organizationId: string, quickSaleItemId: string): Promise<void> {
  const result = await pool.query(
    `UPDATE quick_sale_items SET deleted_at = now() WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL`,
    [quickSaleItemId, organizationId],
  );
  if (result.rowCount === 0) {
    throw notFound();
  }
}
