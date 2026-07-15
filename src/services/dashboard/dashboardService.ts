import { pool } from '../../config/database';

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

interface DashboardRow {
  event_id: string;
  event_name: string;
  orders_paid_count: string;
  tickets_sold: string;
  gross_ticket_revenue_cents: string;
  stripe_fees_cents: string;
  intahe_fees_cents: string;
  net_revenue_cents: string;
}

function toEntry(row: DashboardRow): EventDashboardEntry {
  return {
    event_id: row.event_id,
    event_name: row.event_name,
    orders_paid_count: Number(row.orders_paid_count),
    tickets_sold: Number(row.tickets_sold),
    gross_ticket_revenue_cents: Number(row.gross_ticket_revenue_cents),
    stripe_fees_cents: Number(row.stripe_fees_cents),
    intahe_fees_cents: Number(row.intahe_fees_cents),
    net_revenue_cents: Number(row.net_revenue_cents),
  };
}

/**
 * Net revenue is what the organization actually nets after both Stripe's
 * processing fee and Intahe's platform fee, computed only from orders
 * currently `paid` — a refunded/partial_refund order moves out of that
 * status and drops out of every sum here, satisfying the brief's "revenu
 * net ... exclut les remboursements" requirement without a separate filter.
 *
 * total_cents - stripe_fee_cents - intahe_fee_cents works out to the same
 * value whether or not the buyer absorbed the fees (see the brief's fee
 * formula): when the buyer pays the fees, total includes them and they
 * cancel out to leave subtotal_cents; when the organizer absorbs them,
 * total *is* subtotal_cents and the fees are subtracted from that instead.
 */
export async function getOrganizationDashboard(organizationId: string): Promise<OrganizationDashboard> {
  const result = await pool.query<DashboardRow>(
    `WITH paid_orders AS (
       SELECT o.*
       FROM orders o
       JOIN events e ON e.id = o.event_id
       WHERE e.organization_id = $1 AND e.deleted_at IS NULL AND o.status = 'paid'
     ),
     line_item_totals AS (
       SELECT po.event_id, SUM(oli.quantity) AS tickets_sold
       FROM order_line_items oli
       JOIN paid_orders po ON po.id = oli.order_id
       GROUP BY po.event_id
     )
     SELECT
       e.id AS event_id,
       e.name AS event_name,
       COUNT(po.id) AS orders_paid_count,
       COALESCE(lit.tickets_sold, 0) AS tickets_sold,
       COALESCE(SUM(po.subtotal_cents), 0) AS gross_ticket_revenue_cents,
       COALESCE(SUM(po.stripe_fee_cents), 0) AS stripe_fees_cents,
       COALESCE(SUM(po.intahe_fee_cents), 0) AS intahe_fees_cents,
       COALESCE(SUM(po.total_cents - po.stripe_fee_cents - po.intahe_fee_cents), 0) AS net_revenue_cents
     FROM events e
     LEFT JOIN paid_orders po ON po.event_id = e.id
     LEFT JOIN line_item_totals lit ON lit.event_id = e.id
     WHERE e.organization_id = $1 AND e.deleted_at IS NULL
     GROUP BY e.id, e.name, lit.tickets_sold
     ORDER BY e.created_at DESC`,
    [organizationId],
  );

  const events = result.rows.map(toEntry);
  const totals = events.reduce<DashboardTotals>(
    (acc, ev) => ({
      orders_paid_count: acc.orders_paid_count + ev.orders_paid_count,
      tickets_sold: acc.tickets_sold + ev.tickets_sold,
      gross_ticket_revenue_cents: acc.gross_ticket_revenue_cents + ev.gross_ticket_revenue_cents,
      stripe_fees_cents: acc.stripe_fees_cents + ev.stripe_fees_cents,
      intahe_fees_cents: acc.intahe_fees_cents + ev.intahe_fees_cents,
      net_revenue_cents: acc.net_revenue_cents + ev.net_revenue_cents,
    }),
    {
      orders_paid_count: 0,
      tickets_sold: 0,
      gross_ticket_revenue_cents: 0,
      stripe_fees_cents: 0,
      intahe_fees_cents: 0,
      net_revenue_cents: 0,
    },
  );

  return { organization_id: organizationId, totals, events };
}
