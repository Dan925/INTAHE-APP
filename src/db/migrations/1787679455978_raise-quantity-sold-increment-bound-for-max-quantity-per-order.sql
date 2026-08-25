-- Up Migration

-- Raises the previous migration's trigger bound (500) to stay coupled to
-- MAX_QUANTITY_PER_ORDER after that application-level cap moved from 20
-- to 50: Intahe's target segment (nonprofits with a board, sports
-- leagues, galas, festivals) sells tables of 8-10, and a sponsor buying
-- several tables in one transaction (e.g. 3 tables of 10 = 30) is exactly
-- the purchase this platform wants to support in a single order rather
-- than forcing a split. Inventory-hoarding itself is already covered by
-- reservation expiry and checkout rate limiting (src/middleware/rateLimit.ts) —
-- MAX_QUANTITY_PER_ORDER only bounds a single isolated request, so 50
-- barely moves that calculation versus 20.
--
-- reReserveAfterLatePayment still processes exactly one order's line
-- items per call, so no legitimate single write can increase a ticket
-- type's quantity_sold by more than MAX_QUANTITY_PER_ORDER (50) allows.
-- 1000 keeps the same order of magnitude of safety margin as the
-- previous 500-over-20 (~25x): 1000 is 20x the new 50 ceiling —
-- comfortably impossible for any real order to reach, while still tight
-- enough to catch a genuine runaway (a loop bug, a bad bulk UPDATE, a
-- fat-fingered manual query) long before it does real damage.
--
-- CREATE OR REPLACE FUNCTION rather than DROP/CREATE: the trigger
-- (ticket_types_bound_quantity_sold_increment, from the previous
-- migration) references this function by name only — its signature is
-- unchanged (no arguments, returns trigger), so the trigger definition
-- itself doesn't need to be touched.
CREATE OR REPLACE FUNCTION ticket_types_bound_quantity_sold_increment() RETURNS trigger AS $$
DECLARE
  max_single_increment CONSTANT integer := 1000;
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

-- Down Migration

-- Restores the previous migration's 500 bound (coupled to
-- MAX_QUANTITY_PER_ORDER = 20, which is what a rollback of this migration
-- implies reverting to).
CREATE OR REPLACE FUNCTION ticket_types_bound_quantity_sold_increment() RETURNS trigger AS $$
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
