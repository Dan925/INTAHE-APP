-- Up Migration

-- Optional, per-organization sales tax (e.g. TPS 5% + TVQ 9.975%). Empty
-- array (the default) means no tax is charged — every existing
-- organization keeps today's behavior with no code change required.
-- Multiple lines rather than one combined rate because several provinces
-- (Quebec notably) require GST/QST to be itemized separately on a
-- receipt, not shown as one blended percentage. Each entry is
-- { label: string, rate_percent: number } — see src/utils/fees.ts.
ALTER TABLE organizations ADD COLUMN tax_lines jsonb NOT NULL DEFAULT '[]'::jsonb;

-- Snapshotted onto the order/sale at the moment it's charged (same
-- reasoning as order_line_items snapshotting ticket_types, or quick_sales
-- snapshotting quick_sale_items): an organization's tax_lines can change
-- over time (a new province added, a rate change), and a past order's
-- receipt must always reflect what was actually charged, not today's
-- configuration. tax_lines here stores each applied line plus its
-- resulting amount_cents; tax_cents is their sum, kept as its own column
-- so it's cheap to read without parsing the jsonb (mirrors why
-- subtotal_cents/total_cents are their own columns instead of being
-- derived from order_line_items every time).
ALTER TABLE orders ADD COLUMN tax_cents integer NOT NULL DEFAULT 0;
ALTER TABLE orders ADD COLUMN tax_lines jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE quick_sales ADD COLUMN tax_cents integer NOT NULL DEFAULT 0;
ALTER TABLE quick_sales ADD COLUMN tax_lines jsonb NOT NULL DEFAULT '[]'::jsonb;

-- Down Migration

ALTER TABLE quick_sales DROP COLUMN tax_lines;
ALTER TABLE quick_sales DROP COLUMN tax_cents;

ALTER TABLE orders DROP COLUMN tax_lines;
ALTER TABLE orders DROP COLUMN tax_cents;

ALTER TABLE organizations DROP COLUMN tax_lines;
