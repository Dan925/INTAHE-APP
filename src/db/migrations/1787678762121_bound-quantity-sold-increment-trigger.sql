-- Up Migration

-- Backstop against a runaway/bug pushing quantity_sold up by an
-- implausible amount in a single write — without the fatal flaw of the
-- "quantity_sold <= quantity_total" CHECK constraint this codebase used
-- to have (dropped in 1787673829827_drop-ticket-types-sold-within-total-
-- and-add-overshoot-incidents.sql): that constraint gated the CUMULATIVE
-- value, so legitimate late-payment overshoots
-- (orderReleaseService.reReserveAfterLatePayment — "payment always wins")
-- would eventually exhaust any margin added on top of quantity_total, and
-- once exhausted, the next genuinely-paid order would be silently
-- rejected — reproducing the exact bug that got the plain CHECK dropped
-- in the first place, just delayed and much harder to diagnose.
--
-- This trigger instead bounds the DELTA of a single UPDATE, not the
-- cumulative total. It never accumulates against past legitimate
-- incidents — each write is judged only against itself — so there is no
-- exhaustion failure mode: "did this one write add an implausible
-- amount," not "has this ticket type had too many incidents over its
-- lifetime."
--
-- MAX_SINGLE_INCREMENT (500) is sized against MAX_QUANTITY_PER_ORDER, the
-- application-level per-order ticket quantity cap enforced in
-- src/routes/v1/checkout.ts (20 by default as of this migration).
-- reReserveAfterLatePayment processes exactly one order's line items per
-- call, so no legitimate single write can ever increase a ticket type's
-- quantity_sold by more than that order cap allows — 20, or a small
-- multiple of it in the (currently unreachable, since checkout also caps
-- quantity per line item) worst case of many line items for the same
-- ticket type in one order. 500 leaves a >20x safety margin above that
-- real ceiling — comfortably impossible for any real order to hit — while
-- still catching a genuine runaway (a loop bug, a bad bulk UPDATE, a
-- fat-fingered manual query) long before it does real damage.
--
-- This bound is NOT wired to MAX_QUANTITY_PER_ORDER programmatically — a
-- Postgres trigger can't read the Node process's env config, and
-- shouldn't try to (a backstop that trusts the same config the code it's
-- backstopping trusts isn't much of a backstop). If MAX_QUANTITY_PER_ORDER
-- is ever raised substantially, revisit this constant too; keeping them
-- coherent is a manual invariant, documented here and in env.ts.
CREATE FUNCTION ticket_types_bound_quantity_sold_increment() RETURNS trigger AS $$
DECLARE
  max_single_increment CONSTANT integer := 500;
  increment integer := NEW.quantity_sold - OLD.quantity_sold;
BEGIN
  IF increment > max_single_increment THEN
    RAISE EXCEPTION
      'quantity_sold for ticket_type % increased by % in one write, over the % limit — refused as a probable runaway/bug, not a legitimate late-payment overshoot (see this trigger''s definition for the reasoning)',
      NEW.id, increment, max_single_increment;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER ticket_types_bound_quantity_sold_increment
  BEFORE UPDATE ON ticket_types
  FOR EACH ROW
  WHEN (NEW.quantity_sold > OLD.quantity_sold)
  EXECUTE FUNCTION ticket_types_bound_quantity_sold_increment();

-- Down Migration

DROP TRIGGER ticket_types_bound_quantity_sold_increment ON ticket_types;
DROP FUNCTION ticket_types_bound_quantity_sold_increment();
