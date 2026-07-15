-- Up Migration

-- Stripe recommends caching charges_enabled from account.updated webhooks
-- rather than polling the Accounts API on every checkout. Having a
-- connected account isn't the same as being able to accept charges on it —
-- onboarding can be started and abandoned, so checkout must know whether
-- the account is actually ready before attempting a destination charge.
ALTER TABLE organizations
  ADD COLUMN stripe_charges_enabled boolean NOT NULL DEFAULT false;

-- Down Migration

ALTER TABLE organizations
  DROP COLUMN stripe_charges_enabled;
