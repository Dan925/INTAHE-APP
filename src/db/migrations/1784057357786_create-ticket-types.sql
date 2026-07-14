-- Up Migration

CREATE TABLE ticket_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES events (id) ON DELETE CASCADE,
  name text NOT NULL,
  price_cents integer NOT NULL CHECK (price_cents >= 0),
  currency text NOT NULL DEFAULT 'usd',
  quantity_total integer NOT NULL CHECK (quantity_total >= 0),
  quantity_sold integer NOT NULL DEFAULT 0 CHECK (quantity_sold >= 0),
  sale_starts_at timestamptz,
  sale_ends_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ticket_types_sold_within_total CHECK (quantity_sold <= quantity_total)
);

CREATE INDEX ticket_types_event_id_idx ON ticket_types (event_id);

-- Down Migration

DROP TABLE ticket_types;
