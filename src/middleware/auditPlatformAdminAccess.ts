import type { Request, RequestHandler } from 'express';
import { pool } from '../config/database';

/**
 * Logs the access itself, at the moment it's authorized — not conditioned
 * on what the underlying handler goes on to do or whether it succeeds.
 * Mount after requirePlatformAdmin on every admin route, with a resource
 * label identifying that route and an action describing what kind of
 * access it is ('view' for every read; a specific verb for each of the
 * few write actions the admin console has). Insert-only — see
 * platform_admin_access_log's migration for why this table is never
 * updated or deleted from.
 *
 * resolveOrganizationId defaults to reading :organizationId straight off
 * the URL, which works for org-scoped admin routes. Event-scoped routes
 * (no :organizationId in their path) pass their own resolver that looks
 * the event's organization up first, so the log still records which
 * organization's data was touched.
 */
export function auditPlatformAdminAccess(
  resource: string,
  action: string,
  resolveOrganizationId: (req: Request) => Promise<string | null> = async (req) =>
    req.params['organizationId'] ?? null,
): RequestHandler {
  return (req, _res, next) => {
    resolveOrganizationId(req)
      .then((organizationId) =>
        pool.query(
          `INSERT INTO platform_admin_access_log (admin_user_id, organization_id, resource, action)
           VALUES ($1, $2, $3, $4)`,
          [req.user!.id, organizationId, resource, action],
        ),
      )
      .then(() => next())
      .catch(next);
  };
}

export async function resolveOrganizationIdForEvent(req: Request): Promise<string | null> {
  const eventId = req.params['eventId'];
  if (!eventId) return null;
  const result = await pool.query<{ organization_id: string }>(`SELECT organization_id FROM events WHERE id = $1`, [
    eventId,
  ]);
  return result.rows[0]?.organization_id ?? null;
}
