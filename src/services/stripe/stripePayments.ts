import type Stripe from 'stripe';
import { env } from '../../config/env';
import { buildStatementDescriptorSuffix } from '../../utils/statementDescriptor';
import { stripeClient } from './stripeClient';

export interface CreatePaymentIntentInput {
  amountCents: number;
  currency: string;
  orderId: string;
  connectedAccountId?: string | null | undefined;
  applicationFeeCents?: number | undefined;
  // The event's own name, so the buyer's bank statement shows what they
  // actually bought instead of just "INTAHE" — see ../../utils/
  // statementDescriptor.ts. Optional because not every caller has an event
  // name handy (e.g. it isn't needed to retrieve/refund an existing
  // PaymentIntent), and buildStatementDescriptorSuffix itself can still
  // decide there's nothing usable to send.
  eventName?: string | undefined;
}

export async function createPaymentIntent(input: CreatePaymentIntentInput): Promise<Stripe.PaymentIntent> {
  const params: Stripe.PaymentIntentCreateParams = {
    amount: input.amountCents,
    currency: input.currency,
    metadata: { order_id: input.orderId },
  };
  const options: Stripe.RequestOptions = {};

  // Stripe Connect direct charge: the PaymentIntent is created directly in
  // the connected organization's own Stripe context (the `stripeAccount`
  // request option below) rather than on the platform account — the charge
  // belongs to the organizer from the moment it's created, and the
  // platform's balance is never touched. Intahe's cut is still carved out
  // via application_fee_amount, which works the same way for both charge
  // shapes. If the organization hasn't connected (or finished onboarding)
  // a Stripe account, fall back to a plain charge on the platform account
  // (the brief allows a simplified mode to start validating before every
  // organizer is onboarded to Connect).
  if (input.connectedAccountId) {
    options.stripeAccount = input.connectedAccountId;
    if (input.applicationFeeCents !== undefined) {
      params.application_fee_amount = input.applicationFeeCents;
    }
  }

  if (input.eventName) {
    const suffix = buildStatementDescriptorSuffix(input.eventName);
    if (suffix) {
      params.statement_descriptor_suffix = suffix;
    }
  }

  // Above the configured threshold, request 3D Secure explicitly rather
  // than leaving it to Stripe's automatic, risk-based decision — a
  // higher-value order is a more attractive chargeback target, so the
  // extra buyer friction is worth it. Below the threshold, omit the option
  // entirely so Stripe's own (regulatorily-required, e.g. EU/UK SCA)
  // automatic behavior is untouched.
  if (input.amountCents >= env.THREE_D_SECURE_THRESHOLD_CENTS) {
    params.payment_method_options = {
      card: { request_three_d_secure: 'any' },
    };
  }

  return stripeClient.paymentIntents.create(params, options);
}

/**
 * connectedAccountId must be omitted (or null) for a 'platform' or legacy
 * 'destination' order — both have their PaymentIntent on the platform
 * account — and must be the organization's stripe_account_id for a
 * 'direct' order, whose PaymentIntent lives in the connected account's own
 * context. See checkoutService.connectedAccountIdForOrder, the one place
 * that decides which of these applies for a given order.
 */
export async function retrievePaymentIntent(
  id: string,
  connectedAccountId?: string | null,
): Promise<Stripe.PaymentIntent> {
  const options: Stripe.RequestOptions = connectedAccountId ? { stripeAccount: connectedAccountId } : {};
  return stripeClient.paymentIntents.retrieve(id, undefined, options);
}
