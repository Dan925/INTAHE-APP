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

  // TEMPORARY diagnostic: a persistent "no signatures found" in production
  // despite a confirmed-correct secret means something differs between what
  // the dashboard shows and what this process actually read from the
  // environment at boot — log shape/length only, never the secret itself.
  console.log(
    'STRIPE_WEBHOOK_SECRET diagnostic:',
    JSON.stringify({
      rawLength: env.STRIPE_WEBHOOK_SECRET.length,
      rawFirst6: env.STRIPE_WEBHOOK_SECRET.slice(0, 6),
      rawLast6: env.STRIPE_WEBHOOK_SECRET.slice(-6),
      parsedCount: secrets.length,
      parsedShapes: secrets.map((s) => ({ length: s.length, first6: s.slice(0, 6), last4: s.slice(-4) })),
    }),
  );

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
