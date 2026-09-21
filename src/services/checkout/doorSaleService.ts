import crypto from 'node:crypto';
import * as eventService from '../events/eventService';
import * as checkoutService from './checkoutService';
import type { CheckoutLineItemInput, CheckoutResult } from './checkoutService';

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
 */
export async function createDoorSale(
  organizationId: string,
  eventId: string,
  input: CreateDoorSaleInput,
): Promise<CheckoutResult> {
  await eventService.getEvent(organizationId, eventId);
  return checkoutService.createOrder(eventId, null, crypto.randomUUID(), { ...input, in_person: true });
}
