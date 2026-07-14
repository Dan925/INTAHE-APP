-- Up Migration

CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  password_hash text,
  auth_provider text NOT NULL DEFAULT 'email' CHECK (auth_provider IN ('email', 'google')),
  full_name text NOT NULL,
  phone text,
  avatar_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  CONSTRAINT users_password_required_for_email_provider
    CHECK (auth_provider != 'email' OR password_hash IS NOT NULL)
);

-- Case-insensitive uniqueness, enforced only while the account is active so a
-- deleted user's email can be reused by a new signup.
CREATE UNIQUE INDEX users_email_unique_active
  ON users (lower(email))
  WHERE deleted_at IS NULL;

-- Down Migration

DROP TABLE users;
