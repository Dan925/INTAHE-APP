import type { Pool, PoolClient } from 'pg';
import { pool } from '../../config/database';
import { LEGAL_DOCUMENT_VERSIONS } from '../../legal/registry';
import type { LegalAcceptanceRow, LegalDocumentType } from '../../types/db';

export interface RecordAcceptanceInput {
  userId?: string | null | undefined;
  orderId?: string | null | undefined;
  buyerEmail?: string | null | undefined;
  documentType: LegalDocumentType;
  ipAddress?: string | null | undefined;
  userAgent?: string | null | undefined;
}

/**
 * Insert-only — this table is never UPDATEd, so a later version bump can
 * never silently overwrite what an earlier acceptance actually recorded.
 * document_version is always the CURRENT constant for documentType (see
 * ../../legal/registry.ts) at the moment this is called; there's no way
 * to record acceptance of an old version, by design.
 *
 * Takes an optional PoolClient so a caller already inside a transaction
 * (organizationService.createOrganization records org-creation-time
 * acceptance in the same transaction as the org insert itself) can pass
 * it through, keeping the two atomic — the default `pool` is fine for a
 * standalone call like the checkout path's best-effort logging.
 */
export async function recordAcceptance(
  input: RecordAcceptanceInput,
  queryable: Pool | PoolClient = pool,
): Promise<LegalAcceptanceRow> {
  const version = LEGAL_DOCUMENT_VERSIONS[input.documentType].version;
  const result = await queryable.query<LegalAcceptanceRow>(
    `INSERT INTO legal_acceptances (user_id, order_id, buyer_email, document_type, document_version, ip_address, user_agent)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [
      input.userId ?? null,
      input.orderId ?? null,
      input.buyerEmail ?? null,
      input.documentType,
      version,
      input.ipAddress ?? null,
      input.userAgent ?? null,
    ],
  );
  const row = result.rows[0];
  if (!row) {
    throw new Error('Insert into legal_acceptances did not return a row.');
  }
  return row;
}

/**
 * True only if this user's most recent acceptance row for documentType
 * matches the CURRENT version — an acceptance of an older version does
 * not count, which is exactly what lets a version bump require
 * re-acceptance (requirement: "the architecture should support requiring
 * re-acceptance"). Nothing in this codebase enforces that yet (no route
 * currently blocks on it) — this is the comparison a future gate would
 * call.
 */
export async function hasAcceptedCurrentVersion(userId: string, documentType: LegalDocumentType): Promise<boolean> {
  const version = LEGAL_DOCUMENT_VERSIONS[documentType].version;
  const result = await pool.query(
    `SELECT 1 FROM legal_acceptances
     WHERE user_id = $1 AND document_type = $2 AND document_version = $3
     LIMIT 1`,
    [userId, documentType, version],
  );
  return result.rows.length > 0;
}

/**
 * Every organizer-facing document type this user has never accepted at
 * its current version — used today only to answer GET
 * /v1/legal/acceptances/outstanding (see routes/v1/legal.ts); no route
 * currently blocks on this list, but it's what a future "you must
 * re-accept before continuing" gate would read. Deliberately excludes
 * stripe_connected_account_agreement (acknowledged, not something we can
 * detect a version change for on our own) and the buyer-facing
 * terms_of_use/refund_policy acceptance logged automatically at
 * checkout, which isn't gated on anything — a returning buyer accepts
 * the current version again with every purchase.
 */
const ORGANIZER_GATED_DOCUMENT_TYPES: LegalDocumentType[] = ['terms_of_use', 'organizer_terms'];

export async function getOutstandingAcceptances(userId: string): Promise<LegalDocumentType[]> {
  const outstanding: LegalDocumentType[] = [];
  for (const documentType of ORGANIZER_GATED_DOCUMENT_TYPES) {
    if (!(await hasAcceptedCurrentVersion(userId, documentType))) {
      outstanding.push(documentType);
    }
  }
  return outstanding;
}
