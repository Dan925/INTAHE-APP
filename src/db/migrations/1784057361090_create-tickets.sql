-- Up Migration

CREATE TABLE tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES orders (id) ON DELETE CASCADE,
  ticket_type_id uuid NOT NULL REFERENCES ticket_types (id) ON DELETE RESTRICT,
  qr_code text NOT NULL,
  attendee_name text,
  attendee_email text,
  checked_in_at timestamptz,
  checked_in_by uuid REFERENCES users (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tickets_checked_in_by_requires_checked_in_at
    CHECK (checked_in_by IS NULL OR checked_in_at IS NOT NULL)
);

CREATE UNIQUE INDEX tickets_qr_code_unique ON tickets (qr_code);
CREATE INDEX tickets_order_id_idx ON tickets (order_id);
CREATE INDEX tickets_ticket_type_id_idx ON tickets (ticket_type_id);

-- Down Migration

DROP TABLE tickets;
