-- Up Migration

-- Google's `sub` claim is the durable identifier for a Google account
-- (unlike email, which can theoretically change). Uniqueness is scoped to
-- active users only, mirroring users_email_unique_active, so a soft-deleted
-- account never blocks a fresh signup from reusing the same Google account.
ALTER TABLE users
  ADD COLUMN google_sub text;

CREATE UNIQUE INDEX users_google_sub_unique_active
  ON users (google_sub)
  WHERE google_sub IS NOT NULL AND deleted_at IS NULL;

-- Down Migration

DROP INDEX users_google_sub_unique_active;

ALTER TABLE users
  DROP COLUMN google_sub;
