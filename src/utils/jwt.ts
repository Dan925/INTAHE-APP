import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';

export interface AccessTokenPayload {
  sub: string;
  email: string;
  // Random per token — lets POST /v1/auth/logout revoke this exact token
  // server-side without needing to touch every other token the same user
  // has issued (other devices/tabs stay logged in). See
  // services/auth/tokenRevocationService.ts.
  jti: string;
}

// jsonwebtoken adds `exp` (unix seconds) automatically from the `expiresIn`
// option passed to sign() below — not part of the payload we construct
// ourselves, but always present on a verified token.
export interface VerifiedAccessToken extends AccessTokenPayload {
  exp: number;
}

export function signAccessToken(payload: { sub: string; email: string }): string {
  return jwt.sign({ ...payload, jti: crypto.randomUUID() }, env.JWT_SECRET, {
    expiresIn: env.JWT_EXPIRES_IN,
  } as jwt.SignOptions);
}

export function verifyAccessToken(token: string): VerifiedAccessToken {
  return jwt.verify(token, env.JWT_SECRET) as VerifiedAccessToken;
}
