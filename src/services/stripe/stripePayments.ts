import type Stripe from 'stripe';
import { stripeClient } from './stripeClient';

export interface CreatePaymentIntentInput {
  amountCents: number;
  currency: string;
  orderId: string;
  destinationAccountId?: string | null | undefined;
  applicationFeeCents?: number | undefined;
}

export async function createPaymentIntent(input: CreatePaymentIntentInput): Promise<Stripe.PaymentIntent> {
  const params: Stripe.PaymentIntentCreateParams = {
    amount: input.amountCents,
    currency: input.currency,
    metadata: { order_id: input.orderId },
  };

  // Stripe Connect destination charge: the connected organization receives
  // the funds, Intahe's cut is carved out via application_fee_amount. If the
  // organization hasn't connected a Stripe account yet, fall back to a plain
  // charge on the platform account (the brief allows a simplified mode to
  // start validating before every organizer is onboarded to Connect).
  if (input.destinationAccountId) {
    params.transfer_data = { destination: input.destinationAccountId };
    if (input.applicationFeeCents !== undefined) {
      params.application_fee_amount = input.applicationFeeCents;
    }
  }

  return stripeClient.paymentIntents.create(params);
}

export async function retrievePaymentIntent(id: string): Promise<Stripe.PaymentIntent> {
  return stripeClient.paymentIntents.retrieve(id);
}
