# Deploying the direct-charge migration — step-by-step runbook

Follow this literally, in order, once per Stripe account (do it once in
test mode against staging before touching the live/production Stripe
account). Each step says exactly what to click and what to check before
moving to the next one.

This runbook covers the **Stripe Dashboard configuration**, the **deploy
and verification sequence**, the **payout-schedule backfill**, and **what
to do if verification fails**. It does not cover the mechanics of `git
push` / the Render deploy itself beyond when to trigger it.

---

## Part 0 — Before you start: published paid events already on sale

**Why this step exists**: the deploy in Part 1b below has a window,
between the moment the new code goes live and the moment its first
verification purchase confirms the webhook pipeline works, during which a
**real buyer could complete a real purchase** on an event that's already
published and selling paid tickets. If that happens before verification,
that buyer is charged with no ticket issued — see "If Step 10 fails"
below for what that costs to fix. Checking this first tells you whether
that window is actually exposed to real traffic on this deploy.

1. From the project root, with production's `DATABASE_URL` set (or run it
   directly against the production database):
   ```
   npm run audit:published-paid-events
   ```
   Read-only — a single `SELECT`, makes no changes.
2. If it prints "No published event is currently selling a paid ticket
   type" — the window in Part 1b is not exposed to real traffic. Skip to
   Part 1.
3. If it lists one or more events, depublish each one before deploying:
   ```
   POST /v1/admin/events/:eventId/unpublish
   ```
   (with a platform-admin bearer token — `requirePlatformAdmin`; see
   `README.md`'s "Admin console" section for how `is_platform_admin` gets
   set). This moves the event back to `draft`, which removes it from
   public discovery and from `GET /discover/events/:eventId/ticket-types`
   — nobody can buy from it while it's draft. It does **not** cancel the
   event or touch existing orders.
4. Deploy and complete verification (Part 1b, through Step 10) with these
   events depublished.
5. Once Step 10 has passed, republish each event normally — the
   organizer's own "Publish" button (`manageEventPage.js`) does this;
   `unpublish` only ever produces `draft`, never `cancelled`, so
   `POST /v1/organizations/:organizationId/events/:eventId/publish` from
   the organizer's own account works exactly as it did before.

---

## Part 1 — Stripe Dashboard: receive events from connected accounts

