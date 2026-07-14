import type Stripe from 'stripe';
import { env } from '../../config/env';
import { stripeClient } from './stripeClient';

export function constructWebhookEvent(rawBody: Buffer, signature: string): Stripe.Event {
  return stripeClient.webhooks.constructEvent(rawBody, signature, env.STRIPE_WEBHOOK_SECRET);
}
