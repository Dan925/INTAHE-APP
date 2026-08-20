import jwt from 'jsonwebtoken';
import jwksClient from 'jwks-rsa';
import { env } from '../../config/env';

const allowedAudiences = env.APPLE_CLIENT_IDS.split(',')
  .map((id) => id.trim())
  .filter(Boolean);

// jwks-rsa caches Apple's signing keys in memory and re-fetches on a
// key-id miss, so this is safe to build once at module load rather than
// per request.
const client = jwksClient({ jwksUri: 'https://appleid.apple.com/auth/keys' });

function getSigningKey(header: jwt.JwtHeader, callback: jwt.SigningKeyCallback): void {
  if (!header.kid) {
    callback(new Error('Apple identity token header is missing a key id.'));
    return;
  }
  client.getSigningKey(header.kid, (err, key) => {
    if (err || !key) {
      callback(err ?? new Error('No matching Apple signing key found.'));
      return;
    }
    callback(null, key.getPublicKey());
  });
}

export interface AppleIdTokenPayload {
  sub: string;
  email: string;
  emailVerified: boolean;
}

/**
 * Verifies signature, expiry, issuer, and audience against Apple's own
 * public keys — throws on anything invalid. Mirrors verifyGoogleIdToken:
 * the one place that touches the network, everything else in the Apple
 * sign-in flow is pure DB/business logic and can be tested by mocking this.
 *
 * Apple never includes the user's name in the identity token — it's handed
 * to the client separately, and only on the very first authorization — so
 * callers that need it must accept it from the client as a separate field.
 */
export async function verifyAppleIdToken(identityToken: string): Promise<AppleIdTokenPayload> {
  const payload = await new Promise<jwt.JwtPayload>((resolve, reject) => {
    jwt.verify(
      identityToken,
      getSigningKey,
      {
        algorithms: ['RS256'],
        issuer: 'https://appleid.apple.com',
        audience: allowedAudiences as [string, ...string[]],
      },
      (err: jwt.VerifyErrors | null, decoded: jwt.JwtPayload | string | undefined) => {
        if (err || !decoded || typeof decoded === 'string') {
          reject(err ?? new Error('Apple identity token did not decode to an object payload.'));
          return;
        }
        resolve(decoded);
      },
    );
  });

  const sub = payload.sub;
  const email = typeof payload['email'] === 'string' ? payload['email'] : undefined;
  if (!sub || !email) {
    throw new Error('Apple identity token payload is missing required claims.');
  }

  // Apple encodes this as a real boolean for native (Sign in with Apple JS
  // sends a string "true"/"false" instead) — accept either shape.
  const emailVerifiedClaim = payload['email_verified'];
  const emailVerified = emailVerifiedClaim === true || emailVerifiedClaim === 'true';

  return { sub, email, emailVerified };
}
