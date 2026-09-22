import { apiRequest } from '@/lib/api';

export interface TaxLine {
  label: string;
  rate_percent: number;
}

export interface Organization {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  contact_email: string | null;
  tax_lines: TaxLine[];
  created_at: string;
}

interface CursorPage<T> {
  items: T[];
  next_cursor: string | null;
}

export function listOrganizations(token: string): Promise<CursorPage<Organization>> {
  return apiRequest('/v1/organizations', { token });
}

export function createOrganization(
  token: string,
  input: { name: string },
): Promise<{ organization: Organization }> {
  return apiRequest('/v1/organizations', { method: 'POST', body: input, token });
}

export function getOrganization(token: string, organizationId: string): Promise<{ organization: Organization }> {
  return apiRequest(`/v1/organizations/${organizationId}`, { token });
}

export function updateOrganization(
  token: string,
  organizationId: string,
  input: { tax_lines: TaxLine[] },
): Promise<{ organization: Organization }> {
  return apiRequest(`/v1/organizations/${organizationId}`, { method: 'PATCH', body: input, token });
}
