import crypto from 'node:crypto';
import { pool } from '../../config/database';
import { env } from '../../config/env';
import { sendEmail } from '../email/emailClient';
import { verifyAppleIdToken } from '../apple/appleAuthClient';
import { verifyGoogleIdToken } from '../google/googleAuthClient';
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
  // Lets the client know whether to ask for a password when confirming a
  // sensitive action like account deletion — true for plain email/password
  // accounts and any Google/Apple account that was later linked to one.
  has_password: boolean;
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
    has_password: row.password_hash !== null,
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

/**
 * Finds the user by Google's durable `sub` claim first. If that's a first
 * sign-in, falls back to matching an existing account by verified email —
 * Google has already proven the person owns that email, so it's safe to
 * link the two auth methods onto one account rather than creating a
 * duplicate. Creates a brand-new `auth_provider = 'google'` user only if
 * neither lookup finds anyone.
 */
export async function signInWithGoogle(idToken: string): Promise<AuthResult> {
  let payload;
  try {
    payload = await verifyGoogleIdToken(idToken);
  } catch (err) {
    // TEMPORARY diagnostic: this otherwise swallows the real reason
    // (audience mismatch, clock skew, bad issuer, etc.) behind one generic
    // 401, which made a live signInWithGoogle failure impossible to debug.
    console.error('Google ID token verification failed:', err);
    throw new ApiError(401, 'invalid_google_token', 'The Google ID token is invalid or expired.', null);
  }

  if (!payload.emailVerified) {
    throw new ApiError(
      401,
      'google_email_not_verified',
      "This Google account's email address is not verified.",
      null,
    );
  }

  const byGoogleSub = await pool.query<UserRow>(
    `SELECT * FROM users WHERE google_sub = $1 AND deleted_at IS NULL`,
    [payload.sub],
  );
  let user = byGoogleSub.rows[0];

  if (!user) {
    const byEmail = await findActiveUserByEmail(payload.email);
    if (byEmail) {
      const linkResult = await pool.query<UserRow>(
        `UPDATE users SET google_sub = $2 WHERE id = $1 RETURNING *`,
        [byEmail.id, payload.sub],
      );
      user = linkResult.rows[0];
    } else {
      const fallbackName = payload.fullName ?? payload.email.split('@')[0] ?? payload.email;
      const insertResult = await pool.query<UserRow>(
        `INSERT INTO users (email, auth_provider, full_name, avatar_url, google_sub)
         VALUES ($1, 'google', $2, $3, $4)
         RETURNING *`,
        [payload.email, fallbackName, payload.avatarUrl, payload.sub],
      );
      user = insertResult.rows[0];
    }
  }

  if (!user) {
    throw new Error('Google sign-in did not resolve to a user row.');
  }

  const accessToken = signAccessToken({ sub: user.id, email: user.email });
  return { user: toPublicUser(user), access_token: accessToken };
}

/**
 * Same linking strategy as signInWithGoogle: match by Apple's durable `sub`
 * first, fall back to linking onto an existing account with the same
 * verified email, otherwise create a fresh `auth_provider = 'apple'` user.
 *
 * `fullName` only arrives on the very first authorization (Apple hands it
 * to the client directly, never puts it in the token) — every later
 * sign-in omits it, so it's optional here and only used on the create path.
 */
