-- Up Migration

-- Platform-wide (cross-organization) admin access, for the admin console
-- (due/failed payouts, manual payout trigger, organizer approval, event
-- unpublish). Deliberately NOT settable through any application route or
-- script, including by a user who already has it — this column is only
-- ever changed by a direct SQL statement run by whoever operates the
-- database. No API surface should ever write to this column; it is
-- read-only from the application's point of view.
ALTER TABLE users ADD COLUMN is_platform_admin boolean NOT NULL DEFAULT false;

-- Data only — nothing in the application currently gates anything on this
-- value. It exists so the admin console's "approve an organizer" action has
-- somewhere to write to; wiring an actual enforcement point (e.g. blocking
-- ticket sales for an unapproved organization) is a separate, not-yet-made
-- product decision.
ALTER TABLE organizations ADD COLUMN platform_approved_at timestamptz;

-- Lets a platform admin withhold a specific event's payout independently of
-- the normal 48h-after-end_at schedule — payoutService.findDueEvents
-- excludes any event with a non-null payout_held_at. payout_held_by is who
-- placed the hold, for the same accountability reason the access log below
-- exists.
ALTER TABLE events ADD COLUMN payout_held_at timestamptz;
ALTER TABLE events ADD COLUMN payout_held_by uuid REFERENCES users (id);

-- Down Migration

ALTER TABLE events DROP COLUMN payout_held_by;
ALTER TABLE events DROP COLUMN payout_held_at;
ALTER TABLE organizations DROP COLUMN platform_approved_at;
ALTER TABLE users DROP COLUMN is_platform_admin;
