-- Up Migration

CREATE TABLE organization_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('owner', 'admin', 'staff', 'volunteer')),
  invited_at timestamptz,
  accepted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, user_id)
);

CREATE INDEX organization_members_user_id_idx ON organization_members (user_id);

-- Every organization must have exactly one owner: a partial unique index
-- makes a second "owner" row for the same organization impossible at the DB
-- level, not just in application code.
CREATE UNIQUE INDEX organization_members_one_owner_per_org
  ON organization_members (organization_id)
  WHERE role = 'owner';

-- Down Migration

DROP TABLE organization_members;
