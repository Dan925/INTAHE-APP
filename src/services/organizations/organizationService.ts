import type { PoolClient } from 'pg';
import { pool } from '../../config/database';
import { ApiError } from '../../utils/errors';
import { buildPage, decodeCursor, encodeCursor, type CursorPage } from '../../utils/pagination';
import { slugify } from '../../utils/slug';
import type { OrganizationRow } from '../../types/db';

export interface CreateOrganizationInput {
  name: string;
  slug?: string | undefined;
  logo_url?: string | undefined;
  contact_email?: string | undefined;
}

export interface UpdateOrganizationInput {
  name?: string | undefined;
  logo_url?: string | null | undefined;
  contact_email?: string | null | undefined;
}

export interface PublicOrganization {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  contact_email: string | null;
  created_at: string;
}

function toPublicOrganization(row: OrganizationRow): PublicOrganization {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    logo_url: row.logo_url,
    contact_email: row.contact_email,
    created_at: row.created_at.toISOString(),
  };
}

const MAX_SLUG_ATTEMPTS = 50;

async function reserveSlug(client: PoolClient, base: string, explicit: boolean): Promise<string> {
  if (!base) {
    throw new ApiError(400, 'validation_error', 'A usable slug could not be derived from this name.', 'name');
  }

  for (let attempt = 0; attempt < MAX_SLUG_ATTEMPTS; attempt++) {
    const candidate = attempt === 0 ? base : `${base}-${attempt + 1}`;
    const existing = await client.query(
      `SELECT 1 FROM organizations WHERE slug = $1 AND deleted_at IS NULL`,
      [candidate],
    );
    if (existing.rows.length === 0) {
      return candidate;
    }
    if (explicit) {
      throw new ApiError(409, 'slug_already_taken', 'This slug is already in use.', 'slug');
    }
  }

  throw new ApiError(409, 'slug_already_taken', 'Could not find an available slug for this name.', 'slug');
}

export async function createOrganization(
  userId: string,
  input: CreateOrganizationInput,
): Promise<PublicOrganization> {
  const explicitSlug = Boolean(input.slug);
  const base = slugify(input.slug ?? input.name);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const slug = await reserveSlug(client, base, explicitSlug);

    const orgResult = await client.query<OrganizationRow>(
      `INSERT INTO organizations (name, slug, logo_url, contact_email)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [input.name, slug, input.logo_url ?? null, input.contact_email ?? null],
    );
    const org = orgResult.rows[0];
    if (!org) {
      throw new Error('Insert into organizations did not return a row.');
    }

    // Every organization has exactly one owner; the creator becomes that
    // owner and is considered to have already accepted (no self-invite).
    await client.query(
      `INSERT INTO organization_members (organization_id, user_id, role, accepted_at)
       VALUES ($1, $2, 'owner', now())`,
      [org.id, userId],
    );

    await client.query('COMMIT');
    return toPublicOrganization(org);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function getOrganization(organizationId: string): Promise<PublicOrganization> {
  const result = await pool.query<OrganizationRow>(
    `SELECT * FROM organizations WHERE id = $1 AND deleted_at IS NULL`,
    [organizationId],
  );
  const org = result.rows[0];
  if (!org) {
    throw new ApiError(403, 'forbidden', 'You do not have access to this resource.', null);
  }
  return toPublicOrganization(org);
}

export async function updateOrganization(
  organizationId: string,
  patch: UpdateOrganizationInput,
): Promise<PublicOrganization> {
  const fields: Array<[string, unknown]> = [];
  if ('name' in patch) fields.push(['name', patch.name]);
  if ('logo_url' in patch) fields.push(['logo_url', patch.logo_url]);
  if ('contact_email' in patch) fields.push(['contact_email', patch.contact_email]);

  if (fields.length === 0) {
    throw new ApiError(400, 'validation_error', 'At least one field must be provided.', null);
  }

  const setClause = fields.map(([column], i) => `${column} = $${i + 2}`).join(', ');
  const values = fields.map(([, value]) => value);

  const result = await pool.query<OrganizationRow>(
    `UPDATE organizations SET ${setClause} WHERE id = $1 AND deleted_at IS NULL RETURNING *`,
    [organizationId, ...values],
  );
  const org = result.rows[0];
  if (!org) {
    throw new ApiError(403, 'forbidden', 'You do not have access to this resource.', null);
  }
  return toPublicOrganization(org);
}

export async function listOrganizationsForUser(
  userId: string,
  cursor: string | undefined,
  limit: number,
): Promise<CursorPage<PublicOrganization>> {
  const decoded = cursor ? decodeCursor(cursor) : null;

  const result = await pool.query<OrganizationRow & { cursor_created_at: string }>(
    `SELECT o.*, o.created_at::text AS cursor_created_at
     FROM organizations o
     JOIN organization_members om
       ON om.organization_id = o.id
      AND om.user_id = $1
      AND om.accepted_at IS NOT NULL
     WHERE o.deleted_at IS NULL
       AND (
         $2::timestamptz IS NULL
         OR (o.created_at, o.id) < ($2::timestamptz, $3::uuid)
       )
     ORDER BY o.created_at DESC, o.id DESC
     LIMIT $4`,
    [userId, decoded?.createdAt ?? null, decoded?.id ?? null, limit + 1],
  );

  return buildPage(
    result.rows,
    limit,
    toPublicOrganization,
    (row) => encodeCursor(row.cursor_created_at, row.id),
  );
}
