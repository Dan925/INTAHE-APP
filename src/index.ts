import { createApp } from './app';
import { env } from './config/env';
import { runDuePayouts } from './services/payouts/payoutService';
import { runReconciliationSweep } from './services/reconciliation/paymentReconciliationService';

const app = createApp();

app.listen(env.PORT, () => {
  console.log(`Intahe API listening on port ${env.PORT}`);
});

// In-process deferred-payout worker — deliberately not wired into
// createApp() (which the test suite uses directly) so tests never start a
// live timer against a mocked Stripe client. Runs once shortly after boot
// so a restart doesn't wait a full interval before the first check, then
// on PAYOUT_WORKER_INTERVAL_MS after that.
function runPayoutWorkerTick(): void {
  runDuePayouts().catch((err) => {
    console.error('Deferred payout worker run failed:', err);
  });
}
setTimeout(runPayoutWorkerTick, 30_000);
setInterval(runPayoutWorkerTick, env.PAYOUT_WORKER_INTERVAL_MS);

// Same not-wired-into-createApp() reasoning as the payout worker above —
// tests must never start a live timer against a mocked Stripe client.
// Runs shortly after boot, then every RECONCILIATION_WORKER_INTERVAL_MS —
// see paymentReconciliationService.ts for what this actually checks.
function runReconciliationWorkerTick(): void {
  runReconciliationSweep().catch((err) => {
    console.error('Payment reconciliation worker run failed:', err);
  });
}
setTimeout(runReconciliationWorkerTick, 45_000);
setInterval(runReconciliationWorkerTick, env.RECONCILIATION_WORKER_INTERVAL_MS);
