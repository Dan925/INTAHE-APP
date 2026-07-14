import type { Role } from './roles';

export type AuthProvider = 'email' | 'google';

export interface UserRow {
  id: string;
  email: string;
  password_hash: string | null;
  auth_provider: AuthProvider;
  full_name: string;
  phone: string | null;
  avatar_url: string | null;
  created_at: Date;
  deleted_at: Date | null;
}

export interface PasswordResetTokenRow {
  id: string;
  user_id: string;
  token_hash: string;
  expires_at: Date;
  used_at: Date | null;
  created_at: Date;
}

export interface OrganizationRow {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  contact_email: string | null;
  stripe_account_id: string | null;
  created_at: Date;
  deleted_at: Date | null;
}

export interface OrganizationMemberRow {
  id: string;
  organization_id: string;
  user_id: string;
  role: Role;
  invited_at: Date | null;
  accepted_at: Date | null;
  created_at: Date;
}

export type EventStatus = 'draft' | 'published' | 'cancelled' | 'completed';

export interface EventRow {
  id: string;
  organization_id: string;
  name: string;
  description: string | null;
  description_ai_generated: boolean;
  start_at: Date;
  end_at: Date;
  address: string | null;
  latitude: string | null;
  longitude: string | null;
  cover_image_url: string | null;
  status: EventStatus;
  capacity: number | null;
  fees_absorbed_by_organizer: boolean;
  created_at: Date;
  deleted_at: Date | null;
}
