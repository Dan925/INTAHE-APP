import type { Role } from './roles';

export type AuthProvider = 'email' | 'google' | 'apple';

export interface UserRow {
  id: string;
  email: string;
  password_hash: string | null;
  auth_provider: AuthProvider;
  full_name: string;
  phone: string | null;
  avatar_url: string | null;
  google_sub: string | null;
  apple_sub: string | null;
  // Only ever set by a direct SQL statement — no application route writes
  // this column. See 1787680400000_add-platform-admin-and-payout-holds.sql.
  is_platform_admin: boolean;
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

export interface OrganizationRow {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  contact_email: string | null;
  stripe_account_id: string | null;
  stripe_charges_enabled: boolean;
  // Set only by the admin console's "approve an organizer" action. No
  // enforcement is wired to this anywhere yet — see the migration.
  platform_approved_at: Date | null;
  created_at: Date;
  deleted_at: Date | null;
}

export interface OrganizationMemberRow {
  id: string;
  organization_id: string;
  user_id: string;
  role: Role;
  invited_at: Date | null;
  accepted_at: Date | null;
  created_at: Date;
}

export type EventStatus = 'draft' | 'published' | 'cancelled' | 'completed';

export interface EventRow {
  id: string;
  organization_id: string;
  name: string;
  description: string | null;
  description_ai_generated: boolean;
  start_at: Date;
  end_at: Date;
  address: string | null;
  latitude: string | null;
  longitude: string | null;
  cover_image_url: string | null;
  status: EventStatus;
  capacity: number | null;
  fees_absorbed_by_organizer: boolean;
  is_public_discoverable: boolean;
  // Set by the admin console's "hold a payout" action — excludes this
  // event from payoutService.findDueEvents regardless of its 48h delay.
  payout_held_at: Date | null;
  payout_held_by: string | null;
  created_at: Date;
  deleted_at: Date | null;
}

export interface TicketTypeRow {
  id: string;
  event_id: string;
  name: string;
  price_cents: number;
  currency: string;
  quantity_total: number;
  quantity_sold: number;
  sale_starts_at: Date | null;
  sale_ends_at: Date | null;
  created_at: Date;
}

export type OrderStatus = 'pending' | 'paid' | 'refunded' | 'partial_refund' | 'expired';

// 'destination' only ever appears on orders created before the direct-charge
// migration — see 1787680100000_add-stripe-charge-mode-and-refund-reason-to-orders.sql.
export type StripeChargeMode = 'platform' | 'destination' | 'direct';

export type RefundReason = 'organizer_cancellation' | 'buyer_request' | 'event_postponed';

export interface OrderRow {
  id: string;
  event_id: string;
  buyer_user_id: string | null;
  buyer_email: string;
  stripe_payment_intent_id: string | null;
  subtotal_cents: number;
  stripe_fee_cents: number;
  intahe_fee_cents: number;
  total_cents: number;
  status: OrderStatus;
  idempotency_key: string | null;
  idempotency_request_hash: string | null;
  reservation_expires_at: Date | null;
  ticket_access_token_hash: string | null;
  tickets_issued_at: Date | null;
  confirmation_token_hash: string | null;
  stripe_charge_mode: StripeChargeMode;
  refund_reason: RefundReason | null;
  created_at: Date;
}

export interface OrderLineItemRow {
  id: string;
  order_id: string;
  ticket_type_id: string;
  quantity: number;
  unit_price_cents: number;
  created_at: Date;
}

export interface TicketRow {
  id: string;
  order_id: string;
  ticket_type_id: string;
  qr_code: string;
  attendee_name: string | null;
  attendee_email: string | null;
  checked_in_at: Date | null;
  checked_in_by: string | null;
  created_at: Date;
}

export type TransactionType = 'charge' | 'refund' | 'payout';

export interface TransactionRow {
  id: string;
  order_id: string;
  type: TransactionType;
  amount_cents: number;
  stripe_object_id: string | null;
  // Only meaningful for type === 'refund'; null for 'charge'/'payout' rows.
  application_fee_refunded: boolean | null;
  occurred_at: Date;
}

export type OrganizerPayoutStatus = 'pending' | 'succeeded' | 'failed' | 'skipped_no_balance';

export interface OrganizerPayoutRow {
  id: string;
  organization_id: string;
  event_id: string;
  stripe_account_id: string;
  scheduled_for: Date;
  status: OrganizerPayoutStatus;
  stripe_payout_id: string | null;
  amount_cents: number | null;
  currency: string | null;
  attempted_at: Date | null;
  error_message: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface PlatformAdminAccessLogRow {
  id: string;
  admin_user_id: string;
  organization_id: string | null;
  resource: string;
  action: string;
  occurred_at: Date;
}

export type ReconciliationResolution = 'manual_reissue' | 'webhook_caught_up';

export interface PaymentReconciliationIncidentRow {
  id: string;
  order_id: string;
  stripe_payment_intent_id: string;
  amount_cents: number;
  detected_at: Date;
  resolved_at: Date | null;
  resolved_by: string | null;
  resolution: ReconciliationResolution | null;
}
