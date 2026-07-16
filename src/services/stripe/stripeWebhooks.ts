import type Stripe from 'stripe';
import { env } from '../../config/env';
import { stripeClient } from './stripeClient';

/**
 * Stripe's newer Event Destinations model issues a separate signing secret
 * per destination even when multiple destinations share the same URL (e.g.
 * one scoped to "your account" for payment_intent.succeeded, another scoped
 * to "connected accounts" for account.updated) — so this accepts a
 * comma-separated list and accepts the payload if any of them verify it.
 */
export function constructWebhookEvent(rawBody: Buffer, signature: string): Stripe.Event {
  const secrets = env.STRIPE_WEBHOOK_SECRET.split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  let lastError: unknown;
  for (const secret of secrets) {
    try {
      return stripeClient.webhooks.constructEvent(rawBody, signature, secret);
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError;
}
