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
