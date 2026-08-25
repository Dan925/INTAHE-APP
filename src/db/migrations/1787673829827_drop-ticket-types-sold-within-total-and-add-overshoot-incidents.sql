-- Up Migration

-- This constraint silently broke "payment always wins" (see
-- orderReleaseService.reReserveAfterLatePayment): when a late
-- payment_intent.succeeded needed to re-increment quantity_sold past
-- quantity_total (because the released capacity had already been resold
-- to someone else), the UPDATE violated this CHECK, the whole webhook
-- transaction rolled back, and the order was stuck 'expired' forever even
-- though the buyer had genuinely been charged. Every other write path
-- (reserveInventory's atomic conditional UPDATE, writeRelease's decrement)
-- already enforces capacity at the application level and doesn't rely on
-- this constraint, so dropping it only changes behavior for the one path
-- it was silently sabotaging.
ALTER TABLE ticket_types
  DROP CONSTRAINT ticket_types_sold_within_total;

-- Records every time reReserveAfterLatePayment pushes a ticket type over
-- capacity, so the resulting oversell is observable (alerting, an
-- organizer email, a dashboard warning) instead of invisible.
CREATE TABLE capacity_overshoot_incidents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
  event_id uuid NOT NULL REFERENCES events (id) ON DELETE CASCADE,
  ticket_type_id uuid NOT NULL REFERENCES ticket_types (id) ON DELETE CASCADE,
  order_id uuid NOT NULL REFERENCES orders (id) ON DELETE CASCADE,
  quantity_sold integer NOT NULL,
  quantity_total integer NOT NULL,
  overshoot_quantity integer NOT NULL CHECK (overshoot_quantity > 0),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX capacity_overshoot_incidents_event_id_idx ON capacity_overshoot_incidents (event_id);
CREATE INDEX capacity_overshoot_incidents_organization_id_idx ON capacity_overshoot_incidents (organization_id);

-- Down Migration

DROP TABLE capacity_overshoot_incidents;

ALTER TABLE ticket_types
  ADD CONSTRAINT ticket_types_sold_within_total CHECK (quantity_sold <= quantity_total);
