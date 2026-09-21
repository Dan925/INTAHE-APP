-- Up Migration

-- A Stripe Terminal reader (e.g. a WisePOS E) must be registered to a
-- Stripe Terminal "Location" before it can be connected to and used for a
-- card-present Quick Sale — see quickSaleReaderService.ts. One location per
-- organization is created lazily, on first reader setup, under that
-- organization's own connected account (never the platform account).
ALTER TABLE organizations ADD COLUMN stripe_terminal_location_id text;

-- Down Migration

ALTER TABLE organizations DROP COLUMN stripe_terminal_location_id;
