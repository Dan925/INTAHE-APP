import { pool } from '../../config/database';

/**
 * The one place a JWT can be invalidated before its natural expiry — see
 * routes/v1/auth.ts's POST /logout (the only writer) and
 * middleware/auth.ts's requireAuth/optionalAuth (checked on every
 * authenticated request). Rows are pruned opportunistically on each
 * revoke rather than by a separate scheduled worker: a revoked entry is
 * useless once its own token would have expired naturally anyway, and
 * logout is infrequent enough that this keeps the table bounded without
 * new interval/env-var infra.
 */
export async function revokeToken(jti: string, expiresAt: Date): Promise<void> {
  await pool.query(`DELETE FROM revoked_tokens WHERE expires_at < now()`);
  await pool.query(`INSERT INTO revoked_tokens (jti, expires_at) VALUES ($1, $2) ON CONFLICT (jti) DO NOTHING`, [
    jti,
    expiresAt,
  ]);
}

export async function isTokenRevoked(jti: string): Promise<boolean> {
  const result = await pool.query(`SELECT 1 FROM revoked_tokens WHERE jti = $1`, [jti]);
  return result.rows.length > 0;
}
