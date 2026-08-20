-- Up Migration

-- Same pattern as users_google_sub_unique_active: Apple's `sub` claim is
-- the durable identifier for an Apple ID (email can be a private relay
-- address and, in theory, could change). Uniqueness scoped to active users
-- only, so a soft-deleted account never blocks reusing the same Apple ID.
ALTER TABLE users
  ADD COLUMN apple_sub text;

CREATE UNIQUE INDEX users_apple_sub_unique_active
  ON users (apple_sub)
  WHERE apple_sub IS NOT NULL AND deleted_at IS NULL;

ALTER TABLE users
  DROP CONSTRAINT users_auth_provider_check;

ALTER TABLE users
  ADD CONSTRAINT users_auth_provider_check
  CHECK (auth_provider IN ('email', 'google', 'apple'));

-- Down Migration

ALTER TABLE users
  DROP CONSTRAINT users_auth_provider_check;

ALTER TABLE users
  ADD CONSTRAINT users_auth_provider_check
  CHECK (auth_provider IN ('email', 'google'));

DROP INDEX users_apple_sub_unique_active;

ALTER TABLE users
  DROP COLUMN apple_sub;
