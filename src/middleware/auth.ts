import type { RequestHandler } from 'express';
import { ApiError } from '../utils/errors';
import { verifyAccessToken } from '../utils/jwt';
import { isTokenRevoked } from '../services/auth/tokenRevocationService';
import { asyncHandler } from '../utils/asyncHandler';

export const requireAuth: RequestHandler = asyncHandler(async (req, _res, next) => {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    next(new ApiError(401, 'unauthorized', 'Missing or invalid Authorization header.', null));
    return;
  }

  const token = header.slice('Bearer '.length);
  let payload;
  try {
    payload = verifyAccessToken(token);
  } catch {
    next(new ApiError(401, 'unauthorized', 'Invalid or expired token.', null));
    return;
  }

  if (await isTokenRevoked(payload.jti)) {
    next(new ApiError(401, 'unauthorized', 'Invalid or expired token.', null));
    return;
  }

  req.user = { id: payload.sub, email: payload.email };
  req.tokenJti = payload.jti;
  req.tokenExp = payload.exp;
  next();
});

// For routes reachable by guests (e.g. checkout): attach req.user when a
// valid, non-revoked token is present, otherwise proceed as a guest
// instead of rejecting.
export const optionalAuth: RequestHandler = asyncHandler(async (req, _res, next) => {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    next();
    return;
  }

  const token = header.slice('Bearer '.length);
  try {
    const payload = verifyAccessToken(token);
    if (!(await isTokenRevoked(payload.jti))) {
      req.user = { id: payload.sub, email: payload.email };
      req.tokenJti = payload.jti;
      req.tokenExp = payload.exp;
    }
  } catch {
    // An invalid/expired token on an optional-auth route just means "guest".
  }
  next();
});
