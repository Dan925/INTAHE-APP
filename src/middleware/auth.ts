import type { RequestHandler } from 'express';
import { ApiError } from '../utils/errors';
import { verifyAccessToken } from '../utils/jwt';

export const requireAuth: RequestHandler = (req, _res, next) => {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    next(new ApiError(401, 'unauthorized', 'Missing or invalid Authorization header.', null));
    return;
  }

  const token = header.slice('Bearer '.length);
  try {
    const payload = verifyAccessToken(token);
    req.user = { id: payload.sub, email: payload.email };
    next();
  } catch {
    next(new ApiError(401, 'unauthorized', 'Invalid or expired token.', null));
  }
};

// For routes reachable by guests (e.g. checkout): attach req.user when a
// valid token is present, otherwise proceed as a guest instead of rejecting.
export const optionalAuth: RequestHandler = (req, _res, next) => {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    next();
    return;
  }

  const token = header.slice('Bearer '.length);
  try {
    const payload = verifyAccessToken(token);
    req.user = { id: payload.sub, email: payload.email };
  } catch {
    // An invalid/expired token on an optional-auth route just means "guest".
  }
  next();
};
