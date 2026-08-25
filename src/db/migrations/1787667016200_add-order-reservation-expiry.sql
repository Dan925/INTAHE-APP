-- Up Migration

-- Every ticket-type reservation made by createOrder() (quantity_sold
-- incremented immediately, before any payment) needs a deadline so an
-- abandoned checkout doesn't hold inventory forever. NULL for orders that
-- reach a terminal state before this migration mattered to them (paid/
-- refunded/etc. from before this column existed) — the release sweep only
-- ever touches 'pending' orders, so a NULL here is simply never eligible.
ALTER TABLE orders
  ADD COLUMN reservation_expires_at timestamptz;

-- Only pending orders are ever looked up by this column (the release sweep
-- scans for expired-but-still-pending orders); a partial index keeps that
-- scan cheap and avoids indexing the (eventually much larger) set of
-- orders that already reached a terminal status.
CREATE INDEX orders_pending_reservation_expiry_idx
  ON orders (reservation_expires_at)
  WHERE status = 'pending';

-- 'expired': the reservation lapsed (timeout, or an immediate release on
-- payment_intent.canceled/payment_failed) and its inventory was given back.
-- Distinct from 'pending' (still holding inventory) and from the payment
-- outcomes — an 'expired' order can still transition to 'paid' if Stripe
-- confirms the payment late (see markOrderPaidAndIssueTickets's
-- payment-always-wins handling), same as 'pending' can.
ALTER TABLE orders
  DROP CONSTRAINT orders_status_check;

ALTER TABLE orders
  ADD CONSTRAINT orders_status_check
  CHECK (status IN ('pending', 'paid', 'refunded', 'partial_refund', 'expired'));

-- Down Migration

ALTER TABLE orders
  DROP CONSTRAINT orders_status_check;

ALTER TABLE orders
  ADD CONSTRAINT orders_status_check
  CHECK (status IN ('pending', 'paid', 'refunded', 'partial_refund'));

DROP INDEX orders_pending_reservation_expiry_idx;

ALTER TABLE orders
  DROP COLUMN reservation_expires_at;
