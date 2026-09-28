import type { LegalDocumentType } from '../types/db';

export interface LegalDocumentMeta {
  version: string;
  effectiveDate: { fr: string; en: string };
}

/**
 * Single source of truth for "what is the current version of each legal
 * document." Bumping a version here is the one deliberate act that marks a
 * document as materially changed — legalAcceptanceService compares a
 * user's latest acceptance row for a document_type against this constant
 * to decide whether re-acceptance is outstanding (see
 * getOutstandingAcceptances). The content itself (src/web/legal/*.ts)
 * imports the same version/date so the rendered page and the acceptance
 * record it produces can never drift apart.
 *
 * stripe_connected_account_agreement has no text we author or host — the
 * organizer accepts it on Stripe's own hosted onboarding page (see
 * stripeConnect.ts's createAccountLink, type: 'account_onboarding'). We
 * only log that the organizer was sent there; the version string is a
 * static marker, not something we can detect changing on Stripe's side.
 */
export const LEGAL_DOCUMENT_VERSIONS: Record<LegalDocumentType, LegalDocumentMeta> = {
  terms_of_use: {
    version: '2026-09-28',
    effectiveDate: { fr: '28 septembre 2026', en: 'September 28, 2026' },
  },
  organizer_terms: {
    version: '2026-09-28',
    effectiveDate: { fr: '28 septembre 2026', en: 'September 28, 2026' },
  },
  refund_policy: {
    version: '2026-09-22',
    effectiveDate: { fr: '22 septembre 2026', en: 'September 22, 2026' },
  },
  privacy_policy: {
    version: '2026-09-18',
    effectiveDate: { fr: '18 septembre 2026', en: 'September 18, 2026' },
  },
  acceptable_use: {
    version: '2026-09-28',
    effectiveDate: { fr: '28 septembre 2026', en: 'September 28, 2026' },
  },
  stripe_connected_account_agreement: {
    version: 'stripe-hosted-v1',
    effectiveDate: { fr: 'Gérée par Stripe', en: 'Managed by Stripe' },
  },
};
