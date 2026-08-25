const FORBIDDEN_CHARS = /[<>\\'"*]/g;

// Stripe's statement_descriptor_suffix is appended to the charging
// account's own static descriptor prefix, and the combined result has a
// hard 22-character ceiling — 12 is a conservative budget for the
// per-charge suffix that leaves comfortable room for the account's prefix
// regardless of how long that turns out to be, rather than cutting it
// exactly at whatever the API happens to allow today.
const MAX_SUFFIX_LENGTH = 12;

/**
 * Turns an event name into a card-statement-safe suffix so a buyer's bank
 * statement shows the event, not just "INTAHE" — the anti-chargeback
 * measure this exists for: buyers who don't recognize a generic platform
 * name on their statement are far more likely to dispute the charge.
 *
 * Returns undefined when nothing usable survives sanitization (an event
 * name that's pure punctuation or digits, or empty) — Stripe requires at
 * least one letter in a statement descriptor, so a request built from an
 * invalid suffix would just be rejected outright. The charge then falls
 * back to the account's own default descriptor, which is always valid on
 * its own.
 */
export function buildStatementDescriptorSuffix(eventName: string): string | undefined {
  const asciiOnly = eventName
    // NFD splits an accented letter into the base letter plus a separate
    // combining-accent codepoint (e.g. "É" -> "E" + U+0301) — the ASCII
    // strip below then drops the accent codepoint on its own, leaving the
    // plain letter behind instead of losing the letter entirely.
    .normalize('NFD')
    .replace(FORBIDDEN_CHARS, '')
    .replace(/[^\x20-\x7E]/g, ''); // combining accents and anything else non-ASCII

  const suffix = asciiOnly.trim().toUpperCase().slice(0, MAX_SUFFIX_LENGTH).trim();

  if (!/[A-Z]/.test(suffix)) {
    return undefined;
  }
  return suffix;
}
