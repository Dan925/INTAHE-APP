import type { RequestHandler } from 'express';
import { pool } from '../config/database';
import { ApiError } from '../utils/errors';
import { roleAtLeast, type Role } from '../types/roles';

// A single generic message covers both "this organization doesn't exist"
// and "you're not a member of it" so a 403 here never confirms whether the
// resource exists in some other organization.
function forbidden(): ApiError {
  return new ApiError(403, 'forbidden', 'You do not have access to this resource.', null);
}

export function requireOrgRole(minRole: Role): RequestHandler {
  return (req, _res, next) => {
    const organizationId = req.params['organizationId'];
    if (!req.user || !organizationId) {
      next(forbidden());
      return;
    }

    pool
      .query<{ role: Role }>(
        `SELECT om.role
         FROM organization_members om
         JOIN organizations o ON o.id = om.organization_id
         WHERE om.organization_id = $1
           AND om.user_id = $2
           AND om.accepted_at IS NOT NULL
           AND o.deleted_at IS NULL`,
        [organizationId, req.user.id],
      )
      .then((result) => {
        const membership = result.rows[0];
        if (!membership || !roleAtLeast(membership.role, minRole)) {
          next(forbidden());
          return;
        }
        req.membership = { organizationId, role: membership.role };
        next();
      })
      .catch(next);
  };
}
