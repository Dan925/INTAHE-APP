import { pool } from '../../config/database';
import { ApiError } from '../../utils/errors';
import { buildPage, decodeCursor, encodeCursor, type CursorPage } from '../../utils/pagination';
import type { Role } from '../../types/roles';
import type { OrganizationMemberRow, UserRow } from '../../types/db';

export type InvitableRole = Exclude<Role, 'owner'>;

export interface InviteMemberInput {
  email: string;
  role: InvitableRole;
}

export interface PublicMember {
  id: string;
  user_id: string;
  email: string;
  full_name: string;
  role: Role;
  invited_at: string | null;
  accepted_at: string | null;
}

interface MemberJoinFields {
  id: string;
  user_id: string;
  role: Role;
  invited_at: Date | null;
  accepted_at: Date | null;
  email: string;
  full_name: string;
}

function toPublicMember(row: MemberJoinFields): PublicMember {
  return {
    id: row.id,
    user_id: row.user_id,
    email: row.email,
    full_name: row.full_name,
    role: row.role,
    invited_at: row.invited_at ? row.invited_at.toISOString() : null,
    accepted_at: row.accepted_at ? row.accepted_at.toISOString() : null,
  };
}

async function getActiveUserByEmail(email: string): Promise<UserRow | undefined> {
  const result = await pool.query<UserRow>(
    `SELECT * FROM users WHERE lower(email) = lower($1) AND deleted_at IS NULL`,
    [email],
  );
  return result.rows[0];
}

export async function inviteMember(organizationId: string, input: InviteMemberInput): Promise<PublicMember> {
  const user = await getActiveUserByEmail(input.email);
  if (!user) {
    throw new ApiError(404, 'invitee_not_found', 'No Intahe account exists for this email yet.', 'email');
  }

  const existingResult = await pool.query<OrganizationMemberRow>(
    `SELECT * FROM organization_members WHERE organization_id = $1 AND user_id = $2`,
    [organizationId, user.id],
  );
  const existing = existingResult.rows[0];
  if (existing) {
    if (existing.accepted_at) {
      throw new ApiError(
        409,
        'already_a_member',
        'This user is already a member of the organization.',
        'email',
      );
    }
    throw new ApiError(409, 'invite_already_pending', 'An invite is already pending for this user.', 'email');
  }

  const insertResult = await pool.query<OrganizationMemberRow>(
    `INSERT INTO organization_members (organization_id, user_id, role, invited_at)
     VALUES ($1, $2, $3, now())
     RETURNING *`,
    [organizationId, user.id, input.role],
  );
  const member = insertResult.rows[0];
  if (!member) {
    throw new Error('Insert into organization_members did not return a row.');
  }

  return toPublicMember({ ...member, email: user.email, full_name: user.full_name });
}

export async function acceptInvite(organizationId: string, userId: string): Promise<PublicMember> {
  const result = await pool.query<OrganizationMemberRow>(
    `UPDATE organization_members SET accepted_at = now()
     WHERE organization_id = $1 AND user_id = $2 AND accepted_at IS NULL
     RETURNING *`,
    [organizationId, userId],
  );
  const member = result.rows[0];
  if (!member) {
    throw new ApiError(404, 'invite_not_found', 'No pending invite found for this organization.', null);
  }

  const userResult = await pool.query<UserRow>(`SELECT * FROM users WHERE id = $1`, [userId]);
  const user = userResult.rows[0];
  if (!user) {
    throw new Error('Accepted invite references a user that no longer exists.');
  }

  return toPublicMember({ ...member, email: user.email, full_name: user.full_name });
}

export async function listMembers(
  organizationId: string,
  cursor: string | undefined,
  limit: number,
): Promise<CursorPage<PublicMember>> {
  const decoded = cursor ? decodeCursor(cursor) : null;

  const result = await pool.query<MemberJoinFields & { cursor_created_at: string }>(
    `SELECT om.id, om.user_id, om.role, om.invited_at, om.accepted_at,
            u.email, u.full_name, om.created_at::text AS cursor_created_at
     FROM organization_members om
     JOIN users u ON u.id = om.user_id
     WHERE om.organization_id = $1
       AND (
         $2::timestamptz IS NULL
         OR (om.created_at, om.id) < ($2::timestamptz, $3::uuid)
       )
     ORDER BY om.created_at DESC, om.id DESC
     LIMIT $4`,
    [organizationId, decoded?.createdAt ?? null, decoded?.id ?? null, limit + 1],
  );

  return buildPage(result.rows, limit, toPublicMember, (row) => encodeCursor(row.cursor_created_at, row.id));
}

async function getMemberInOrganization(organizationId: string, memberId: string): Promise<OrganizationMemberRow> {
  const result = await pool.query<OrganizationMemberRow>(
    `SELECT * FROM organization_members WHERE id = $1 AND organization_id = $2`,
    [memberId, organizationId],
  );
  const member = result.rows[0];
  if (!member) {
    throw new ApiError(404, 'member_not_found', 'Member not found.', null);
  }
  return member;
}

export async function updateMemberRole(
  organizationId: string,
  memberId: string,
  role: InvitableRole,
): Promise<PublicMember> {
  const existing = await getMemberInOrganization(organizationId, memberId);
  if (existing.role === 'owner') {
    throw new ApiError(400, 'cannot_modify_owner', "The organization's owner role can't be changed here.", null);
  }

  const result = await pool.query<OrganizationMemberRow>(
    `UPDATE organization_members SET role = $1 WHERE id = $2 RETURNING *`,
    [role, memberId],
  );
  const updated = result.rows[0];
  if (!updated) {
    throw new Error('Update to organization_members did not return a row.');
  }

  const userResult = await pool.query<UserRow>(`SELECT * FROM users WHERE id = $1`, [updated.user_id]);
  const user = userResult.rows[0];
  if (!user) {
    throw new Error('Updated member references a user that no longer exists.');
  }

  return toPublicMember({ ...updated, email: user.email, full_name: user.full_name });
}

export async function removeMember(organizationId: string, memberId: string): Promise<void> {
  const existing = await getMemberInOrganization(organizationId, memberId);
  if (existing.role === 'owner') {
    throw new ApiError(400, 'cannot_remove_owner', 'Every organization must have exactly one owner.', null);
  }

  await pool.query(`DELETE FROM organization_members WHERE id = $1`, [memberId]);
}
