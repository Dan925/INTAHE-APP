/**
 * One-time backfill: sets the manual payout schedule (settings.payouts.
 * schedule.interval = 'manual') on every already-connected Stripe account.
 *
 * Why this is needed at all: createConnectedAccount (src/services/stripe/
 * stripeConnect.ts) only started requesting a manual schedule once the
 * deferred-payout feature shipped. Any organization that connected Stripe
 * *before* that stayed on Stripe's default automatic schedule — for those
 * accounts, the "funds stay put until 48h after the event ends" promise on
 * the organizer dashboard is simply false until this script (or an
 * equivalent one-off `accounts.update` call) runs against them.
 *
 * Touches real organizer Stripe accounts, so it is dry-run by default: it
 * only lists what it would change. Nothing is modified unless --apply is
 * passed explicitly.
 *
 * Usage:
 *   npx tsx src/scripts/backfillManualPayoutSchedule.ts            # dry run
 *   npx tsx src/scripts/backfillManualPayoutSchedule.ts --apply    # for real
 */
import { pool } from '../config/database';
import { retrieveAccount, setAccountPayoutScheduleToManual } from '../services/stripe/stripeConnect';

interface OrganizationAccountRow {
  id: string;
  name: string;
  stripe_account_id: string;
}

async function main(): Promise<void> {
  const apply = process.argv.includes('--apply');
  console.log(apply ? 'Running in APPLY mode — this will modify live Stripe accounts.' : 'Running in DRY-RUN mode — no changes will be made. Pass --apply to actually update accounts.');

  const result = await pool.query<OrganizationAccountRow>(
    `SELECT id, name, stripe_account_id FROM organizations
     WHERE stripe_account_id IS NOT NULL AND deleted_at IS NULL
     ORDER BY created_at ASC`,
  );

  let alreadyManual = 0;
  let updatedOrWouldUpdate = 0;
  let errored = 0;

  for (const org of result.rows) {
    try {
      const account = await retrieveAccount(org.stripe_account_id);
      const currentInterval = account.settings?.payouts?.schedule?.interval;

      if (currentInterval === 'manual') {
        alreadyManual += 1;
        console.log(`[skip] ${org.name} (${org.id} / ${org.stripe_account_id}) — already manual.`);
        continue;
      }

      updatedOrWouldUpdate += 1;
      if (apply) {
        await setAccountPayoutScheduleToManual(org.stripe_account_id);
        console.log(
          `[updated] ${org.name} (${org.id} / ${org.stripe_account_id}) — was '${currentInterval}', now manual.`,
        );
      } else {
        console.log(
          `[would update] ${org.name} (${org.id} / ${org.stripe_account_id}) — currently '${currentInterval}'.`,
        );
      }
    } catch (err) {
      errored += 1;
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[error] ${org.name} (${org.id} / ${org.stripe_account_id}) — ${message}`);
    }
  }

  console.log('');
  console.log(
    `Done. ${result.rows.length} connected organization(s) checked: ` +
      `${alreadyManual} already manual, ` +
      `${updatedOrWouldUpdate} ${apply ? 'updated' : 'would be updated'}, ` +
      `${errored} errored.`,
  );
  if (!apply && updatedOrWouldUpdate > 0) {
    console.log('Re-run with --apply to make these changes for real.');
  }

  await pool.end();
}

main().catch((err) => {
  console.error('Backfill script failed:', err);
  process.exitCode = 1;
});
