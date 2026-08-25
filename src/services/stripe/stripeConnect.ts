import type Stripe from 'stripe';
import { stripeClient } from './stripeClient';

export interface CreateConnectedAccountInput {
  email: string | null;
}

export async function createConnectedAccount(input: CreateConnectedAccountInput): Promise<Stripe.Account> {
  const params: Stripe.AccountCreateParams = {
    // Modern equivalent of the legacy `type: 'express'` shorthand — recent
    // API versions require the loss/fee responsibilities to be declared
    // explicitly on account creation rather than inferred from `type`.
    controller: {
      stripe_dashboard: { type: 'express' },
      fees: { payer: 'application' },
      // Stripe requires the platform (not Stripe) to control losses when
      // stripe_dashboard.type is 'express'.
      losses: { payments: 'application' },
    },
    capabilities: {
      card_payments: { requested: true },
      transfers: { requested: true },
    },
    // Deferred payout, per the brief: funds must stay on the organizer's
    // Stripe balance until Intahe explicitly triggers a Payout (48h after
    // the event ends — see payoutService.ts), not on whatever cadence
    // Stripe's own default schedule would otherwise use. Without this, a
    // newly connected account defaults to automatic payouts and starts
    // moving money to the organizer's bank before the event is even over.
    settings: {
      payouts: {
        schedule: { interval: 'manual' },
      },
    },
  };
  if (input.email) {
    params.email = input.email;
  }
  return stripeClient.accounts.create(params);
}

export interface CreateAccountLinkInput {
  accountId: string;
  refreshUrl: string;
  returnUrl: string;
}

export async function createAccountLink(input: CreateAccountLinkInput): Promise<Stripe.AccountLink> {
  return stripeClient.accountLinks.create({
    account: input.accountId,
    refresh_url: input.refreshUrl,
    return_url: input.returnUrl,
    type: 'account_onboarding',
  });
}

export async function retrieveAccount(accountId: string): Promise<Stripe.Account> {
  return stripeClient.accounts.retrieve(accountId);
}

/** Used by the payout-schedule backfill script for accounts connected
 * before manual payout scheduling became the default at account creation
 * (see createConnectedAccount above). */
export async function setAccountPayoutScheduleToManual(accountId: string): Promise<Stripe.Account> {
  return stripeClient.accounts.update(accountId, {
    settings: { payouts: { schedule: { interval: 'manual' } } },
  });
}
