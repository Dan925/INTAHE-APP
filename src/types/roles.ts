export type Role = 'owner' | 'admin' | 'staff' | 'volunteer';

// Every permission in the brief gates at a minimum role in this exact
// hierarchy (owner > admin > staff > volunteer) — there's no permission
// granted to a lower role but withheld from a higher one.
const ROLE_RANK: Record<Role, number> = {
  volunteer: 1,
  staff: 2,
  admin: 3,
  owner: 4,
};

export function roleAtLeast(role: Role, minRole: Role): boolean {
  return ROLE_RANK[role] >= ROLE_RANK[minRole];
}
