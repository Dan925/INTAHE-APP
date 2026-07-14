-- Up Migration

-- The brief requires a blocking Idempotency-Key on the order endpoint. The
-- key alone isn't enough to detect misuse (the same key reused with a
-- different request body), so we also store a hash of the canonicalized
-- request to tell a safe retry apart from an accidental key collision.
ALTER TABLE orders
  ADD COLUMN idempotency_key text,
  ADD COLUMN idempotency_request_hash text;

CREATE UNIQUE INDEX orders_idempotency_key_unique
  ON orders (idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- Down Migration

DROP INDEX orders_idempotency_key_unique;

ALTER TABLE orders
  DROP COLUMN idempotency_key,
  DROP COLUMN idempotency_request_hash;
