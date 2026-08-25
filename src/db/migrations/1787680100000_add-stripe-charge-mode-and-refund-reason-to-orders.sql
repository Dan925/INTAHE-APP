-- Up Migration

-- Records, per order, which Stripe charge shape its PaymentIntent was
-- created under. This is NOT inferrable after the fact from Stripe's side —
-- a destination charge and a direct charge both just look like "a
-- PaymentIntent with an application_fee_amount" once you're looking at
-- historical data, and the two require different API call shapes
-- (transfer_data + platform-account context vs stripeAccount context) for
-- every future operation on that PaymentIntent: retrieval, refunds. Written
-- once at order-creation time by application code and never changed
-- afterwards.
--
-- Three modes, not two, because destination/direct aren't the only charge
-- shapes this app has ever used: an organization with no connected account
-- yet (or one that hasn't finished onboarding) falls back to a plain charge
-- on the platform account with no Connect involvement at all — that
-- fallback predates this migration and stays available.
--   - 'platform'    — plain charge on the platform account, no Connect.
--   - 'destination'  — legacy mode. Every order that existed before this
--                       migration ran used this shape if it had a connected
--                       account, so all of them are backfilled to it below.
--                       New orders never choose this mode again after this
--                       migration ships — it is kept only so refunds on
--                       pre-migration orders keep using the correct
--                       reverse_transfer shape indefinitely.
--   - 'direct'       — the new default for orders on a charges-enabled
--                       connected account, going forward.
ALTER TABLE orders ADD COLUMN stripe_charge_mode text;

UPDATE orders o
SET stripe_charge_mode = CASE
  WHEN o.stripe_payment_intent_id IS NULL THEN 'platform'
  WHEN EXISTS (
    SELECT 1 FROM events e
    JOIN organizations org ON org.id = e.organization_id
    WHERE e.id = o.event_id AND org.stripe_account_id IS NOT NULL
  ) THEN 'destination'
  ELSE 'platform'
END;

ALTER TABLE orders
  ALTER COLUMN stripe_charge_mode SET NOT NULL,
  ADD CONSTRAINT orders_stripe_charge_mode_check
    CHECK (stripe_charge_mode IN ('platform', 'destination', 'direct'));

-- Why the order was refunded, decided by whoever calls the refund endpoint
-- at the moment they call it — never derived afterwards from event status
-- or any other signal, so future accounting can trust it as the actual
-- recorded decision rather than a guess reconstructed from other tables.
-- NULL until the order's first refund. 'event_postponed' is its own reason
-- (not folded into 'organizer_cancellation') so a postponement is
-- distinguishable in reporting even though it is treated identically for
-- the application-fee-reversal rule.
ALTER TABLE orders ADD COLUMN refund_reason text;
ALTER TABLE orders
  ADD CONSTRAINT orders_refund_reason_check
    CHECK (refund_reason IS NULL OR refund_reason IN ('organizer_cancellation', 'buyer_request', 'event_postponed'));

-- Down Migration

ALTER TABLE orders DROP CONSTRAINT orders_refund_reason_check;
ALTER TABLE orders DROP COLUMN refund_reason;
ALTER TABLE orders DROP CONSTRAINT orders_stripe_charge_mode_check;
ALTER TABLE orders DROP COLUMN stripe_charge_mode;
