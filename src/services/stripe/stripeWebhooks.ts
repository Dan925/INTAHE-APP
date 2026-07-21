import crypto from 'node:crypto';
import type Stripe from 'stripe';
import { env } from '../../config/env';

// Stripe's own webhooks.constructEvent() was verified, via extensive
// production diagnostics, to reject signatures that an independently
// recomputed HMAC proves are correct for this account's Event Destinations
// (v2.core.event payloads) — the secret, raw body, and timestamp all match,
// yet stripe-node's internal comparison still failed. Verifying the
// signature directly avoids whatever internal quirk causes that, while
// staying algorithmically identical to Stripe's documented scheme:
// https://docs.stripe.com/webhooks/signature
const TOLERANCE_SECONDS = 300;

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

  const headerParts = Object.fromEntries(
    signature.split(',').map((kv) => {
      const [k, v] = kv.split('=');
      return [k, v];
    }),
  );
  const timestamp = headerParts['t'];
  const receivedSignatures = signature
    .split(',')
    .filter((kv) => kv.startsWith('v1='))
    .map((kv) => kv.slice(3));

  if (!timestamp || receivedSignatures.length === 0) {
    throw new Error('Unable to extract timestamp and signatures from Stripe-Signature header.');
  }

  const age = Math.floor(Date.now() / 1000) - parseInt(timestamp, 10);
  if (age > TOLERANCE_SECONDS) {
    throw new Error('Webhook timestamp outside the tolerance zone.');
  }

  const bodyString = rawBody.toString('utf8');
  const signedContent = `${timestamp}.${bodyString}`;

  for (const secret of secrets) {
    const expectedSignature = crypto.createHmac('sha256', secret).update(signedContent, 'utf8').digest('hex');
    if (receivedSignatures.includes(expectedSignature)) {
      return JSON.parse(bodyString) as Stripe.Event;
    }
  }

  throw new Error('Webhook signature verification failed for all configured secrets.');
}
