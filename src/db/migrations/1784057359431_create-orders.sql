-- Up Migration

CREATE TABLE orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES events (id) ON DELETE RESTRICT,
  buyer_user_id uuid REFERENCES users (id) ON DELETE SET NULL,
  buyer_email text NOT NULL,
  stripe_payment_intent_id text,
  subtotal_cents integer NOT NULL CHECK (subtotal_cents >= 0),
  stripe_fee_cents integer NOT NULL DEFAULT 0 CHECK (stripe_fee_cents >= 0),
  intahe_fee_cents integer NOT NULL DEFAULT 0 CHECK (intahe_fee_cents >= 0),
  total_cents integer NOT NULL CHECK (total_cents >= 0),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'refunded', 'partial_refund')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX orders_event_id_idx ON orders (event_id);
CREATE INDEX orders_buyer_user_id_idx ON orders (buyer_user_id);
CREATE UNIQUE INDEX orders_stripe_payment_intent_id_unique
  ON orders (stripe_payment_intent_id)
  WHERE stripe_payment_intent_id IS NOT NULL;

-- Down Migration

DROP TABLE orders;
