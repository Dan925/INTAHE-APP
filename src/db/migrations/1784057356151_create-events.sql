-- Up Migration

CREATE TABLE events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  description_ai_generated boolean NOT NULL DEFAULT false,
  start_at timestamptz NOT NULL,
  end_at timestamptz NOT NULL,
  address text,
  latitude numeric(9, 6),
  longitude numeric(9, 6),
  cover_image_url text,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'cancelled', 'completed')),
  capacity integer CHECK (capacity IS NULL OR capacity >= 0),
  fees_absorbed_by_organizer boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  CONSTRAINT events_end_after_start CHECK (end_at > start_at)
);

CREATE INDEX events_organization_id_idx ON events (organization_id);
CREATE INDEX events_status_idx ON events (status);

-- Down Migration

DROP TABLE events;
