-- Up Migration

-- Cent-accurate reconciliation of *why* Intahe's commission was or wasn't
-- refunded needs the fact recorded per refund event, not just per order:
-- an order can carry several partial refunds over time (see
-- orderService.refundOrder), and while today's product rule ties the
-- fee-reversal decision to the order's refund_reason, the transaction
-- ledger is where future accounting will actually reconcile amounts —
-- so the fact lives here too, alongside the refund it describes. NULL for
-- non-refund transaction rows (charge, payout), where it has no meaning.
ALTER TABLE transactions ADD COLUMN application_fee_refunded boolean;

-- Down Migration

ALTER TABLE transactions DROP COLUMN application_fee_refunded;
