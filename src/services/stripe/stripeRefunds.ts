import type Stripe from 'stripe';
import { stripeClient } from './stripeClient';
import type { StripeChargeMode } from '../../types/db';

export interface CreateRefundInput {
  paymentIntentId: string;
  amountCents: number;
  chargeMode: StripeChargeMode;
  // Required (and must be the organization's connected account) when
  // chargeMode is 'direct'; ignored otherwise.
  connectedAccountId: string | null;
  // Whether this refund reverses Intahe's application fee, decided by the
  // caller from the order's refund reason (see orderService.refundOrder) —
  // never inferred here. Silently ignored for 'platform' orders: they were
  // never charged through Connect, so there is no application fee object to
  // reverse in the first place.
  refundApplicationFee: boolean;
}

export async function createRefund(input: CreateRefundInput): Promise<Stripe.Refund> {
  const params: Stripe.RefundCreateParams = {
    payment_intent: input.paymentIntentId,
    amount: input.amountCents,
  };
  const options: Stripe.RequestOptions = {};

  if (input.chargeMode === 'direct') {
    // The PaymentIntent already lives in the connected account's own
    // Stripe context, so the refund must be created there too. There is no
    // platform-side Transfer to reverse the way a destination charge has —
    // the connected account's balance is debited directly by Stripe — so
    // the only thing left to decide is whether Intahe's application fee
    // comes back to the buyer.
    if (!input.connectedAccountId) {
      throw new Error("createRefund: chargeMode is 'direct' but no connectedAccountId was provided.");
    }
    options.stripeAccount = input.connectedAccountId;
    if (input.refundApplicationFee) {
      params.refund_application_fee = true;
    }
  } else if (input.chargeMode === 'destination') {
    // Legacy shape, kept only for orders created before the direct-charge
    // migration: the PaymentIntent is on the platform account, and
    // reversing the fee also means reversing the Transfer that originally
    // moved funds to the connected account.
    if (input.refundApplicationFee) {
      params.reverse_transfer = true;
      params.refund_application_fee = true;
    }
  }
  // 'platform' mode: plain charge, no Connect involved — nothing to
  // reverse regardless of refundApplicationFee.

  return stripeClient.refunds.create(params, options);
}
