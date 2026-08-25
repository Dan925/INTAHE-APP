/**
 * Read-only audit of every organization's connected Stripe account:
 * prints the OBSERVED value of everything that determines who is on the
 * hook for a chargeback and when money moves, straight from the Stripe
 * API — not what the code requests, not what the docs say the default
 * is. debit_negative_balances in particular has never been verified
 * against real connected accounts (only against the Stripe SDK's type
 * definitions) — this script is that verification.
 *
 * Makes no writes of any kind — every call is a plain `retrieve`.
 *
 * Usage:
 *   npx tsx src/scripts/auditConnectedAccounts.ts
 */
import { pool } from '../config/database';
import { stripeClient } from '../services/stripe/stripeClient';

interface OrganizationAccountRow {
  id: string;
  name: string;
  stripe_account_id: string;
}

async function main(): Promise<void> {
  const result = await pool.query<OrganizationAccountRow>(
    `SELECT id, name, stripe_account_id FROM organizations
     WHERE stripe_account_id IS NOT NULL AND deleted_at IS NULL
     ORDER BY created_at ASC`,
  );

  if (result.rows.length === 0) {
    console.log('No organizations with a connected Stripe account found.');
    await pool.end();
    return;
  }

  console.log(`Auditing ${result.rows.length} connected account(s)...\n`);

  for (const org of result.rows) {
    try {
      const account = await stripeClient.accounts.retrieve(org.stripe_account_id);
      const payoutSettings = account.settings?.payouts;
      const schedule = payoutSettings?.schedule;

      console.log(`${org.name} (${org.id})`);
      console.log(`  stripe_account_id:        ${org.stripe_account_id}`);
      console.log(`  account type:             ${account.type}`);
      console.log(`  controller.type:          ${account.controller?.type ?? '(not present)'}`);
      console.log(`  losses.payments:          ${account.controller?.losses?.payments ?? '(not present)'}`);
      console.log(`  fees.payer:               ${account.controller?.fees?.payer ?? '(not present)'}`);
      console.log(`  debit_negative_balances:  ${payoutSettings?.debit_negative_balances ?? '(not present)'}`);
      console.log(`  payout schedule interval: ${schedule?.interval ?? '(not present)'}`);
      console.log(`  charges_enabled:          ${account.charges_enabled}`);
      console.log(`  payouts_enabled:          ${account.payouts_enabled}`);
      console.log(`  capabilities.card_payments: ${account.capabilities?.card_payments ?? '(not present)'}`);
      console.log(`  capabilities.transfers:     ${account.capabilities?.transfers ?? '(not present)'}`);
      console.log('');
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`${org.name} (${org.id}) — failed to retrieve account ${org.stripe_account_id}: ${message}\n`);
    }
  }

  await pool.end();
}

main().catch((err) => {
  console.error('Account audit script failed:', err);
  process.exitCode = 1;
});
