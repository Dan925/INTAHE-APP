-- Up Migration

-- Lets POST /v1/auth/logout actually invalidate a token server-side
-- instead of only clearing it client-side (the JWT itself would otherwise
-- stay valid — and accepted by every route — until its natural 7-day
-- expiry, "logout" or not). Every access token now carries a random jti
-- claim (see src/utils/jwt.ts); requireAuth/optionalAuth reject a token
-- whose jti shows up here. expires_at mirrors the token's own exp so
-- rows can be pruned once they'd be useless anyway — see
-- tokenRevocationService.ts, which does that opportunistically on every
-- revoke rather than needing a separate cleanup worker.
CREATE TABLE revoked_tokens (
  jti uuid PRIMARY KEY,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX revoked_tokens_expires_at_idx ON revoked_tokens (expires_at);

-- Down Migration

DROP TABLE revoked_tokens;
