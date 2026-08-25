import { pool } from '../src/config/database';
import { truncateAllTables } from './helpers/db';
import { createOrgAndPublishedEvent, createTicketType } from './helpers/checkoutFixtures';
import { createApp } from '../src/app';

const app = createApp();

beforeEach(async () => {
  await truncateAllTables();
});

afterAll(async () => {
  await pool.end();
});

// Direct SQL against ticket_types, deliberately bypassing all application
// code — this is testing the DB-level backstop itself
// (ticket_types_bound_quantity_sold_increment), not any service function.
// It has to hold regardless of which code path (present or future) writes
// to quantity_sold.
describe('ticket_types_bound_quantity_sold_increment trigger', () => {
  it('allows a single-write increment well within any real order size', async () => {
    const fixture = await createOrgAndPublishedEvent(app);
    const ticketType = await createTicketType(app, fixture.owner, fixture.organization.id, fixture.event.id, {
      quantity_total: 1000,
    });

    // MAX_QUANTITY_PER_ORDER (checkout's application-level cap) is 20 by
    // default — this increment is comfortably above that, well past what
    // any legitimate single reReserveAfterLatePayment call could produce,
    // and still nowhere near the trigger's 500 threshold.
    await expect(
      pool.query(`UPDATE ticket_types SET quantity_sold = quantity_sold + 100 WHERE id = $1`, [ticketType.id]),
    ).resolves.toBeDefined();

    const row = await pool.query('SELECT quantity_sold FROM ticket_types WHERE id = $1', [ticketType.id]);
    expect(row.rows[0].quantity_sold).toBe(100);
  });

  it('allows an increment of exactly 500 in one write', async () => {
    const fixture = await createOrgAndPublishedEvent(app);
    const ticketType = await createTicketType(app, fixture.owner, fixture.organization.id, fixture.event.id, {
      quantity_total: 1000,
    });

    await expect(
      pool.query(`UPDATE ticket_types SET quantity_sold = quantity_sold + 500 WHERE id = $1`, [ticketType.id]),
    ).resolves.toBeDefined();
  });

  it('rejects an increment of 501 or more in one write', async () => {
    const fixture = await createOrgAndPublishedEvent(app);
    const ticketType = await createTicketType(app, fixture.owner, fixture.organization.id, fixture.event.id, {
      quantity_total: 10_000,
    });

    await expect(
      pool.query(`UPDATE ticket_types SET quantity_sold = quantity_sold + 501 WHERE id = $1`, [ticketType.id]),
    ).rejects.toThrow(/quantity_sold.*increased by 501.*over the 500 limit/);

    // The whole statement is refused, not partially applied.
    const row = await pool.query('SELECT quantity_sold FROM ticket_types WHERE id = $1', [ticketType.id]);
    expect(row.rows[0].quantity_sold).toBe(0);
  });

  it('rejects an implausibly large single increment (a runaway/bug shape)', async () => {
    const fixture = await createOrgAndPublishedEvent(app);
    const ticketType = await createTicketType(app, fixture.owner, fixture.organization.id, fixture.event.id, {
      quantity_total: 10,
    });

    await expect(
      pool.query(`UPDATE ticket_types SET quantity_sold = quantity_sold + 100000 WHERE id = $1`, [ticketType.id]),
    ).rejects.toThrow(/refused as a probable runaway/);
  });

  it('never blocks a decrement, no matter the size', async () => {
    const fixture = await createOrgAndPublishedEvent(app);
    // Inserted directly at 9000 (INSERT never fires a BEFORE UPDATE
    // trigger) — going through createTicketType + an UPDATE to reach 9000
    // would trip the very increment bound this test needs to get past
    // first.
    const insertResult = await pool.query<{ id: string }>(
      `INSERT INTO ticket_types (event_id, name, price_cents, quantity_total, quantity_sold)
       VALUES ($1, 'Bulk', 1000, 10000, 9000)
       RETURNING id`,
      [fixture.event.id],
    );
    const ticketTypeId = insertResult.rows[0]!.id;

    await expect(
      pool.query(`UPDATE ticket_types SET quantity_sold = quantity_sold - 9000 WHERE id = $1`, [ticketTypeId]),
    ).resolves.toBeDefined();

    const row = await pool.query('SELECT quantity_sold FROM ticket_types WHERE id = $1', [ticketTypeId]);
    expect(row.rows[0].quantity_sold).toBe(0);
  });

  it('does not fire when quantity_sold is unchanged', async () => {
    const fixture = await createOrgAndPublishedEvent(app);
    const ticketType = await createTicketType(app, fixture.owner, fixture.organization.id, fixture.event.id, {
      quantity_total: 10,
    });

    await expect(
      pool.query(`UPDATE ticket_types SET name = 'Renamed' WHERE id = $1`, [ticketType.id]),
    ).resolves.toBeDefined();
  });
});
