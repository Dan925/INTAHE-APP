import { pool } from '../../src/config/database';

export async function truncateAllTables(): Promise<void> {
  await pool.query(`
    TRUNCATE TABLE
      transactions,
      tickets,
      order_line_items,
      orders,
      ticket_types,
      events,
      organization_members,
      organizations,
      password_reset_tokens,
      users
    RESTART IDENTITY CASCADE
  `);
}
