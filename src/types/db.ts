import type { Role } from './roles';

export type AuthProvider = 'email' | 'google';

export interface UserRow {
  id: string;
  email: string;
  password_hash: string | null;
  auth_provider: AuthProvider;
  full_name: string;
  phone: string | null;
  avatar_url: string | null;
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

export type OrderStatus = 'pending' | 'paid' | 'refunded' | 'partial_refund';

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
  occurred_at: Date;
}
