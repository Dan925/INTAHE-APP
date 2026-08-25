import type Stripe from 'stripe';
import { stripeClient } from './stripeClient';

/**
 * A connected account's Stripe balance is not segmented by event or order —
 * it is one running total per currency. Used both by the deferred-payout
 * worker (payoutService.ts) to decide how much is available to pay out, and
 * by the organizer-facing balance display (task: dashboard payout UI).
 */
export async function retrieveBalance(connectedAccountId: string): Promise<Stripe.Balance> {
  return stripeClient.balance.retrieve(undefined, { stripeAccount: connectedAccountId });
}

export interface CreatePayoutInput {
  connectedAccountId: string;
  amountCents: number;
  currency: string;
}

/**
 * Only reachable at all if the connected account's payout schedule is
 * 'manual' — see stripeConnect.createConnectedAccount and the backfill
 * script for existing accounts. On a Stripe account still on an automatic
 * schedule, this competes with Stripe's own scheduled payouts rather than
 * replacing them, defeating the "funds stay put until 48h after the event"
 * guarantee.
 */
export async function createPayout(input: CreatePayoutInput): Promise<Stripe.Payout> {
  return stripeClient.payouts.create(
    { amount: input.amountCents, currency: input.currency },
    { stripeAccount: input.connectedAccountId },
  );
}
