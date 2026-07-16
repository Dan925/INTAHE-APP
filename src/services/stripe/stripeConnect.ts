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
      losses: { payments: 'stripe' },
    },
    capabilities: {
      card_payments: { requested: true },
      transfers: { requested: true },
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
