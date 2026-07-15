import type Stripe from 'stripe';
import { stripeClient } from './stripeClient';

export interface CreateRefundInput {
  paymentIntentId: string;
  amountCents: number;
  // Only meaningful for a Connect destination charge: pulls the refunded
  // amount back from the connected account's balance and returns Intahe's
  // application fee for that portion, instead of the platform silently
  // eating the loss.
  reverseTransfer: boolean;
}

export async function createRefund(input: CreateRefundInput): Promise<Stripe.Refund> {
  return stripeClient.refunds.create({
    payment_intent: input.paymentIntentId,
    amount: input.amountCents,
    ...(input.reverseTransfer ? { reverse_transfer: true, refund_application_fee: true } : {}),
  });
}
