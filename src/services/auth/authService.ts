import crypto from 'node:crypto';
import { pool } from '../../config/database';
import { env } from '../../config/env';
import { ApiError } from '../../utils/errors';
import { signAccessToken } from '../../utils/jwt';
import { hashPassword, verifyPassword } from '../../utils/password';
import type { PasswordResetTokenRow, UserRow } from '../../types/db';

export interface SignupInput {
  email: string;
  password: string;
  full_name: string;
  phone?: string | undefined;
}

export interface PublicUser {
  id: string;
  email: string;
  full_name: string;
  phone: string | null;
  avatar_url: string | null;
}

export interface AuthResult {
  user: PublicUser;
  access_token: string;
}

function toPublicUser(row: UserRow): PublicUser {
  return {
    id: row.id,
    email: row.email,
    full_name: row.full_name,
    phone: row.phone,
    avatar_url: row.avatar_url,
  };
}

function hashToken(rawToken: string): string {
  return crypto.createHash('sha256').update(rawToken).digest('hex');
}

async function findActiveUserByEmail(email: string): Promise<UserRow | undefined> {
  const result = await pool.query<UserRow>(
    `SELECT * FROM users WHERE lower(email) = lower($1) AND deleted_at IS NULL`,
    [email],
  );
  return result.rows[0];
}

export async function signup(input: SignupInput): Promise<AuthResult> {
  const existing = await findActiveUserByEmail(input.email);
  if (existing) {
    throw new ApiError(409, 'email_already_registered', 'An account with this email already exists.', 'email');
  }

  const passwordHash = await hashPassword(input.password);
  const result = await pool.query<UserRow>(
    `INSERT INTO users (email, password_hash, auth_provider, full_name, phone)
     VALUES ($1, $2, 'email', $3, $4)
     RETURNING *`,
    [input.email, passwordHash, input.full_name, input.phone ?? null],
  );
  const user = result.rows[0];
  if (!user) {
    throw new Error('Insert into users did not return a row.');
  }

  const accessToken = signAccessToken({ sub: user.id, email: user.email });
  return { user: toPublicUser(user), access_token: accessToken };
}

export async function login(email: string, password: string): Promise<AuthResult> {
  const user = await findActiveUserByEmail(email);
  if (!user || !user.password_hash) {
    throw new ApiError(401, 'invalid_credentials', 'Incorrect email or password.', null);
  }

  const isValid = await verifyPassword(password, user.password_hash);
  if (!isValid) {
    throw new ApiError(401, 'invalid_credentials', 'Incorrect email or password.', null);
  }

  const accessToken = signAccessToken({ sub: user.id, email: user.email });
  return { user: toPublicUser(user), access_token: accessToken };
}

export async function requestPasswordReset(email: string): Promise<void> {
  const user = await findActiveUserByEmail(email);
  // Always behave the same whether or not the account exists, so this
  // endpoint can't be used to enumerate registered emails.
  if (!user) {
    return;
  }

  const rawToken = crypto.randomBytes(32).toString('hex');
  const tokenHash = hashToken(rawToken);
  const expiresAt = new Date(Date.now() + env.PASSWORD_RESET_TOKEN_TTL_MINUTES * 60_000);

  await pool.query(
    `INSERT INTO password_reset_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)`,
    [user.id, tokenHash, expiresAt],
  );

  await deliverPasswordResetEmail(user.email, rawToken);
}

export async function confirmPasswordReset(rawToken: string, newPassword: string): Promise<void> {
  const tokenHash = hashToken(rawToken);
  const result = await pool.query<Pick<PasswordResetTokenRow, 'id' | 'user_id'>>(
    `SELECT id, user_id FROM password_reset_tokens
     WHERE token_hash = $1 AND used_at IS NULL AND expires_at > now()`,
    [tokenHash],
  );
  const tokenRow = result.rows[0];
  if (!tokenRow) {
    throw new ApiError(
      400,
      'invalid_reset_token',
      'This password reset link is invalid or has expired.',
      'token',
    );
  }

  const passwordHash = await hashPassword(newPassword);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`UPDATE users SET password_hash = $1 WHERE id = $2`, [passwordHash, tokenRow.user_id]);
    await client.query(`UPDATE password_reset_tokens SET used_at = now() WHERE id = $1`, [tokenRow.id]);
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function deliverPasswordResetEmail(email: string, rawToken: string): Promise<void> {
  // TODO: wire up a real transactional email provider. Logging keeps the
  // flow testable end-to-end before that integration exists.
  console.log(`[password-reset] would email ${email} with token ${rawToken}`);
}
