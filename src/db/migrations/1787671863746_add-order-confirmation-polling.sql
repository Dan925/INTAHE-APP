-- Up Migration

-- Set once, alongside ticket_access_token_hash, when the
-- payment_intent.succeeded webhook issues an order's tickets. Anchors the
-- confirmation-polling route's retrieval window (see
-- CONFIRMATION_TOKEN_WINDOW_MINUTES) — separate from created_at, which is
-- order-creation time, not payment-confirmation time.
ALTER TABLE orders
  ADD COLUMN tickets_issued_at timestamptz;

-- A second, independent access-token hash from ticket_access_token_hash
-- (the one carried by the confirmation email): minted by
-- GET /v1/events/:eventId/orders/:orderId/confirmation the first time it's
-- polled after tickets exist, and never again for that order — this column
-- being non-null IS the "already retrieved" marker. Two hash columns
-- rather than a token table: this endpoint only ever needs to hand out at
-- most one token, once, so there's nothing a multi-row model would buy.
ALTER TABLE orders
  ADD COLUMN confirmation_token_hash text;

-- Down Migration
ALTER TABLE orders
  DROP COLUMN confirmation_token_hash;
ALTER TABLE orders
  DROP COLUMN tickets_issued_at;
