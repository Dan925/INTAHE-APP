-- Up Migration

-- Logs every deferred-payout attempt (and every failure) for an event, per
-- the brief: funds stay on the organizer's Stripe balance until 48h after
-- the event ends, at which point the platform triggers a Payout off that
-- balance to their bank. Not a per-order or per-transaction record — a
-- payout sweeps whatever is currently available on the connected account's
-- Stripe balance, which isn't segmented by event or order, so this table
-- is deliberately its own thing rather than another `transactions` row
-- (which is FK'd NOT NULL to a single order).
--
-- Insert-only audit trail rather than one row updated in place: a failed
-- attempt (e.g. funds still "pending" on Stripe's side, a transient API
-- error) must stay visible as its own logged failure, not be overwritten
-- by the next retry's outcome — "journalise chaque transfert et chaque
-- échec" means every attempt, not just the latest one. The partial unique
-- index below is the only thing that prevents a duplicate real payout: once
-- one row for an event reaches 'succeeded', no further attempt is allowed
-- to reach that state for the same event.
CREATE TABLE organizer_payouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations (id),
  event_id uuid NOT NULL REFERENCES events (id),
  stripe_account_id text NOT NULL,
  -- Captured at row-creation time (event.end_at + 48h) rather than
  -- recomputed from events on every read, so a later edit to the event's
  -- end_at can't silently reschedule a payout attempt that's already in
  -- flight or already logged.
  scheduled_for timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'succeeded', 'failed', 'skipped_no_balance')),
  stripe_payout_id text,
  amount_cents integer,
  currency text,
  attempted_at timestamptz,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX organizer_payouts_event_id_idx ON organizer_payouts (event_id);
CREATE INDEX organizer_payouts_status_scheduled_for_idx ON organizer_payouts (status, scheduled_for);

CREATE UNIQUE INDEX organizer_payouts_one_success_per_event
  ON organizer_payouts (event_id)
  WHERE status = 'succeeded';

-- Down Migration

DROP TABLE organizer_payouts;
