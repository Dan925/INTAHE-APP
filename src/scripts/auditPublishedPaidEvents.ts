/**
 * Read-only check for exactly one question: is there any published event
 * currently selling a paid ticket type, right now? Meant to be run
 * immediately before a deploy that changes how payments/webhooks work —
 * see docs/stripe-connect-runbook.md's "Avant de commencer" section — so
 * whoever is deploying knows whether the verification window in Part 1
 * (Étape 9-10) is exposed to real, in-flight buyer traffic or not.
 *
 * "On sale right now" means: price_cents > 0, not sold out
 * (quantity_sold < quantity_total), and within its own sale window if one
 * is set (sale_starts_at/sale_ends_at).
 *
 * Makes no writes of any kind — a single SELECT.
 *
 * Usage:
 *   npx tsx src/scripts/auditPublishedPaidEvents.ts
 */
import { pool } from '../config/database';

interface OnSaleRow {
  event_id: string;
  event_name: string;
  organization_name: string;
  ticket_type_name: string;
  price_cents: number;
  currency: string;
  quantity_sold: number;
  quantity_total: number;
}

async function main(): Promise<void> {
  const result = await pool.query<OnSaleRow>(
    `SELECT e.id AS event_id, e.name AS event_name, org.name AS organization_name,
            tt.name AS ticket_type_name, tt.price_cents, tt.currency, tt.quantity_sold, tt.quantity_total
     FROM events e
     JOIN organizations org ON org.id = e.organization_id
     JOIN ticket_types tt ON tt.event_id = e.id
     WHERE e.status = 'published'
       AND e.deleted_at IS NULL
       AND tt.price_cents > 0
       AND tt.quantity_sold < tt.quantity_total
       AND (tt.sale_starts_at IS NULL OR tt.sale_starts_at <= now())
       AND (tt.sale_ends_at IS NULL OR tt.sale_ends_at > now())
     ORDER BY org.name, e.name, tt.name`,
  );

  if (result.rows.length === 0) {
    console.log('No published event is currently selling a paid ticket type. Safe to deploy without depublishing anything.');
    await pool.end();
    return;
  }

  console.log(
    `${result.rows.length} paid ticket type(s) currently on sale under a published event — depublish these before deploying (POST /v1/admin/events/:eventId/unpublish), then republish once Part 1's verification (Étape 10) has passed:\n`,
  );
  for (const row of result.rows) {
    console.log(`${row.organization_name} — ${row.event_name} (event ${row.event_id})`);
    console.log(
      `  ${row.ticket_type_name}: ${(row.price_cents / 100).toFixed(2)} ${row.currency.toUpperCase()} — ${row.quantity_sold}/${row.quantity_total} sold`,
    );
  }

  await pool.end();
}

main().catch((err) => {
  console.error('Published-paid-events audit script failed:', err);
  process.exitCode = 1;
});
