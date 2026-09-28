-- Up Migration

-- Insert-only audit trail of every legal-document acceptance — never
-- updated in place, so a document version change can never silently
-- overwrite a previous acceptance record. "Which version is current" for
-- a given document_type is a code constant (see
-- src/web/legal/registry.ts), not stored here; this table only records
-- what a specific person actually accepted and when, which lets the app
-- compare a user's latest row per document_type against the current
-- constant to detect outstanding/required re-acceptance (see
-- legalAcceptanceService.getOutstandingAcceptances) without ever
-- rewriting history.
--
-- user_id is nullable: a ticket buyer can check out as a guest
-- (checkoutService.createOrder accepts buyer_user_id: null), so their
-- checkout-time acceptance of Terms of Use/Refund Policy has no user
-- account to attach to — order_id + buyer_email carry that record
-- instead. Organizer-onboarding acceptances (org creation, Stripe
-- Connected Account Agreement acknowledgment) always have user_id set,
-- since only an authenticated user can reach those flows.
CREATE TABLE legal_acceptances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES users (id),
  order_id uuid REFERENCES orders (id),
  buyer_email text,
  document_type text NOT NULL CHECK (
    document_type IN (
      'terms_of_use',
      'organizer_terms',
      'refund_policy',
      'privacy_policy',
      'acceptable_use',
      'stripe_connected_account_agreement'
    )
  ),
  document_version text NOT NULL,
  accepted_at timestamptz NOT NULL DEFAULT now(),
  -- Nullable, not "required" — captured whenever the request context has
  -- it (every acceptance in this app happens over HTTP, so in practice
  -- both are always available), but the column stays nullable rather than
  -- NOT NULL so a future acceptance path that genuinely can't observe
  -- either (e.g. an internal/admin-triggered re-acceptance import) isn't
  -- blocked by a constraint that doesn't apply to it.
  ip_address text,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX legal_acceptances_user_document_idx
  ON legal_acceptances (user_id, document_type, accepted_at DESC);

CREATE INDEX legal_acceptances_order_idx
  ON legal_acceptances (order_id)
  WHERE order_id IS NOT NULL;

-- Down Migration

DROP TABLE legal_acceptances;
