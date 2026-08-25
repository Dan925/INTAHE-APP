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
  capacity_overshoot_quantity: number;
}

export type DashboardTotals = Omit<
  EventDashboardEntry,
  'event_id' | 'event_name' | 'capacity_overshoot_quantity'
>;

export interface OrganizationDashboard {
  organization_id: string;
  totals: DashboardTotals;
  events: EventDashboardEntry[];
}

export function getOrganizationDashboard(token: string, organizationId: string): Promise<OrganizationDashboard> {
  return apiRequest(`/v1/organizations/${organizationId}/dashboard`, { token });
}

export interface CapacityOvershootIncident {
  id: string;
  ticket_type_id: string;
  ticket_type_name: string;
  order_id: string;
  buyer_email: string;
  quantity_sold: number;
  quantity_total: number;
  overshoot_quantity: number;
  created_at: string;
}

export function listCapacityOvershootIncidents(
  token: string,
  organizationId: string,
  eventId: string,
): Promise<{ items: CapacityOvershootIncident[] }> {
  return apiRequest(`/v1/organizations/${organizationId}/events/${eventId}/capacity-incidents`, { token });
}
