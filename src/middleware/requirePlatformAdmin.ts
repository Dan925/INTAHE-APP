import type { RequestHandler } from 'express';
import { pool } from '../config/database';
import { ApiError } from '../utils/errors';

/**
 * Cross-organization admin access. Looked up fresh from the DB on every
 * request rather than trusted from the JWT — is_platform_admin is only
 * ever changed by a direct SQL statement (see the migration that added
 * it), and a request-time lookup means revoking it takes effect
 * immediately rather than waiting for every existing token to expire.
 */
export const requirePlatformAdmin: RequestHandler = (req, _res, next) => {
  if (!req.user) {
    next(new ApiError(403, 'forbidden', 'Platform admin access required.', null));
    return;
  }

  pool
    .query<{ is_platform_admin: boolean }>(`SELECT is_platform_admin FROM users WHERE id = $1`, [req.user.id])
    .then((result) => {
      if (!result.rows[0]?.is_platform_admin) {
        next(new ApiError(403, 'forbidden', 'Platform admin access required.', null));
        return;
      }
      next();
    })
    .catch(next);
};