export async function signInWithApple(identityToken: string, fullName?: string): Promise<AuthResult> {
  let payload;
  try {
    payload = await verifyAppleIdToken(identityToken);
  } catch (err) {
    console.error('Apple identity token verification failed:', err);
    throw new ApiError(401, 'invalid_apple_token', 'The Apple identity token is invalid or expired.', null);
  }

  if (!payload.emailVerified) {
    throw new ApiError(401, 'apple_email_not_verified', "This Apple account's email address is not verified.", null);
  }

  const byAppleSub = await pool.query<UserRow>(`SELECT * FROM users WHERE apple_sub = $1 AND deleted_at IS NULL`, [
    payload.sub,
  ]);
  let user = byAppleSub.rows[0];

  if (!user) {
    const byEmail = await findActiveUserByEmail(payload.email);
    if (byEmail) {
      const linkResult = await pool.query<UserRow>(`UPDATE users SET apple_sub = $2 WHERE id = $1 RETURNING *`, [
        byEmail.id,
        payload.sub,
      ]);
      user = linkResult.rows[0];
    } else {
      const resolvedName = fullName?.trim() || payload.email.split('@')[0] || payload.email;
      const insertResult = await pool.query<UserRow>(
        `INSERT INTO users (email, auth_provider, full_name, apple_sub)
         VALUES ($1, 'apple', $2, $3)
         RETURNING *`,
        [payload.email, resolvedName, payload.sub],
      );
      user = insertResult.rows[0];
    }
  }

  if (!user) {
    throw new Error('Apple sign-in did not resolve to a user row.');
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

/**
 * Self-service account deletion (Apple Guideline 5.1.1(v) / general privacy
 * good practice): tombstones the account rather than hard-deleting the row,
 * matching the rest of the app's soft-delete pattern — order and ticket
 * history stay intact for the organizer's records and any tax/accounting
 * requirements, but every piece of the deleted user's own PII is scrubbed,
 * and the email is freed up (unique indexes here are all scoped to active
 * users) so the same address can sign up fresh later.
 *
 * Password confirmation is required whenever the account has one set —
 * covers plain email/password accounts and any Google/Apple account that
 * was originally created with a password and later linked. Accounts with
 * no password (Google/Apple only) rely on the JWT alone, same as every
 * other authenticated action.
 *
 * Blocks deletion while the user is the sole owner of an active
 * organization — deleting them would silently orphan that organization
 * (no one left who can manage payouts, refunds, or future events), so
 * they're asked to transfer ownership or delete the organization first.
 */
export async function deleteOwnAccount(userId: string, password?: string): Promise<void> {
  const result = await pool.query<UserRow>(`SELECT * FROM users WHERE id = $1 AND deleted_at IS NULL`, [userId]);
  const user = result.rows[0];
  if (!user) {
    throw new ApiError(404, 'user_not_found', 'Account not found.', null);
  }

  if (user.password_hash) {
    const isValid = password ? await verifyPassword(password, user.password_hash) : false;
    if (!isValid) {
      throw new ApiError(401, 'invalid_password', 'Incorrect password.', 'password');
    }
  }

  const ownedOrgs = await pool.query(
    `SELECT o.name FROM organization_members om
     JOIN organizations o ON o.id = om.organization_id
     WHERE om.user_id = $1 AND om.role = 'owner' AND o.deleted_at IS NULL`,
    [userId],
  );
  if (ownedOrgs.rowCount && ownedOrgs.rowCount > 0) {
    throw new ApiError(
      409,
      'owns_organizations',
      'Transfer ownership or delete your organization(s) before deleting your account.',
      null,
    );
  }

  await pool.query(
    `UPDATE users
     SET deleted_at = now(),
         email = 'deleted-' || id || '@intahe.invalid',
         full_name = 'Deleted user',
         phone = NULL,
         avatar_url = NULL,
         -- users_password_required_for_email_provider forbids a NULL hash
         -- while auth_provider = 'email'; leaving it in place is harmless
         -- once deleted_at is set, since every login lookup filters that out.
         password_hash = CASE WHEN auth_provider = 'email' THEN password_hash ELSE NULL END,
         google_sub = NULL,
         apple_sub = NULL
     WHERE id = $1`,
    [userId],
  );
}

async function deliverPasswordResetEmail(email: string, rawToken: string): Promise<void> {
  const resetUrl = `${env.PASSWORD_RESET_URL}?token=${encodeURIComponent(rawToken)}`;
  try {
    await sendEmail({
      to: email,
      subject: 'Reset your Intahe password',
      html: `<p>Someone requested a password reset for this account.</p>
<p><a href="${resetUrl}">Reset your password</a>. This link expires in ${env.PASSWORD_RESET_TOKEN_TTL_MINUTES} minutes.</p>
<p>If you didn't request this, you can safely ignore this email.</p>`,
    });
  } catch (err) {
    // requestPasswordReset always returns 200 so this endpoint can't be
    // used to enumerate accounts — letting a delivery failure propagate
    // would make that 200-vs-500 distinction leak exactly what it's meant
    // to hide. The token still exists in the DB either way; log and move on.
    console.error('Failed to send password reset email:', err);
  }
}
