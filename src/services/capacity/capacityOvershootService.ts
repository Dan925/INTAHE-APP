import { pool } from '../../config/database';
import { sendEmail } from '../email/emailClient';
import type { CapacityOvershootIncident } from '../checkout/orderReleaseService';

export interface CapacityOvershootIncidentDetail {
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

interface IncidentDetailRow {
  id: string;
  ticket_type_id: string;
  ticket_type_name: string;
  order_id: string;
  buyer_email: string;
  quantity_sold: number;
  quantity_total: number;
  overshoot_quantity: number;
  created_at: Date;
}

/**
 * console.error with a structured, greppable payload — the same
 * error-class-event pattern already used throughout this codebase (see
 * errorHandler.ts, authService.ts's token-verification failures). This is
 * the one call site to swap for Sentry.captureMessage(..., 'error') once
 * Sentry is installed; everything upstream of this function (detection,
 * persistence) doesn't need to change.
 */
function logCapacityOvershootAlert(incident: CapacityOvershootIncident): void {
  console.error(
    '[capacity_overshoot]',
    JSON.stringify({
      level: 'alert',
      organization_id: incident.organizationId,
      event_id: incident.eventId,
      ticket_type_id: incident.ticketTypeId,
      ticket_type_name: incident.ticketTypeName,
      order_id: incident.orderId,
      quantity_sold: incident.quantitySold,
      quantity_total: incident.quantityTotal,
      overshoot_quantity: incident.overshootQuantity,
      created_at: incident.createdAt.toISOString(),
    }),
  );
}

// contact_email is the organizer's preferred address if they set one;
// every organization has exactly one owner (organization_members_one_owner_per_org),
// so that's always a valid fallback.
async function getOrganizerNotificationEmail(organizationId: string): Promise<string | null> {
  const result = await pool.query<{ contact_email: string | null; owner_email: string | null }>(
    `SELECT
       o.contact_email,
       (SELECT u.email FROM organization_members om
        JOIN users u ON u.id = om.user_id
        WHERE om.organization_id = o.id AND om.role = 'owner') AS owner_email
     FROM organizations o
     WHERE o.id = $1`,
    [organizationId],
  );
  const row = result.rows[0];
  if (!row) return null;
  return row.contact_email ?? row.owner_email;
}

/**
 * Called once per incident, right after the webhook transaction that
 * created it commits — never inside that transaction: an email/logging
 * failure here must not roll back the payment-confirmation it's reporting
 * on. Fires at the moment the overshoot happens, not as part of some
 * pre-event summary — the organizer needs to know now, while there's still
 * time to plan for it, not the night before doors open.
 */
export async function notifyCapacityOvershoot(incident: CapacityOvershootIncident): Promise<void> {
  logCapacityOvershootAlert(incident);

  const to = await getOrganizerNotificationEmail(incident.organizationId);
  if (!to) {
    // Shouldn't happen (every org has an owner) — but a missing notification
    // address is never a reason to let this throw and look like the webhook
    // itself failed.
    console.error('[capacity_overshoot] no notification email found for organization', incident.organizationId);
    return;
  }

  try {
    await sendEmail({
      to,
      subject: `Capacity exceeded for "${incident.ticketTypeName}"`,
      html: `<p>A payment that arrived after its reservation had already expired and been resold has pushed
<strong>${incident.ticketTypeName}</strong> ${incident.overshootQuantity} ticket${incident.overshootQuantity === 1 ? '' : 's'} over its capacity.</p>
<p>Sold: <strong>${incident.quantitySold}</strong> / Capacity: <strong>${incident.quantityTotal}</strong></p>
<p>The payment was honored — this is a real, valid ticket, not an error — but you may want to plan for
${incident.overshootQuantity} more attendee${incident.overshootQuantity === 1 ? '' : 's'} than the ticket type's
listed capacity. See your event dashboard for the full list of affected orders.</p>`,
    });
  } catch (err) {
    console.error('Failed to send capacity overshoot email:', err);
  }
}

/** Powers the dashboard's "view affected orders" detail for a capacity warning. */
export async function listCapacityOvershootIncidents(eventId: string): Promise<CapacityOvershootIncidentDetail[]> {
  const result = await pool.query<IncidentDetailRow>(
    `SELECT i.id, i.ticket_type_id, tt.name AS ticket_type_name, i.order_id, o.buyer_email,
            i.quantity_sold, i.quantity_total, i.overshoot_quantity, i.created_at
     FROM capacity_overshoot_incidents i
     JOIN ticket_types tt ON tt.id = i.ticket_type_id
     JOIN orders o ON o.id = i.order_id
     WHERE i.event_id = $1
     ORDER BY i.created_at DESC`,
    [eventId],
  );
  return result.rows.map((row) => ({
    id: row.id,
    ticket_type_id: row.ticket_type_id,
    ticket_type_name: row.ticket_type_name,
    order_id: row.order_id,
    buyer_email: row.buyer_email,
    quantity_sold: row.quantity_sold,
    quantity_total: row.quantity_total,
    overshoot_quantity: row.overshoot_quantity,
    created_at: row.created_at.toISOString(),
  }));
}
