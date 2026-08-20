-- Up Migration

-- Discovery is opt-in per event: the organizer decides whether an event
-- shows up in the public "near me" browse/search surface. This is
-- independent from `status = 'published'` — a published-but-not-discoverable
-- event still works via a direct link (checkout already supports guest
-- purchases), it just won't appear in search/browse results.
ALTER TABLE events
  ADD COLUMN is_public_discoverable boolean NOT NULL DEFAULT false;

CREATE INDEX events_discoverable_idx
  ON events (status, is_public_discoverable)
  WHERE status = 'published' AND is_public_discoverable = true;

-- Down Migration

DROP INDEX events_discoverable_idx;

ALTER TABLE events
  DROP COLUMN is_public_discoverable;
