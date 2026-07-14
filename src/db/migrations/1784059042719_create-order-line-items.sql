-- Up Migration

-- Not part of the core schema in the brief, but required to support it:
-- QR codes/tickets are generated at payment confirmation, not at checkout
-- initiation, so we need somewhere to record what was purchased (ticket
-- type + quantity + price at time of sale) before any `tickets` rows exist.
CREATE TABLE order_line_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES orders (id) ON DELETE CASCADE,
  ticket_type_id uuid NOT NULL REFERENCES ticket_types (id) ON DELETE RESTRICT,
  quantity integer NOT NULL CHECK (quantity > 0),
  unit_price_cents integer NOT NULL CHECK (unit_price_cents >= 0),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX order_line_items_order_id_idx ON order_line_items (order_id);
CREATE INDEX order_line_items_ticket_type_id_idx ON order_line_items (ticket_type_id);

-- Down Migration

DROP TABLE order_line_items;
