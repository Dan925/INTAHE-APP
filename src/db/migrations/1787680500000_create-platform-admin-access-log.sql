-- Up Migration

-- Append-only, same convention as organizer_payouts: application code never
-- updates or deletes a row here, only inserts. A platform admin reading or
-- changing a client organization's financial data must leave a permanent
-- trace of who, when, which organization, and what — this table exists for
-- that, and only that; it is not a general-purpose application log.
CREATE TABLE platform_admin_access_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_user_id uuid NOT NULL REFERENCES users (id),
  -- Nullable: some admin views (e.g. the cross-organization payout
  -- overview) aren't scoped to one organization at all.
  organization_id uuid REFERENCES organizations (id),
  -- What was accessed (e.g. 'admin.payouts.overview', 'admin.event.unpublish')
  -- and what happened ('view', 'trigger_payout', 'hold_payout',
  -- 'unhold_payout', 'approve_organization', 'unpublish_event') — two
  -- separate free-text fields rather than one, so both are independently
  -- queryable ("show me every write action" / "show me every access to
  -- organization X") without parsing a combined string.
  resource text NOT NULL,
  action text NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX platform_admin_access_log_admin_user_id_idx ON platform_admin_access_log (admin_user_id);
CREATE INDEX platform_admin_access_log_organization_id_idx ON platform_admin_access_log (organization_id);
CREATE INDEX platform_admin_access_log_occurred_at_idx ON platform_admin_access_log (occurred_at);

-- Down Migration

DROP TABLE platform_admin_access_log;
