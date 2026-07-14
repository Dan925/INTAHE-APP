-- Up Migration

CREATE TABLE transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES orders (id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('charge', 'refund', 'payout')),
  amount_cents integer NOT NULL,
  stripe_object_id text,
  occurred_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX transactions_order_id_idx ON transactions (order_id);

-- Down Migration

DROP TABLE transactions;