**Why this step exists**: before this migration, `payment_intent.succeeded`
and related events arrived from Intahe's own (platform) Stripe account.
Under direct charges, those same event types now fire from each
**connected account** (the organizer's own Stripe account) instead. If you
skip this step, the code deploys fine, checkout still works, but the
webhook that marks orders `paid` and issues tickets **will silently never
fire** — orders will sit `pending` forever. This is the single most
important step in this runbook.

1. Log into the [Stripe Dashboard](https://dashboard.stripe.com).
2. Make sure you're in the right mode (test mode toggle, top right) —
   do this whole runbook in **test mode** first, against the staging
   environment, before repeating it in **live mode** for production.
3. Go to **Developers → Webhooks** (or **Developers → Event
   destinations**, depending on which UI Stripe shows your account —
   both lead to the same configuration).
4. You should already see one existing destination for this app's webhook
   URL (`https://<your-api-host>/v1/stripe/webhook`) — the one currently
   receiving `payment_intent.succeeded`, `payment_intent.canceled`,
   `payment_intent.payment_failed`, and `account.updated`. **Do not
   delete it.**
5. Check whether that existing destination already has its **event scope**
   (sometimes called "Listen to events on" or "Connected accounts") set to
   include connected accounts:
   - If your Dashboard shows a toggle or dropdown for "Your account" vs
     "Connected accounts" vs "Both" on the *same* destination — switch it
     to **Both**, and confirm `payment_intent.succeeded`,
     `payment_intent.canceled`, and `payment_intent.payment_failed` are
     still selected as event types. Save. Skip to step 7.
   - If your Dashboard instead requires a **separate destination per
     scope** (this is the case for newer "Event Destinations" — the code
     comments in `src/services/stripe/stripeWebhooks.ts` already expect
     this, since `account.updated` was set up this way originally) —
     continue to step 6.
6. Create a **new** Event Destination:
   - **URL**: the exact same webhook URL as the existing destination
     (`https://<your-api-host>/v1/stripe/webhook`).
   - **Event scope**: "Connected accounts" (not "Your account").
   - **Events to send**: `payment_intent.succeeded`,
     `payment_intent.canceled`, `payment_intent.payment_failed`.
   - Save.
7. Stripe will show a **signing secret** (starts with `whsec_`) for
   whichever destination you just created or edited. Copy it.
8. Open your environment variables (Render dashboard → the service →
   Environment, or your `.env` file for local dev) and find
   `STRIPE_WEBHOOK_SECRET`. It's a **comma-separated list** — add the new
   secret from step 7 to the list (don't remove the existing one/ones):
   ```
   STRIPE_WEBHOOK_SECRET=whsec_existing_one,whsec_the_new_one_from_step_7
   ```
   This is safe to do **before** the new code is deployed: signature
   verification (`src/services/stripe/stripeWebhooks.ts`,
   `constructWebhookEvent`) has accepted a comma-separated list of
   secrets since before this migration (commit `4f4bbfe`), so the
   currently-running code already tolerates an extra secret in the list.
9. Render restarts the service automatically on an env var change (or, for
   local dev, restart `npm run dev`) — this alone does not deploy new
   code, just picks up the new secret.

---

## Part 1b — Deploy the code and verify

Do this only after Part 0 and Part 1 (staging, test mode) are both done.

**The order matters and is not optional**: merging to `main` triggers an
**automatic** deploy of `intahe-api-staging` (`autoDeploy: true` in
`render.yaml`) — there is no manual gate on staging. Production
(`intahe-api-production`) has `autoDeploy: false` — it only deploys when
someone clicks "Deploy" in the Render dashboard, which is what makes Steps
6-10 below possible to do deliberately rather than accidentally.

```
STAGING (test mode — no real money at risk)

1. Confirm Part 0 and Part 1 are both done for staging.
2. Merge the migration branch to main. This alone triggers the
   intahe-api-staging deploy.
3. Within 2-3 minutes of the deploy finishing, make a real test purchase
   on staging (card 4242 4242 4242 4242, any future expiry, any CVC)
   through the actual checkout flow — never a hand-crafted webhook
   payload.
4. Verify: in the Stripe Dashboard, the Part 1 destination's recent
   deliveries show a payment_intent.succeeded with a 200 response AND an
   "account" field (acct_...) in the payload — proof the event was scoped
   to the connected account, not the platform. Also confirm the order
   reached "paid" (GET .../orders/:orderId) and the confirmation email
   sent.
   If no delivery appears at all: STOP. Go back to Part 1, step 5/6 — the
   event scope isn't configured correctly.

PRODUCTION (live mode — real money) — only after step 4 above passes

5. Repeat Part 1, steps 1-8, in LIVE mode against the production webhook
   URL. Add the new live whsec_ to intahe-api-production's
   STRIPE_WEBHOOK_SECRET.
6. In the Render dashboard, click "Deploy" on intahe-api-production for
   the exact commit just verified on staging.
7. Confirm Part 0 was actually acted on for every event it listed — if
   any were depublished, they must stay depublished until Step 10 below
   passes.
8. As soon as the deploy is "Live" — ideally within the first minute, at
   a moment of low traffic — proceed straight to Step 9. Do not leave
   this gap open longer than necessary.
9. Make ONE real purchase, yourself, for a small real amount, on one of
   your own events, through the real checkout flow with a real card.
   This is deliberate: it makes the very first live-mode transaction
   through the new code one you control, instead of leaving that role to
   whichever real customer happens to check out first.
10. **Verify — this is the step this runbook refers to elsewhere as "Step
    10"**: in the Stripe Dashboard (live mode), the destination's recent
    deliveries show a payment_intent.succeeded with a 200 response and an
    "account" field. The order reached "paid". A ticket exists for it.
    The confirmation email arrived.

    If ALL of the above are true: verification passed. Republish any
    event depublished in Part 0. Proceed to Part 2 (backfill) whenever
    convenient.

    If ANY of the above is false — the buyer in step 9 (you) was charged
    but the order didn't confirm the way it should have: go straight to
    "If Step 10 fails" below. Do not attempt to fix it ad hoc.
11. As an extra check right after Step 10, whether it passed or not: query
    for any OTHER order in the same state —
    `status IN ('pending','expired') AND stripe_payment_intent_id IS NOT
    NULL AND created_at > (deploy time)`. A row here that isn't your own
    Step 9 purchase means a real customer hit the same failure during the
    gap between Step 8 and Step 10. See "If Step 10 fails" below for each
    one found. (This one-off check is now also covered on an ongoing
    basis by the reconciliation worker — see Part 3 — but checking by
    hand immediately after this specific deploy is still worth doing:
    the worker's detection threshold, `RECONCILIATION_STALE_MINUTES`,
    means it won't raise an alert for several minutes.)
```

---

## If Step 10 fails: reconstructing an order from a successful PaymentIntent

Use this whenever a buyer's PaymentIntent shows `succeeded` at Stripe but
their order is still `pending` (or `expired`) in the database — whether
that's the Step 10 purchase itself, an order Step 11 turned up, or an
alert from the ongoing reconciliation worker (Part 3). **Do this — don't
improvise a fix while a buyer is waiting.**

### Preferred path: the admin console reconciliation action

This is the same thing the steps below do by hand, already wired up,
tested, and audited — use this unless the admin console itself is
unreachable.

1. Sign in as a platform admin and go to `/admin/reconciliation`
   (`GET /v1/admin/reconciliation` lists every open incident — also
   reachable directly if you already know the order id).
2. Confirm the order shown is the one you're trying to fix: buyer email,
   amount, and the `pi_...` PaymentIntent id should match what you expect.
3. Click "Reissue tickets" (`POST /v1/admin/orders/:orderId/reconcile`).
   This re-checks the PaymentIntent against Stripe itself one more time
   (never trusts a cached status), and if it's genuinely `succeeded`, runs
   the **exact same transaction** the real webhook would have run
   (`markOrderPaidAndIssueTickets` — order → `paid`, tickets minted,
   confirmation email sent) — no new payment is created or requested.
4. If it refuses with `payment_not_succeeded`: the PaymentIntent is not
   actually `succeeded` at Stripe right now (it may have failed, or be
   mid-flight) — do not force this. Check the PaymentIntent directly in
   the Stripe Dashboard before doing anything else.
5. The incident is marked resolved (`manual_reissue`, with who and when)
   whether or not one existed yet from the worker — nothing further to do.

### Manual fallback: if the admin console is unreachable

Only use this if the deploy itself is broken badly enough that the admin
console can't be used — e.g. this failure is happening because the whole
service is down, not just the webhook scope.

1. **Confirm the charge in the Stripe Dashboard directly** — do not trust
   anything else first. Find the PaymentIntent (search by id, or by the
   buyer's email/card in Payments). Confirm its status is `Succeeded` and
   note the exact amount and currency. If it is not `Succeeded`, stop —
   there is nothing to reconcile.
2. **Find the order** in the database:
   ```sql
   SELECT * FROM orders WHERE stripe_payment_intent_id = '<pi_...>';
   ```
   Confirm `status` is `pending` or `expired` and `total_cents` matches
   the amount confirmed in step 1. If they don't match, stop and
   investigate before touching anything — this may be the wrong order.
3. **Do not hand-write ticket rows.** Instead, run the exact same code
   path the webhook and the admin action both use, from a shell with the
   deployed environment's `DATABASE_URL`/`STRIPE_SECRET_KEY`:
   ```ts
   import { markOrderPaidAndIssueTickets } from './src/services/webhooks/stripeWebhookService';
   await markOrderPaidAndIssueTickets('<pi_...>');
   ```
   (e.g. `npx tsx -e "..."`, or a one-off script under `src/scripts/` if
   you need to do this for several orders at once). This function is
   idempotent (a no-op if the order is already `paid`) and handles the
   `expired` case correctly (re-reserving inventory rather than refusing
   the sale), exactly as it would from a real webhook delivery.
4. Confirm the result: `SELECT status, tickets_issued_at FROM orders WHERE
   id = '<order_id>'` should show `paid` and a timestamp; `SELECT * FROM
   tickets WHERE order_id = '<order_id>'` should show the expected
   quantity. Confirm the buyer received the confirmation email.
5. Record what happened, even by hand, in
   `payment_reconciliation_incidents` so the admin console's history
   stays complete:
   ```sql
   INSERT INTO payment_reconciliation_incidents
     (order_id, stripe_payment_intent_id, amount_cents, resolved_at, resolved_by, resolution)
   VALUES ('<order_id>', '<pi_...>', <amount_cents>, now(), '<your user id>', 'manual_reissue');
   ```
6. Fix whatever made the admin console unreachable before doing this
   again for a second order — this fallback exists for the one emergency
   case, not as a routine alternative to the admin console.

---

## Part 2 — Backfill: put existing connected accounts on manual payout schedule

**Why this step exists**: `createConnectedAccount` (the code path for a
*newly* connecting organizer) now sets the connected account's Stripe
payout schedule to `manual` at creation time, so the platform — not
Stripe's own default schedule — controls when money moves to the
organizer's bank (see "Deferred payout" in `README.md`). Any organization
that connected Stripe **before** this shipped is still on whatever
schedule Stripe defaulted them to, and will keep getting paid out
automatically until this backfill runs against their account.

This step **touches real organizer Stripe accounts** — get explicit
sign-off before running it with `--apply` in live mode, separately from
sign-off on deploying the code itself.

1. Make sure the code from this migration is already deployed and
   running (the backfill script imports the app's own DB connection and
   Stripe service code, so it needs the same environment it runs in —
   run it from the same environment/host as the deployed service, or with
   the same `DATABASE_URL`/`STRIPE_SECRET_KEY` env vars set locally).
2. **Dry run first — always.** From the project root:
   ```
   npm run backfill:payout-schedule
   ```
   This makes **no changes**. It prints one line per connected
   organization: `[skip]` if it's already on a manual schedule, or
   `[would update]` if it isn't, followed by a summary count.
3. Read the output. Sanity-check the count of `[would update]` lines
   against how many organizations you actually expect to have connected
   Stripe before this migration.
4. Get explicit go-ahead to proceed for real, separately from whoever
   approved deploying the code.
5. Run it for real:
   ```
   npm run backfill:payout-schedule -- --apply
   ```
   Each line now reads `[updated]` instead of `[would update]`. Any
   `[error]` lines name the organization and the Stripe error — those
   accounts were not changed and can be safely re-run later (the script
   is idempotent: an account already on manual gets `[skip]`d, so re-running
   it after fixing a transient error is always safe).
6. Repeat for the live Stripe account/production environment once you've
   confirmed the test-mode run behaved as expected.

---

## Part 3 — Continuous reconciliation monitoring

Steps 10-11 above are a one-time check at deploy time. This is the
permanent version of the same check, because the underlying risk isn't
deploy-specific: a buyer charged with no ticket issued is the same
problem whether it's caused by a webhook misconfiguration on this exact
deploy, a later Stripe outage, or a code regression six months from now.

- **Detection**: an in-process worker (`runReconciliationSweep`, wired up
  in `src/index.ts` next to the existing payout worker) runs every
  `RECONCILIATION_WORKER_INTERVAL_MS` (default 5 minutes). Each run:
  finds every order still `pending`/`expired` with a PaymentIntent, older
  than `RECONCILIATION_STALE_MINUTES` (default 10), and not already
  flagged; asks Stripe directly whether that PaymentIntent actually
  succeeded; if it did, records a row in
  `payment_reconciliation_incidents` and alerts (see below). It also
  auto-closes any open incident whose order has since reached `paid` on
  its own (a delayed webhook retry catching up before anyone had to act).
- **Alert**: a structured `console.error('[payment_reconciliation]', ...)`
  (the one call site to wire into a real paging tool — Sentry, PagerDuty
  — once one is installed) plus an email to every user with
  `is_platform_admin = true`, sent the moment the incident is detected —
  not batched into some later summary.
- **Fixing it**: `/admin/reconciliation` in the admin console, or
  `POST /v1/admin/orders/:orderId/reconcile` directly — see "If Step 10
  fails" above, "Preferred path" section. The exact same action, whether
  the worker found it or a human did.

This worker runs continuously in every environment once this code is
deployed — there's nothing further to configure for it beyond the two env
vars above, both of which have sane defaults.

---

## Rollback

Reverting the *code* (going back to the previous deploy) is safe on its
own — `orders.stripe_charge_mode` records which shape each order actually
used, so refunds on any order created while direct charges were live stay
correct even after a code rollback. See "Direct charges, not destination
charges" in `README.md`.

Reverting the *Stripe Dashboard configuration* from Part 1 is not
something you generally need to do — leaving the connected-accounts event
scope configured causes no harm even if the code is rolled back (the
platform-scoped events, if the old code path used them, keep arriving
independently). Reverting Part 2's payout-schedule changes (putting
accounts back on an automatic schedule) has no code-level dependency
either — do it directly in the Stripe Dashboard per account, or write a
symmetrical one-off script, only if you actually decide you want Stripe's
automatic payouts back.

A code rollback does **not** un-flag any open `payment_reconciliation_incidents`
row — those describe real buyer charges that happened regardless of which
code version is currently running, and stay open (and keep alerting on
every worker tick) until resolved through the admin console or the manual
fallback above.
