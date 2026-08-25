import crypto from 'node:crypto';

/**
 * Bearer capability token that replaces `buyer_email` as the proof of
 * ownership for GET /:orderId/tickets. Unlike an email address, this is
 * high-entropy (32 random bytes) and single-purpose, so it's safe to hand
 * out in a URL — but only the hash is ever persisted (`hashTicketAccessToken`),
 * matching how passwords/reset tokens are stored elsewhere in this codebase.
 * The raw value exists only in memory at the moment it's generated and in
 * whatever channel it's handed to next (the API response, the confirmation
 * email) — never written to the database.
 */
export function generateTicketAccessToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

export function hashTicketAccessToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/** Constant-time comparison — this guards a bearer credential, unlike the buyer_email check it replaces. */
export function ticketAccessTokenMatches(candidate: string | undefined, storedHash: string | null): boolean {
  if (!candidate || !storedHash) return false;
  const candidateHash = Buffer.from(hashTicketAccessToken(candidate), 'hex');
  const stored = Buffer.from(storedHash, 'hex');
  if (candidateHash.length !== stored.length) return false;
  return crypto.timingSafeEqual(candidateHash, stored);
}
