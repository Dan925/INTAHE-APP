# Deploying the direct-charge migration — step-by-step runbook

Follow this literally, in order, once per Stripe account (do it once in
test mode against staging before touching the live/production Stripe
account). Each step says exactly what to click and what to check before
moving to the next one.

This runbook only covers the **Stripe Dashboard configuration** and the
**payout-schedule backfill**. It does not cover deploying the code itself
— that's the normal `git push` / Render deploy you already do.

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
9. Deploy/restart the service so it picks up the updated environment
   variable (Render restarts automatically on an env var change; for
   local dev just restart `npm run dev`).

### Verifying it actually worked

Do this after deploying — don't skip it, since a misconfigured scope
fails silently.

1. In the Stripe Dashboard, go to the destination you just created/edited
   (Developers → Webhooks / Event destinations).
2. Make a real test purchase against staging (test mode card
   `4242 4242 4242 4242`, any future expiry, any CVC) through the actual
   checkout flow — not a manually-crafted webhook payload.
3. Back in the Stripe Dashboard's destination detail page, look at the
   **event log** / **recent deliveries**. You should see a
   `payment_intent.succeeded` event listed with a **200 response** from
   your server, and its payload should show an `"account"` field near the
   top (the connected account's `acct_...` id) — that field being present
   is the actual proof the event was scoped to the connected account, not
   the platform.
4. Confirm the order actually moved to `paid` in the database (or via
   `GET /v1/organizations/:organizationId/events/:eventId/orders/:orderId`)
   and that a confirmation email went out.
5. If the event log shows **no delivery at all** for that purchase, the
   scope isn't configured correctly — go back to step 5/6 above and
   re-check the event scope setting.
6. Repeat this whole "Part 1" section once more for **live mode**, using
   the production webhook URL and a real low-value card, before
   considering production ready.

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
