import { apiRequest } from '@/lib/api';

export type MemberRole = 'owner' | 'admin' | 'staff' | 'volunteer';
export type InvitableRole = Exclude<MemberRole, 'owner'>;

export interface Member {
  id: string;
  user_id: string;
  email: string;
  full_name: string;
  role: MemberRole;
  invited_at: string | null;
  accepted_at: string | null;
}

interface CursorPage<T> {
  items: T[];
  next_cursor: string | null;
}

export function listMembers(token: string, organizationId: string): Promise<CursorPage<Member>> {
  return apiRequest(`/v1/organizations/${organizationId}/members`, { token });
}

export function inviteMember(
  token: string,
  organizationId: string,
  input: { email: string; role: InvitableRole },
): Promise<{ member: Member }> {
  return apiRequest(`/v1/organizations/${organizationId}/members/invite`, {
    method: 'POST',
    body: input,
    token,
  });
}

export function updateMemberRole(
  token: string,
  organizationId: string,
  memberId: string,
  role: InvitableRole,
): Promise<{ member: Member }> {
  return apiRequest(`/v1/organizations/${organizationId}/members/${memberId}`, {
    method: 'PATCH',
    body: { role },
    token,
  });
}

export function removeMember(token: string, organizationId: string, memberId: string): Promise<void> {
  return apiRequest(`/v1/organizations/${organizationId}/members/${memberId}`, {
    method: 'DELETE',
    token,
  });
}

export interface PendingInvite {
  id: string;
  organization_id: string;
  organization_name: string;
  organization_slug: string;
  role: MemberRole;
  invited_at: string | null;
}

export function listPendingInvites(token: string): Promise<{ items: PendingInvite[] }> {
  return apiRequest('/v1/me/invites', { token });
}

export function acceptInvite(token: string, organizationId: string): Promise<{ member: Member }> {
  return apiRequest(`/v1/organizations/${organizationId}/members/accept`, {
    method: 'POST',
    token,
  });
}
