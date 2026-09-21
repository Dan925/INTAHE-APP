import { apiRequest } from '@/lib/api';

export interface QuickSaleItem {
  id: string;
  organization_id: string;
  name: string;
  price_cents: number;
  currency: string;
  created_at: string;
}

export function listQuickSaleItems(token: string, organizationId: string): Promise<{ items: QuickSaleItem[] }> {
  return apiRequest(`/v1/organizations/${organizationId}/quick-sale-items`, { token });
}

export function createQuickSaleItem(
  token: string,
  organizationId: string,
  input: { name: string; price_cents: number; currency: string },
): Promise<{ quick_sale_item: QuickSaleItem }> {
  return apiRequest(`/v1/organizations/${organizationId}/quick-sale-items`, { method: 'POST', body: input, token });
}

export function deleteQuickSaleItem(token: string, organizationId: string, itemId: string): Promise<null> {
  return apiRequest(`/v1/organizations/${organizationId}/quick-sale-items/${itemId}`, { method: 'DELETE', token });
}

export interface QuickSale {
  id: string;
  organization_id: string;
  item_name: string;
  subtotal_cents: number;
  stripe_fee_cents: number;
  intahe_fee_cents: number;
  total_cents: number;
  currency: string;
  status: 'pending' | 'paid' | 'failed';
  payout_status: 'not_attempted' | 'succeeded' | 'failed';
  payout_error_message: string | null;
  created_at: string;
  stripe_account_id: string | null;
}

export function listQuickSales(token: string, organizationId: string): Promise<{ items: QuickSale[] }> {
  return apiRequest(`/v1/organizations/${organizationId}/quick-sales`, { token });
}

export interface CreateQuickSaleResult {
  quick_sale: QuickSale;
  client_secret: string | null;
}

/** in_person: true routes to a card_present PaymentIntent for the Stripe Terminal reader flow — see quickSaleReaderService.ts on the backend. */
export function createQuickSale(
  token: string,
  organizationId: string,
  input: { quick_sale_item_id: string; in_person?: boolean },
): Promise<CreateQuickSaleResult> {
  return apiRequest(`/v1/organizations/${organizationId}/quick-sales`, { method: 'POST', body: input, token });
}

export function retryQuickSalePayout(
  token: string,
  organizationId: string,
  quickSaleId: string,
): Promise<{ quick_sale: QuickSale }> {
  return apiRequest(`/v1/organizations/${organizationId}/quick-sales/${quickSaleId}/retry-payout`, {
    method: 'POST',
    token,
  });
}

/** Called by the Stripe Terminal SDK's tokenProvider (see terminalSession.ts) whenever it needs a fresh connection token — never called directly by screen code. */
export function getReaderConnectionTokenSecret(token: string, organizationId: string): Promise<{ secret: string }> {
  return apiRequest(`/v1/organizations/${organizationId}/quick-sale-reader/connection-token`, {
    method: 'POST',
    token,
  });
}

export function getReaderLocationId(token: string, organizationId: string): Promise<{ location_id: string | null }> {
  return apiRequest(`/v1/organizations/${organizationId}/quick-sale-reader/location`, { token });
}

export function setUpReaderLocation(
  token: string,
  organizationId: string,
  input: {
    display_name: string;
    address: { line1: string; city: string; state?: string; postal_code: string; country: string };
  },
): Promise<{ location_id: string }> {
  return apiRequest(`/v1/organizations/${organizationId}/quick-sale-reader/location`, {
    method: 'POST',
    body: input,
    token,
  });
}
