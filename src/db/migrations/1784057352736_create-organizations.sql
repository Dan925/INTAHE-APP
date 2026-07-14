-- Up Migration

CREATE TABLE organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL,
  logo_url text,
  contact_email text,
  stripe_account_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE UNIQUE INDEX organizations_slug_unique_active
  ON organizations (slug)
  WHERE deleted_at IS NULL;

-- Down Migration

DROP TABLE organizations;
