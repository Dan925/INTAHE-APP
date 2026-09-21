import type Stripe from 'stripe';
import { stripeClient } from './stripeClient';

/**
 * Called by the mobile app's StripeTerminalProvider tokenProvider whenever
 * the SDK needs a fresh connection token to talk to a reader. Scoped to the
 * organization's own connected account — a physical reader connects
 * directly into that account's Terminal session, never the platform's.
 */
export async function createConnectionToken(connectedAccountId: string): Promise<Stripe.Terminal.ConnectionToken> {
  return stripeClient.terminal.connectionTokens.create({}, { stripeAccount: connectedAccountId });
}

export interface CreateTerminalLocationInput {
  displayName: string;
  address: {
    line1: string;
    line2?: string | undefined;
    city: string;
    state?: string | undefined;
    postalCode: string;
    country: string;
  };
}

/**
 * A reader must be registered to a Location before it can be discovered/
 * connected to (Stripe Terminal's own requirement) — one is created lazily
 * the first time an organization sets up a reader, rather than upfront at
 * organization creation, since most organizations never touch this at all.
 */
export async function createTerminalLocation(
  connectedAccountId: string,
  input: CreateTerminalLocationInput,
): Promise<Stripe.Terminal.Location> {
  return stripeClient.terminal.locations.create(
    {
      display_name: input.displayName,
      address: {
        line1: input.address.line1,
        city: input.address.city,
        postal_code: input.address.postalCode,
        country: input.address.country,
        ...(input.address.line2 !== undefined ? { line2: input.address.line2 } : {}),
        ...(input.address.state !== undefined ? { state: input.address.state } : {}),
      },
    },
    { stripeAccount: connectedAccountId },
  );
}
