import { OAuth2Client } from 'google-auth-library';
import { env } from '../../config/env';

const allowedAudiences = env.GOOGLE_OAUTH_CLIENT_IDS.split(',')
  .map((id) => id.trim())
  .filter(Boolean);

const client = new OAuth2Client();

export interface GoogleIdTokenPayload {
  sub: string;
  email: string;
  emailVerified: boolean;
  fullName: string | null;
  avatarUrl: string | null;
}

/**
 * Verifies signature, expiry, issuer, and audience against Google's own
 * public keys — throws on anything invalid. This is the one place that
 * touches the network (fetching Google's JWKS); everything else in the
 * Google sign-in flow is pure DB/business logic and can be tested without
 * real Google credentials by mocking this function.
 */
export async function verifyGoogleIdToken(idToken: string): Promise<GoogleIdTokenPayload> {
  const ticket = await client.verifyIdToken({ idToken, audience: allowedAudiences });
  const payload = ticket.getPayload();
  if (!payload || !payload.sub || !payload.email) {
    throw new Error('Google ID token payload is missing required claims.');
  }

  return {
    sub: payload.sub,
    email: payload.email,
    emailVerified: payload.email_verified ?? false,
    fullName: payload.name ?? null,
    avatarUrl: payload.picture ?? null,
  };
}
