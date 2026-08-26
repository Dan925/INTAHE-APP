-- Up Migration

-- Tracks the exact failure mode this table exists to catch: Stripe reports a
-- PaymentIntent as succeeded (real money moved) while the corresponding
-- order is still 'pending' in this database (no tickets issued) — which
-- means the usual payment_intent.succeeded webhook either never arrived or
-- was misconfigured (see docs/stripe-connect-runbook.md). One row per
-- detection; resolved_at/resolved_by/resolution record how it stopped being
-- open, whether that's an admin manually reissuing tickets or the webhook
-- eventually catching up on its own (a late retry from Stripe).
CREATE TABLE payment_reconciliation_incidents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES orders (id),
  stripe_payment_intent_id text NOT NULL,
  amount_cents integer NOT NULL,
  detected_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  resolved_by uuid REFERENCES users (id),
  -- 'manual_reissue' (a platform admin used the reconciliation action) or
  -- 'webhook_caught_up' (the order left 'pending' on its own before any
  -- admin acted — e.g. a delayed Stripe webhook retry finally arrived).
  resolution text,
  CONSTRAINT payment_reconciliation_incidents_resolution_check
    CHECK (resolution IS NULL OR resolution IN ('manual_reissue', 'webhook_caught_up'))
);

-- Enforces "one open incident per order" — the sweep re-checks every order
-- already carrying an open incident on each tick (see
-- paymentReconciliationService.ts) rather than ever inserting a second one
-- for the same still-unresolved order.
CREATE UNIQUE INDEX payment_reconciliation_incidents_open_order_idx
  ON payment_reconciliation_incidents (order_id)
  WHERE resolved_at IS NULL;

CREATE INDEX payment_reconciliation_incidents_order_id_idx ON payment_reconciliation_incidents (order_id);

-- Down Migration

DROP TABLE payment_reconciliation_incidents;
