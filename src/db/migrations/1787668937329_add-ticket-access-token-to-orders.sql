-- Up Migration
ALTER TABLE orders
  ADD COLUMN ticket_access_token_hash text;

-- Down Migration
ALTER TABLE orders
  DROP COLUMN ticket_access_token_hash;
