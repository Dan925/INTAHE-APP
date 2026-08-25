import type { Request, RequestHandler, Response } from 'express';
import { rateLimit } from 'express-rate-limit';
import { env } from '../config/env';

// Matches the app-wide error envelope from utils/errors.ts / errorHandler.ts
// ({ error: { code, message, field } }) instead of express-rate-limit's
// default plain-text body. Retry-After is already set by express-rate-limit
// itself before this runs (standardHeaders: true below), so there's nothing
// left to add here.
function sendRateLimited(_req: Request, res: Response): void {
  res.status(429).json({
    error: {
      code: 'rate_limited',
      message: 'Too many requests. Please try again later.',
      field: null,
    },
  });
}

/**
 * Limits requests by client IP. Relies on `app.set('trust proxy', 1)` (set
 * in app.ts) to resolve the real client IP from the single X-Forwarded-For
 * hop Render's reverse proxy adds — express-rate-limit validates this
 * itself at request time and throws if trust proxy is unset while
 * X-Forwarded-For is present, or if it's `true` (which would let a client
 * spoof its own apparent IP via that header and bypass this entirely).
 */
export function createIpRateLimiter(windowMs: number, limit: number): RequestHandler {
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: true,
    legacyHeaders: false,
    handler: sendRateLimited,
  });
}

/**
 * Limits requests by a target identifier read from the request (email,
 * buyer_email, ...) rather than by IP, so an attack spread across many IPs
 * against a single account/address is still throttled. Requests where the
 * identifier isn't readable (e.g. failed body parsing) skip this limiter —
 * the IP-keyed limiter above still applies regardless, and the route's own
 * validation rejects the malformed request on its own terms.
 */
export function createTargetRateLimiter(
  windowMs: number,
  limit: number,
  getTarget: (req: Request) => string | undefined,
): RequestHandler {
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => getTarget(req) === undefined,
    keyGenerator: (req) => getTarget(req) as string,
    handler: sendRateLimited,
  });
}

const passThrough: RequestHandler = (_req, _res, next) => next();

// Gates the app-wired limiters below on env.RATE_LIMIT_ENABLED (off by
// default under NODE_ENV=test — see config/env.ts). Deliberately NOT used
// by createIpRateLimiter/createTargetRateLimiter themselves, so unit tests
// that build their own small-limit probe apps from those factories still
// enforce regardless of NODE_ENV.
function wired(limiter: RequestHandler): RequestHandler {
  return env.RATE_LIMIT_ENABLED ? limiter : passThrough;
}

function bodyEmail(req: Request): string | undefined {
  const value = (req.body as Record<string, unknown> | undefined)?.['email'];
  return typeof value === 'string' ? value.trim().toLowerCase() : undefined;
}

// Checkout's field is buyer_email, not email — the auth routes' bodyEmail
// helper above doesn't apply here.
function bodyBuyerEmail(req: Request): string | undefined {
  const value = (req.body as Record<string, unknown> | undefined)?.['buyer_email'];
  return typeof value === 'string' ? value.trim().toLowerCase() : undefined;
}

// Ticket lookup no longer takes buyer_email (see utils/ticketAccessToken.ts —
// it's a 32-byte token now, not brute-forceable by rate limiting or
// otherwise), so the "target identifier" dimension here keys on the order
// being looked up instead — still useful defense-in-depth against one order
// being hammered from many IPs, distinct from the IP-keyed limiter above.
function paramsOrderId(req: Request): string | undefined {
  const value = req.params['orderId'];
  return typeof value === 'string' ? value : undefined;
}

export const loginRateLimitByIp = wired(createIpRateLimiter(env.AUTH_RATE_LIMIT_WINDOW_MS, env.AUTH_RATE_LIMIT_MAX));
export const loginRateLimitByEmail = wired(
  createTargetRateLimiter(env.AUTH_RATE_LIMIT_WINDOW_MS, env.AUTH_RATE_LIMIT_MAX, bodyEmail),
);

export const signupRateLimitByIp = wired(createIpRateLimiter(env.AUTH_RATE_LIMIT_WINDOW_MS, env.AUTH_RATE_LIMIT_MAX));
export const signupRateLimitByEmail = wired(
  createTargetRateLimiter(env.AUTH_RATE_LIMIT_WINDOW_MS, env.AUTH_RATE_LIMIT_MAX, bodyEmail),
);

export const passwordResetRequestRateLimitByIp = wired(
  createIpRateLimiter(env.AUTH_RATE_LIMIT_WINDOW_MS, env.AUTH_RATE_LIMIT_MAX),
);
export const passwordResetRequestRateLimitByEmail = wired(
  createTargetRateLimiter(env.AUTH_RATE_LIMIT_WINDOW_MS, env.AUTH_RATE_LIMIT_MAX, bodyEmail),
);

export const ticketLookupRateLimitByIp = wired(
  createIpRateLimiter(env.TICKET_LOOKUP_RATE_LIMIT_WINDOW_MS, env.TICKET_LOOKUP_RATE_LIMIT_MAX),
);
export const ticketLookupRateLimitByOrder = wired(
  createTargetRateLimiter(env.TICKET_LOOKUP_RATE_LIMIT_WINDOW_MS, env.TICKET_LOOKUP_RATE_LIMIT_MAX, paramsOrderId),
);

export const confirmationRateLimitByIp = wired(
  createIpRateLimiter(env.CONFIRMATION_RATE_LIMIT_WINDOW_MS, env.CONFIRMATION_RATE_LIMIT_MAX),
);
export const confirmationRateLimitByOrder = wired(
  createTargetRateLimiter(env.CONFIRMATION_RATE_LIMIT_WINDOW_MS, env.CONFIRMATION_RATE_LIMIT_MAX, paramsOrderId),
);

export const checkoutRateLimitByIp = wired(
  createIpRateLimiter(env.CHECKOUT_RATE_LIMIT_WINDOW_MS, env.CHECKOUT_RATE_LIMIT_MAX),
);
export const checkoutRateLimitByEmail = wired(
  createTargetRateLimiter(env.CHECKOUT_RATE_LIMIT_WINDOW_MS, env.CHECKOUT_RATE_LIMIT_MAX, bodyBuyerEmail),
);
