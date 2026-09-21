-- Up Migration

-- The "quick sale" module: a lightweight, event-less way for an
-- organization to charge a card for a fixed-price product/service (e.g. a
-- barbershop's haircut) — deliberately separate from events/ticket_types/
-- orders rather than shoehorned into them, so nothing here can ever affect
-- ticketing's own tables, queries, or invariants. See checkoutService.ts
-- for the closely-mirrored (but event-scoped) equivalent.
CREATE TABLE quick_sale_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations (id),
  name text NOT NULL,
  price_cents integer NOT NULL CHECK (price_cents > 0),
  currency text NOT NULL DEFAULT 'usd',
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX quick_sale_items_organization_id_idx ON quick_sale_items (organization_id) WHERE deleted_at IS NULL;

-- One row per charge attempt. item_name/price are snapshotted from
-- quick_sale_items at sale time (same reasoning as order_line_items
-- snapshotting ticket_types) so a later catalog edit or deletion never
-- changes the historical record of what was actually sold and charged.
--
-- payout_status is tracked per sale, not swept in a batch like
-- organizer_payouts — the brief calls for an *instant* payout attempt
-- right after each sale (not a 48h-deferred, event-scoped sweep), so
-- there's no natural batching unit here the way "an event's accumulated
-- balance" is for ticketing.
CREATE TABLE quick_sales (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations (id),
  quick_sale_item_id uuid REFERENCES quick_sale_items (id),
  item_name text NOT NULL,
  subtotal_cents integer NOT NULL,
  stripe_fee_cents integer NOT NULL,
  intahe_fee_cents integer NOT NULL,
  total_cents integer NOT NULL,
  currency text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'failed')),
  stripe_payment_intent_id text,
  payout_status text NOT NULL DEFAULT 'not_attempted'
    CHECK (payout_status IN ('not_attempted', 'succeeded', 'failed')),
  stripe_payout_id text,
  payout_error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX quick_sales_organization_id_idx ON quick_sales (organization_id);

-- Mirrors orders.stripe_payment_intent_id's role: the webhook handler looks
-- up the quick_sales row by this id when payment_intent.succeeded arrives,
-- and this also makes the same idempotency-by-PaymentIntent guarantee
-- checkoutService relies on impossible to violate for quick sales too.
CREATE UNIQUE INDEX quick_sales_stripe_payment_intent_id_idx
  ON quick_sales (stripe_payment_intent_id)
  WHERE stripe_payment_intent_id IS NOT NULL;

-- Down Migration

DROP TABLE quick_sales;
DROP TABLE quick_sale_items;
