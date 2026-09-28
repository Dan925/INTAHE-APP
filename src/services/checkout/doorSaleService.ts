import crypto from 'node:crypto';
import * as eventService from '../events/eventService';
import * as checkoutService from './checkoutService';
import type { CheckoutLineItemInput, CheckoutRequestContext, CheckoutResult } from './checkoutService';

export interface CreateDoorSaleInput {
  buyer_email: string;
  line_items: CheckoutLineItemInput[];
}

/**
 * A door sale is a merchant-present, staff-initiated charge on a physical
 * Stripe Terminal reader — same reasoning as quickSaleService's own
 * "deliberately no idempotency-key handling" comment applies here too, so a
 * fresh key is generated per call rather than asking door staff to supply
 * one the way the public checkout route requires of a buyer's own device.
 *
 * requestContext is the staff device's IP/user agent, not the attendee's
 * own — same limitation as any in-person point-of-sale receipt. The
 * legal-acceptance record checkoutService.createOrder logs for this order
 * still applies (the attendee is still buying a ticket, just in person),
 * it's just attributed to whoever's phone/tablet the staff member is using.
 */
export async function createDoorSale(
  organizationId: string,
  eventId: string,
  input: CreateDoorSaleInput,
  requestContext: CheckoutRequestContext,
): Promise<CheckoutResult> {
  await eventService.getEvent(organizationId, eventId);
  return checkoutService.createOrder(
    eventId,
    null,
    crypto.randomUUID(),
    { ...input, in_person: true },
    requestContext,
  );
}
