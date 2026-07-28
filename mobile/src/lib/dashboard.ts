import { apiRequest } from '@/lib/api';

export interface EventDashboardEntry {
  event_id: string;
  event_name: string;
  orders_paid_count: number;
  tickets_sold: number;
  gross_ticket_revenue_cents: number;
  stripe_fees_cents: number;
  intahe_fees_cents: number;
  net_revenue_cents: number;
}

export type DashboardTotals = Omit<EventDashboardEntry, 'event_id' | 'event_name'>;

export interface OrganizationDashboard {
  organization_id: string;
  totals: DashboardTotals;
  events: EventDashboardEntry[];
}

export function getOrganizationDashboard(token: string, organizationId: string): Promise<OrganizationDashboard> {
  return apiRequest(`/v1/organizations/${organizationId}/dashboard`, { token });
}
