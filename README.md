# Intahe — Backend

Node.js + TypeScript (strict) REST API for Intahe, an event ticketing platform.
See the project brief for full context; this README only covers running the code.

## Stack

- Node.js + TypeScript (strict mode)
- PostgreSQL, migrated with [`node-pg-migrate`](https://github.com/salsita/node-pg-migrate) (plain SQL migrations)
- Express, versioned REST API under `/v1`
- Stripe Connect (direct charges, Express accounts), one connected account per organization
- Money is always integer cents, never floats; fees are computed once at
  purchase time and stored, never recalculated at display

## Setup

```bash
npm install
cp .env.example .env   # then edit DATABASE_URL / JWT_SECRET for your machine
```

Create the database referenced by `DATABASE_URL`, then run migrations:

```bash
npm run migrate:up
```

## Running

```bash
npm run dev      # ts-node dev server with reload
npm run build    # compile to dist/
npm start        # run the compiled server
```

## Tests

Tests run against a real Postgres database (no mocking of the DB layer).
Point `DATABASE_URL` at a disposable test database before running:

```bash
DATABASE_URL=postgres://postgres:postgres@localhost:5432/intahe_test npx node-pg-migrate up -m src/db/migrations
npm test
```

## CI

`.github/workflows/ci.yml` runs on every push and pull request: `npm ci`,
typecheck, lint, migrate a fresh Postgres 16 service container, `npm test`,
then `npm run build`. Nothing merges green without the full suite passing
against a real database — the same one this README's manual testing
sections use, not a mock.

## Deployment

Two fully separate environments, per the brief ("environnements staging +
production séparés dès le départ") — each with its own service and its own
database, not just different env vars on a shared one.

**Render** (this repo's default — see `render.yaml`):

1. Render dashboard → New → Blueprint → point it at this repo. Render reads
   `render.yaml` and provisions both web services and both Postgres
   databases in one shot.
2. Set the secrets `render.yaml` deliberately leaves out (marked
   `sync: false`, so they're never committed to git) on **each**
   environment separately, in the Render dashboard:
   `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PUBLISHABLE_KEY`
   (safe client-side, but still per-environment since it must match the
   secret key's account/mode), `STRIPE_CONNECT_REFRESH_URL`,
   `STRIPE_CONNECT_RETURN_URL`, `GOOGLE_OAUTH_CLIENT_IDS`. `JWT_SECRET` is
   auto-generated per environment by Render itself — staging and
   production never share one. `APP_BASE_URL` doesn't need setting on
   Render — it defaults to the `RENDER_EXTERNAL_URL` Render injects
   automatically on every web service.
3. Migrations run via `startCommand` (`npm run migrate:up && npm start`),
   not `preDeployCommand` — that's a paid-plan-only feature on Render and
   staging runs on the free tier. `node-pg-migrate` tracks what's already
   applied, so running it on every start (not just fresh deploys) is a
   safe no-op once there's nothing new.
4. **Staging** (`intahe-api-staging`) auto-deploys on every push to `main`.
   **Production** (`intahe-api-production`) does not — `autoDeploy: false`
   is deliberate, so a bad push can't reach real payment traffic without
   someone deliberately promoting it from the Render dashboard once
   staging looks right.
5. Point each environment's Stripe webhook (in the Stripe dashboard) at
   `https://<that-service>.onrender.com/v1/stripe/webhook`, and each
   environment's Google Cloud OAuth client at the corresponding
   `STRIPE_CONNECT_RETURN_URL`/`STRIPE_CONNECT_REFRESH_URL` /whatever
   frontend eventually owns those redirects.

**Fly.io / Railway / anywhere else that wants a container**: use the
`Dockerfile` instead — multi-stage build, production dependencies only,
runs migrations before starting the server on every deploy (`node-pg-migrate`
tracks what's already applied, so re-running it on a restart is a safe
no-op, not just on a fresh deploy). Verified locally in this repo's dev
environment (no Docker daemon available there) by reproducing the same
steps outside a container: fresh `npm ci --omit=dev`, the compiled `dist`
output, and the migrations directory — confirmed it boots and serves real
requests before this was written up.

Stripe is the one thing tests mock — `src/services/stripe/stripePayments.ts`
(`createPaymentIntent`/`retrievePaymentIntent`) is replaced with `jest.mock()`
so checkout tests never hit the network. Webhook signature verification is
tested for real (no mocking): it's pure HMAC over `STRIPE_WEBHOOK_SECRET`,
so `stripe.webhooks.generateTestHeaderString()` can produce a valid signed
request entirely offline. Point `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET`
at real test-mode credentials to exercise checkout against the actual
Stripe API outside of tests.

## Project structure

```
src/
  config/       env loading, pg pool
  db/migrations SQL migrations (node-pg-migrate)
  middleware/   auth, org-role authorization, error handling, 404
  routes/v1/    versioned Express routers
  services/     business logic, one folder per domain
  types/        shared TS types (DB rows, etc.)
  utils/        errors, validation, password hashing, JWT
  web/          server-rendered web pages: public (discovery, checkout, tickets) + organizer app (login, orgs, events, dashboard...)
public/         static assets for src/web/ (CSS, client-side JS)
tests/          jest + supertest, hits a real Postgres instance
.github/workflows/ci.yml   typecheck + lint + test + build, on every push/PR
render.yaml                 Render Blueprint: staging + production, each with its own DB
Dockerfile                   portable alternative for Fly.io/Railway/self-hosted
```

## API conventions

- Every route is versioned: `/v1/...`, never unversioned.
- Errors are always `{ "error": { "code", "message", "field" } }`; clients
  branch on `code`, never on `message`.
- Pagination is cursor-based (`?cursor=&limit=`), never offset-based. List
  endpoints return `{ items, next_cursor }`.
- A 403 never reveals that a resource exists in another organization: routes
  scoped to `:organizationId` return the same generic 403 whether the
  organization doesn't exist or the caller just isn't a member of it. A 404
  inside a route the caller is already confirmed a member of (e.g. a bad
  event id within an org they belong to) is fine — it can't leak anything
  about another organization.

## Auth (implemented)

- `POST /v1/auth/signup` — email + password signup (`auth_provider = 'email'`)
- `POST /v1/auth/login`
- `POST /v1/auth/password-reset/request` — always returns 200, doesn't reveal
  whether the email is registered. Email delivery failures are caught and
  logged rather than propagated, so a Resend outage can't turn into a
  500-for-real-accounts-only response that would undo the point of always
  returning 200.
- `POST /v1/auth/password-reset/confirm` — single-use, time-limited token
- `POST /v1/auth/google` — body `{ id_token }`. The client (mobile/web) gets
  an ID token from Google's own sign-in SDK and hands it to this endpoint;
  the backend verifies it against Google's public keys (`google-auth-library`,
  checking signature/expiry/issuer/audience) rather than trusting anything
  the client asserts. `401 invalid_google_token` if verification fails,
  `401 google_email_not_verified` if the token is valid but the email on it
  isn't. Matches by `google_sub` (Google's durable user id) first; on a
  first-ever sign-in, falls back to linking an existing `email`-provider
  account with the same verified email instead of creating a duplicate —
  password login keeps working on a linked account, Google becomes a second
  way in, not a replacement. Only creates a brand-new user if neither
  lookup finds anyone.

## Organizations + Events (implemented)

All routes below require `Authorization: Bearer <access_token>`.

- `POST /v1/organizations` — create an organization; the creator becomes its
  `owner` (every organization always has exactly one, enforced by a partial
  unique index on `organization_members`, not just application code)
- `GET /v1/organizations` — organizations the caller belongs to (cursor-paginated)
- `GET /v1/organizations/:organizationId` — any member
- `PATCH /v1/organizations/:organizationId` — owner/admin only

- `POST /v1/organizations/:organizationId/members/invite` — owner/admin; body
  `{ email, role }` (`role` is `admin`/`staff`/`volunteer`, never `owner` —
  the only way to become owner is creating the organization; there's no
  ownership-transfer endpoint). `404 invitee_not_found` if that email has no
  Intahe account yet (invites don't create accounts); `409
  invite_already_pending` / `already_a_member` on conflict.
- `POST /v1/organizations/:organizationId/members/accept` — the invited
  user only, self-service; not gated by `requireOrgRole` since an
  unaccepted invitee isn't a member yet by that middleware's own
  definition. `404 invite_not_found` if there's no pending invite for the
  caller.
- `GET /v1/organizations/:organizationId/members` — owner/admin, cursor-paginated
- `PATCH /v1/organizations/:organizationId/members/:memberId` — owner/admin,
  body `{ role }`; `400 cannot_modify_owner` if the target is the owner
- `DELETE /v1/organizations/:organizationId/members/:memberId` — owner/admin;
  `400 cannot_remove_owner` if the target is the owner (the "exactly one
  owner" invariant holds for removal too, not just creation)

- `POST /v1/organizations/:organizationId/events` — create a draft event (owner/admin)
- `GET /v1/organizations/:organizationId/events` — list events (any member, cursor-paginated)
- `GET /v1/organizations/:organizationId/events/:eventId` — any member
- `PATCH /v1/organizations/:organizationId/events/:eventId` — owner/admin only
- `POST /v1/organizations/:organizationId/events/:eventId/publish` — owner/admin
  only; only valid from `draft` status (`409 event_not_publishable` otherwise)
- `POST /v1/organizations/:organizationId/events/:eventId/cancel` — owner/admin
  only; valid from `draft` or `published` (`409 event_not_cancellable` from
  `cancelled`/`completed`). Deliberately doesn't touch existing orders —
  cancelling an event and refunding its orders are two separate admin
  actions, not one triggering the other as a side effect.
- `POST /v1/organizations/:organizationId/events/:eventId/complete` —
  owner/admin only; only valid from `published` (`409 event_not_completable`
  otherwise)

Role hierarchy (`owner > admin > staff > volunteer`) matches the brief's
permission table exactly, so a single `requireOrgRole(minRole)` middleware
covers every route.

## Ticket Types + Checkout + Stripe (implemented)

- `POST /v1/organizations/:organizationId/events/:eventId/ticket-types` — owner/admin
- `GET .../ticket-types`, `GET .../ticket-types/:ticketTypeId` — any member (cursor-paginated list)
- `PATCH .../ticket-types/:ticketTypeId` — owner/admin

- `POST /v1/events/:eventId/orders` — checkout, public (guest or logged-in
  buyer via optional `Authorization` header). Requires an `Idempotency-Key`
  header — blocking, not optional, per the brief. Body:
  `{ buyer_email, line_items: [{ ticket_type_id, quantity }] }`. Returns
  `{ order, client_secret }`; the order starts `pending` and a Stripe
  `PaymentIntent` is created in the same request as a **direct charge**:
  created in the connected organization's own Stripe context (the
  `stripeAccount` request option) with `application_fee_amount` set to
  `intahe_fee_cents`, so the charge belongs to the organizer from the
  moment it exists and Intahe's balance is never touched. See "Direct
  charges, not destination charges" below for why, and for what happens
  when there's no working connected account.
- `POST /v1/stripe/webhook` — Stripe calls this on `payment_intent.succeeded`;
  marks the order `paid`, generates one `tickets` row (with QR code) per
  unit purchased, and records a `transactions` row. QR codes are generated
  here, at payment confirmation, never at checkout initiation. Idempotent
  against Stripe's at-least-once delivery. Under direct charges these events
  arrive scoped to the *connected* account (Stripe sets a top-level
  `account` field on the event) rather than the platform — the handler
  doesn't need to care, since it looks orders up by `stripe_payment_intent_id`
  alone, but the Stripe Dashboard/Event Destination has to actually be
  configured to deliver connected-account-scoped `payment_intent.*` events
  for this to fire in production. See `docs/stripe-connect-runbook.md`.
- `GET /v1/organizations/:organizationId/events/:eventId/orders`,
  `GET .../orders/:orderId` — owner/admin only ("voir les rapports
  financiers"); order detail includes its tickets.
- `POST .../orders/:orderId/refund` — owner/admin only ("émettre des
  remboursements"). Body `{ amount_cents?, reason }` — `reason` is
  **required**, one of `organizer_cancellation` / `buyer_request` /
  `event_postponed`. It is never inferred from event status or anything
  else: whoever calls this endpoint records, at the moment they call it,
  why the refund is happening — see "Refunds and the application-fee rule"
  below for what that reason actually decides and why it's recorded this
  way. Omit `amount_cents` for a full refund of whatever balance remains.
  Partial refunds can stack (e.g. refund half, then refund the rest later)
  — the refundable balance is derived from
  `SUM(transactions.amount_cents) WHERE type = 'refund'` rather than stored
  redundantly on the order, so it can't drift out of sync. The order moves
  to `partial_refund` while a balance remains, or `refunded` once it hits
  zero; either way it leaves `status = 'paid'`, which is what makes it drop
  out of the dashboard's revenue sums automatically. `409
  order_not_refundable` for a `pending` or already-fully-refunded order;
  `400 invalid_refund_amount` for a request over the remaining balance.

Reserving inventory (`ticket_types.quantity_sold`), inserting the order, and
creating the Stripe PaymentIntent all happen inside one DB transaction — if
the Stripe call fails, the reservation is rolled back, so no capacity is
ever held for an order that never got a PaymentIntent. `ticket_sold_out` is
returned when demand exceeds supply, matching the brief's exact error format
example.

### Direct charges, not destination charges (implemented)

This app migrated from Connect **destination charges** to **direct
charges**. Under destination charges, the `PaymentIntent` was created on
the *platform's* Stripe account (`transfer_data.destination` pointing at
the connected account) — funds touched Intahe's own balance before being
transferred out. Under direct charges, the `PaymentIntent` is created
directly inside the connected account's own Stripe context from the
start; Intahe's balance is never involved, only `application_fee_amount`
moves anything back to the platform.

- **`orders.stripe_charge_mode`** (`'platform' | 'destination' | 'direct'`)
  is written once at order creation and never changed afterwards. It is
  not inferrable after the fact — a destination charge and a direct charge
  both just look like "a PaymentIntent with an application fee" once
  you're looking at historical data, and the two need different API call
  shapes for every future operation on that PaymentIntent (retrieval,
  refunds): a direct charge needs the `stripeAccount` request option, a
  destination charge needs the platform context plus `reverse_transfer`.
  `'destination'` only appears on orders created before this migration
  shipped, backfilled at migration time — refunding one of those orders
  still uses the old shape, indefinitely, regardless of what the
  organization's Connect status looks like today. `'platform'` is the
  plain-charge fallback for an organization with no Connect involvement at
  all — see below, it's now only reachable for a genuinely free ($0)
  order.
- **No silent platform fallback for a paid order.** Two independent gates
  now exist, because paid ticket sales landing on Intahe's own Stripe
  balance is exactly the funds-custodian role this migration exists to
  eliminate:
  1. `ticketTypeService.assertOrganizationCanSellPaidTickets` refuses to
     create — or raise an existing ticket type above $0 — unless the
     organization has a connected, `charges_enabled` Stripe account,
     checked fresh on every such write (not just once). A fully free event
     (every ticket type at $0) never needs Stripe at all, at creation or
     at publish.
  2. `checkoutService.createOrder` is a defense-in-depth backstop behind
     that: if a paid order (`total_cents > 0`) somehow reaches checkout
     without a working connected account — e.g. `charges_enabled`
     regressed via a compliance hold synced through `account.updated`
     *after* the ticket type was created and put on sale — it fails
     explicitly with `409 stripe_not_connected` rather than falling back
     to a plain platform charge.
  A genuinely $0 order (every line item free) still goes through
  `createPaymentIntent` with `amountCents: 0` today, which real Stripe
  will reject as below its minimum charge amount — building a proper
  "skip Stripe, issue tickets immediately" path for $0 orders is flagged
  as follow-up work, not yet implemented.

### Commission grid (implemented)

Intahe's per-ticket commission — separate from Stripe's own processing
fee — is a single reusable calculator (`src/utils/commissionGrid.ts`):
**3% of the ticket price, floored at $0.49, capped at $4.99 per ticket,
and $0 for a free ticket.** Applied per line item in `computeOrderFees`
(`src/utils/fees.ts`), not once against the order subtotal, because the
floor and cap are per-ticket: an order mixing a $5 ticket type with a
$250 one must charge the $5 ticket its $0.49 floor and the $250 ticket
its $4.99 cap independently. Boundary-tested at exactly the prices where
the floor/cap start binding ($16.33 and $166.33) as well as $5 and $250
(`tests/commissionGrid.test.ts`). This is the same calculator meant to
back a future public-facing fee estimator, so it's deliberately
config-driven (`INTAHE_COMMISSION_GRID`) rather than inlined.

### Refunds and the application-fee rule (implemented)

Whether a refund reverses Intahe's application fee back to the buyer
depends only on the required `reason` field above, never on the refund
amount or the order's charge mode:

| Reason | Application fee reversed? |
| --- | --- |
| `organizer_cancellation` | Yes |
| `event_postponed` | Yes — treated identically to a cancellation |
| `buyer_request`, full refund | No |
| `buyer_request`, partial refund | No |

The reasoning: an organizer cancelling (or postponing) means the service
Intahe was paid for didn't happen, so its fee goes back too. A refund the
*buyer* asked for, full or partial, means the service (running checkout,
holding the seat) was rendered — the fee stands regardless of how much of
the order is refunded. `createRefund` (`src/services/stripe/stripeRefunds.ts`)
branches on the order's recorded `stripe_charge_mode`: `'direct'` refunds
inside the connected account's own context with no transfer to reverse
(there isn't one under direct charges); legacy `'destination'` orders keep
using `reverse_transfer` + `refund_application_fee`. Each refund's outcome
— whether the fee was actually reversed — is recorded on the
`transactions` row itself (`application_fee_refunded`), and the order's
`refund_reason` is set from the request, so future accounting can
reconcile exactly why a given commission was or wasn't refunded without
guessing from event status or anything else.

**Interface requirement, not yet built**: before an organizer confirms a
cancellation, the UI must show that Stripe's own processing fee is never
refunded by Stripe and comes out of the organizer's account regardless of
the reason. This is a policy fact independent of the reason above (which
only concerns Intahe's commission, not Stripe's cut) — see the refund
policy content in `src/web/refundContent.ts` §5 for the existing written
version of this same fact.

### Statement descriptor and 3D Secure (implemented)

`statement_descriptor_suffix` on the `PaymentIntent` is built from the
event's name (`src/utils/statementDescriptor.ts`): accents stripped to
their base letters, characters Stripe forbids in a descriptor removed,
truncated to 12 characters, uppercased. An anti-chargeback measure — a
buyer who doesn't recognize a charge on their bank statement is far more
likely to dispute it than refund-request it. Falls back to the connected
account's own default descriptor (no suffix sent at all) when nothing
usable survives sanitization (an event name that's pure punctuation or
digits).

Orders at or above `THREE_D_SECURE_THRESHOLD_CENTS` (default $150)
explicitly request 3D Secure step-up authentication
(`payment_method_options.card.request_three_d_secure: 'any'`) instead of
leaving it to Stripe's automatic, risk-based decision — a higher-value
order is a more attractive chargeback target, worth the extra buyer
friction. Below the threshold, the option is omitted entirely so Stripe's
own regulatorily-required automatic behavior (e.g. EU/UK SCA) is
untouched.

## Deferred payout (implemented)

Funds for a direct charge land on the organizer's own Stripe balance
immediately — deferred payout controls when Stripe actually moves that
balance to their bank, not when the money becomes theirs.

- Every connected account is created with `settings.payouts.schedule.interval:
  'manual'` (`stripeConnect.createConnectedAccount`) — Stripe never pays
  out on its own default cadence; only this platform triggers a payout,
  explicitly.
- `src/services/payouts/payoutService.ts`'s `runDuePayouts` finds events
  whose `end_at` is at least `PAYOUT_DELAY_HOURS` (default 48) in the
  past, have at least one `paid`/`partial_refund` order, and have no
  *successful* payout logged yet. For each, it checks the connected
  account's available Stripe balance (`stripeClient.balance.retrieve`,
  scoped to that account) and triggers a `Payout` for whatever's
  available.
- **`organizer_payouts`** is an insert-only ledger, one row per attempt —
  not one row updated in place — so a failed or no-balance attempt stays
  visible in its own right rather than being overwritten by the next
  retry's outcome. A partial unique index (`status = 'succeeded'`) is the
  only thing preventing a duplicate real payout for the same event; a
  no-balance skip (funds may still be in Stripe's own ~2-day "pending"
  bucket) or a Stripe API failure both leave the event eligible to retry
  on the next worker run, with the error preserved on the failed row.
- An in-process worker (`src/index.ts`, `PAYOUT_WORKER_INTERVAL_MS`,
  default hourly) calls `runDuePayouts` on an interval — deliberately not
  wired into `createApp()`, so the test suite never starts a live timer
  against a mocked Stripe client.
- **`npm run backfill:payout-schedule`** (`src/scripts/backfillManualPayoutSchedule.ts`)
  — a one-time backfill for accounts connected *before* the manual
  schedule became the default at account creation. Dry-run by default
  (lists what it would change, touches nothing); only acts with an
  explicit `--apply` flag, since it modifies live organizer Stripe
  accounts. Run it once per environment as part of deploying this
  migration — see `docs/stripe-connect-runbook.md`.

Two read-only endpoints back the organizer-facing UI (screens not yet
built — see below): `GET /v1/organizations/:organizationId/stripe/payouts`
(owner only) returns the live Stripe balance
("solde encaissé"/"pending" and "solde disponible"/"available"), events
still waiting on their 48h delay with the computed payout date, and the
full attempt history; `GET /v1/organizations/:organizationId/events/:eventId/fee-breakdown`
(owner/admin) returns, per ticket type, price + Intahe's exact commission
(via the commission grid) + tickets sold, plus the event's cumulative
gross/Stripe-fee/Intahe-fee/net totals.

## Admin console (backend implemented, UI not built)

A platform-wide, cross-organization view — deliberately separate from the
per-organization `owner`/`admin`/`staff`/`volunteer` roles, which have no
concept of "Intahe staff" at all.

- **`users.is_platform_admin`** — the only thing that grants access.
  **No API route, script, or admin action of any kind can set or clear
  this column, including for a user who already has it.** It is changed
  by a direct SQL statement only, run by whoever operates the database.
  `tests/adminConsole.test.ts` pins this down: every admin write endpoint
  is probed with `is_platform_admin: true` in its request body, and none
  of them touch the column.
- **`platform_admin_access_log`** — insert-only (same convention as
  `organizer_payouts`): every authorized admin request logs who, when,
  which organization, which resource, and what kind of access — at the
  moment access is granted, not conditioned on what the handler goes on
  to do. A platform admin reading or changing a client organization's
  financial data leaves a permanent trace by construction, not by
  discipline.
- **Read-only by default.** The only write actions the admin console has
  *at this stage*:
  - `POST /v1/admin/organizations/:organizationId/approve` — sets
    `organizations.platform_approved_at`. Data only: nothing in the
    application currently gates anything on this value (no enforcement
    is wired to it yet — a deliberate scope boundary, not an oversight).
  - `POST /v1/admin/events/:eventId/unpublish` — `published` → `draft`
    only; a distinct, reversible action from the organizer's own
    `cancelEvent`.
  - `POST` / `DELETE /v1/admin/events/:eventId/payouts/hold` — excludes
    an event from `payoutService.findDueEvents` regardless of its 48h
    delay, and restores it.
  - `POST /v1/admin/events/:eventId/payouts/trigger` — forces an
    immediate payout attempt for one event, bypassing both the 48h delay
    and any hold, through the exact same `attemptPayout` logic the
    scheduled worker uses (same in-flight guard, same ledger row) — a
    manual trigger can no more double-pay an event than the worker can.
  - `GET /v1/admin/payouts/overview` — everything else is this: `due`
    (exactly what the worker would attempt next, including held events
    so an admin can see and clear a hold, each with `hours_overdue` —
    this list being non-empty *is* the "a payout wasn't executed in time"
    alert, rather than a separate notification pipeline), `executed`,
    and `failed`, across every organization.
- **No buyer personal data.** Nothing here returns an attendee list,
  guest emails, or anything beyond what supervising organizations and
  payouts requires — no export, no plaintext buyer email in any admin
  screen or response.

## Stripe Connect onboarding (implemented)

- `POST /v1/organizations/:organizationId/stripe/onboarding-link` — owner
  only ("gérer facturation / Stripe" is the one row in the brief's
  permission table with no admin access at all). Creates the organization's
  Connect Express account on first call (idempotent — a second call reuses
  the existing `stripe_account_id` instead of creating another one, so
  re-clicking "Connect Stripe" after abandoning onboarding resumes the same
  account) and returns `{ url }`, a Stripe-hosted onboarding link to
  redirect the owner to.
- `GET /v1/organizations/:organizationId/stripe/status` — owner only.
  Returns `{ connected, charges_enabled }`, both read straight from the
  organization row — no live Stripe API call needed.
- `stripe_charges_enabled` (new column on `organizations`) is kept in sync
  by the `account.updated` webhook rather than polled, per Stripe's own
  guidance. Having a connected account isn't the same as being able to
  accept charges on it — onboarding can be started and abandoned — so both
  the paid-ticket-type gate and checkout's own backstop (above) gate on
  `stripe_account_id AND stripe_charges_enabled`.

### Account model and who is legally on the hook (read this before assuming anything)

- **Connect model**: Express accounts, **direct charges** (migrated from
  destination charges — see above).
- **Why Express, not Standard**: Stripe confirmed converting existing
  accounts from Express to Standard is not a settings change — it requires
  recreating every connected account from scratch and every organizer
  redoing onboarding in full. Given organizers are already connected under
  Express, that cost is why this stays on Express rather than moving to
  Standard.
- **`controller.fees.payer: 'application'`** (v1 Accounts API — this
  integration does not use the v2 Core Accounts API, so v2's
  `fees_collector` field doesn't apply here at all). Explicitly set,
  overriding the API default of `'account'`: **Intahe pays Stripe's own
  processing fees**, not the organizer, regardless of charge type.
- **`controller.losses.payments: 'application'`** — required by Stripe for
  an Express account's `stripe_dashboard`, not optional. **Intahe, not the
  organizer, is financially liable for chargeback/dispute losses.** This
  is independent of the destination-vs-direct-charge migration — it was
  true before and stays true after; charge type controls *where the money
  sits*, not *who eats a dispute*. This is a decision to revisit, not a
  fact to design around indefinitely: it means every organizer's dispute
  exposure currently sits on Intahe's own Stripe balance.
- **`debit_negative_balances`** is not explicitly set anywhere in this
  codebase. Per Stripe's own account API documentation, its default is
  `false` only when `controller.requirement_collection` is `'application'`;
  Express accounts implicitly get `'stripe'` for that field, so the
  *effective default here is `true`* — Stripe will attempt to reclaim a
  negative balance from a connected account's own bank account if one
  occurs. How that default interacts with `losses.payments: 'application'`
  above (which is meant to keep the *platform* liable, not the organizer)
  has not been confirmed directly with Stripe and should be before this
  is treated as settled — the two settings are documented somewhat
  independently and their interaction under this specific combination
  isn't fully verifiable from the API reference alone.
  **`npm run audit:connected-accounts`** (`src/scripts/auditConnectedAccounts.ts`)
  checks this — and every other value on this list — against real
  connected accounts via a read-only Stripe API call, printing the
  *observed* value per organization rather than the documented default.
  Run it before treating any line in this section as settled for accounts
  that actually exist.
- **Dispute/litigation webhooks (`charge.dispute.created`,
  `dispute.closed`) and refunds issued outside this application
  (`charge.refunded`) are explicitly out of scope for this migration** —
  see "Out of scope for this MVP" below.

### Reservation expiry (implemented)

A `pending` order's reservation isn't held forever: `orders.reservation_expires_at`
is set at creation (`ORDER_RESERVATION_TTL_MINUTES`, default 20) and released —
`quantity_sold` decremented, order moved to `expired` — either lazily (right
before `reserveInventory` reserves capacity for a *new* order on the same
ticket type, scoped to just that ticket type, inside the same transaction —
no cron/`setInterval` in the web process) or immediately on
`payment_intent.canceled`/`payment_intent.payment_failed`. **Payment always
wins**: if `payment_intent.succeeded` arrives for an order that already
expired (the sweep or a `payment_failed` on a retried PaymentIntent beat it),
`markOrderPaidAndIssueTickets` re-increments `quantity_sold` before marking
it paid — a confirmed payment is never refused because its reservation
lapsed in the meantime. See `src/services/checkout/orderReleaseService.ts`.

#### Capacity overshoot: an accepted trade-off, not a defect (implemented)

The re-increment above (`reReserveAfterLatePayment`) doesn't re-check
capacity, so `quantity_sold` can end up above `quantity_total`. Concretely:
a ticket type at full capacity releases (reservation expires), someone
else immediately buys the now-free capacity, and *then* the original
PaymentIntent's late `payment_intent.succeeded` arrives — that order is
honored regardless, pushing `quantity_sold` over `quantity_total` for as
long as both orders' tickets are valid.

**This is a deliberate arbitration, not a bug: honoring a confirmed
payment always takes priority over a ticket type's capacity.** The
alternative — rejecting the late payment because capacity is gone — isn't
actually available anyway: Stripe has already moved real money by the time
this webhook fires, so "rejecting" it would mean charging a buyer and
never giving them a ticket, which is worse than a narrow, rare
overshoot. What *is* owed to the organizer is visibility, so it doesn't
have to be discovered at the door:

- **`ticket_types` no longer has a *cumulative* DB constraint enforcing
  `quantity_sold <= quantity_total`.** It used to (`ticket_types_sold_within_total`),
  and that was itself a bug, not a safety net: the constraint applied to
  every write, including this one, so the late-payment UPDATE would throw,
  the whole webhook transaction would roll back, and the order would stay
  `expired` forever despite the buyer having genuinely paid — "payment
  always wins" silently *not* winning. Every other write path
  (`reserveInventory`'s atomic conditional UPDATE, `writeRelease`'s
  decrement) already enforces capacity at the application level and never
  relied on the DB constraint, so dropping it only changes behavior for
  the one path it was quietly sabotaging. An organizer manually lowering
  `quantity_total` below what's already sold is still rejected — that
  check moved into `ticketTypeService.updateTicketType` at the application
  level, since it's a different concern (an organizer's own edit, not a
  payment being honored).
- **A DB-level backstop still exists, just a different shape: a `BEFORE
  UPDATE` trigger bounding the *delta* of a single write, not the
  cumulative total** (`ticket_types_bound_quantity_sold_increment`,
  see that migration for the full reasoning). A plain numeric margin on
  top of `quantity_total` was considered and rejected: because it gates
  the cumulative value, every legitimate overshoot would permanently eat
  into the same margin, and once exhausted, the next genuinely-paid order
  would be silently rejected — reproducing the exact bug that got the
  original constraint dropped, just delayed and much harder to diagnose.
  A trigger comparing `NEW.quantity_sold - OLD.quantity_sold` against a
  fixed per-write bound (1000, deliberately sized as a 20x multiple of
  `MAX_QUANTITY_PER_ORDER` — see below — so no real order can ever
  approach it) doesn't have that flaw: it judges each write only against
  itself, so it never accumulates against past legitimate incidents. It
  still exists purely to catch a genuine runaway (a loop bug, a bad bulk
  UPDATE, a fat-fingered manual query) — application code is still what's
  trusted for the actual capacity/payment arbitration. This bound is
  coupled to `MAX_QUANTITY_PER_ORDER` by documentation, not code (a
  Postgres trigger can't read the Node process's env config) — it was
  raised from 500 to 1000 in a follow-up migration when
  `MAX_QUANTITY_PER_ORDER` moved from 20 to 50, to keep the same order of
  safety margin; if that cap changes again, this bound should be
  revisited too.
- **Every overshoot is persisted** to `capacity_overshoot_incidents`
  (organization, event, ticket type, order, `quantity_sold`,
  `quantity_total`, `overshoot_quantity`, timestamp) in the same
  transaction as the re-increment — queryable after the fact, and the
  intended source for a future ledger.
- **Logged at alert level** (`console.error('[capacity_overshoot]', ...)`,
  `capacityOvershootService.ts`) with the same structured fields — the one
  call site to swap for `Sentry.captureMessage` once Sentry is installed.
- **Emailed to the organizer at the moment of the incident** — the
  organization's `contact_email` if set, else its owner's — not folded
  into some pre-event summary.
- **Surfaced on the organization dashboard**
  (`GET /v1/organizations/:organizationId/dashboard`, both web and mobile):
  a "Capacity exceeded by N" badge per affected event, expandable to the
  list of affected orders via `GET /v1/organizations/:organizationId/events/:eventId/capacity-incidents`.
- **Never blocks check-in.** `checkInTicket` doesn't consult
  `quantity_total` as a gate — it never did — so a valid, unscanned ticket
  always checks in regardless of capacity. What changed: the response now
  also reports whether the ticket type is currently over capacity
  (`ticket_type_capacity_exceeded`, `ticket_type_overshoot_quantity`), and
  both the web and mobile check-in screens show a non-blocking warning
  banner on scan so door staff know the headcount may run over the
  printed capacity, without a scan ever being refused.

Operational note: `payment_intent.canceled` and `payment_intent.payment_failed`
need to actually be subscribed to on the Stripe Dashboard's Event
Destination(s) for this to fire in production — same step as when
`payment_intent.succeeded`/`account.updated` were first configured.

**Availability shown on public reads is corrected for the same expired
reservations, without writing anything.** The lazy sweep above only runs
inside `reserveInventory`, i.e. when *someone actually attempts a
checkout* — but public availability (`/discover`, the event page) reads
`ticket_types.quantity_sold` directly. Left uncorrected, a ticket type
whose stock is entirely tied up by abandoned carts reads as sold out
forever: nobody sees it's actually available, so nobody goes to checkout,
so the sweep that would free it never runs. `ticketTypeService.listTicketTypes`
closes this by subtracting still-`pending`-but-expired reservations from
`quantity_sold` at read time (a `LEFT JOIN LATERAL` mirroring the same
condition `releaseExpiredReservations` uses) rather than triggering a write
from a GET request. The stored counter stays stale until someone actually
buys — only the number shown is corrected. The same correction (a
single-row version of the same query, `getExpiredPendingQuantity`) is
applied to `getTicketType`/`updateTicketType` too, even though no current
UI reads the singular ticket-type endpoint — kept consistent rather than
leaving an asymmetric "raw here, corrected there" trap for whatever reads
it next.

Every place that computes ticket-type availability, and whether it's
corrected:
- `ticketTypeService.listTicketTypes` — corrected. Feeds both
  `GET /v1/discover/events/:eventId/ticket-types` (public event page, web
  + mobile) and the organizer's own ticket-types list
  (`GET /v1/organizations/.../ticket-types`, `manageEventPage.js` +
  mobile) — it's the same function either way.
- `ticketTypeService.getTicketType`/`updateTicketType` — corrected (see
  above), though currently unused by any web/mobile UI.
- `checkoutService.reserveInventory`'s atomic
  `UPDATE ... WHERE quantity_sold + $n <= quantity_total` — the actual
  purchase-time gate, not a display read. Always live and correct by
  construction (row-locked, single statement), preceded by the lazy sweep;
  staleness can't apply to it the way it can to a separate SELECT.
- The organizer dashboard (`dashboardService.getOrganizationDashboard`,
  `orgDashboardPage.js`, mobile `dashboard.tsx`) — not applicable. It
  computes `tickets_sold` from `SUM(order_line_items.quantity)` joined only
  to `status = 'paid'` orders, never touching `ticket_types.quantity_sold`
  at all, so pending/expired reservations were never counted here in the
  first place.
- Guest list, check-in, orders list — don't reference ticket-type capacity
  at all.

Two tables exist beyond the brief's core schema, both required to make the
above work: `password_reset_tokens` (auth) and `order_line_items`, which
records what was purchased before any `tickets` row exists (needed because
ticket/QR generation is deferred to payment confirmation).

### Rate limiting (implemented)

`POST /v1/auth/login`, `POST /v1/auth/signup`, `POST
/v1/auth/password-reset/request`, `GET
/v1/events/:eventId/orders/:orderId/tickets` (buyer ticket lookup), `GET
/v1/events/:eventId/orders/:orderId/confirmation`, and `POST
/v1/events/:eventId/orders` (checkout) each run two independent limiters
(`src/middleware/rateLimit.ts`, `express-rate-limit`): one keyed by client
IP, one keyed by the target identifier in the request (`email`/`buyer_email`,
or the `orderId` being looked up/polled). Either tripping returns `429`
with a stable `{ error: { code: 'rate_limited', ... } }` body and a
`Retry-After` header (set automatically by the library). Keying by target
identifier as well as IP matters because an attack spread across many IPs
against one account, or one IP hitting many accounts, are both still caught.
Limits/windows are configurable per route via `AUTH_RATE_LIMIT_*`,
`TICKET_LOOKUP_RATE_LIMIT_*`, `CONFIRMATION_RATE_LIMIT_*`, and
`CHECKOUT_RATE_LIMIT_*` env vars (see `.env.example`).

This service runs behind Render's reverse proxy, which adds exactly one
`X-Forwarded-For` hop. `app.set('trust proxy', 1)` in `app.ts` tells Express
to trust exactly that one hop when resolving `req.ip` — required for the
IP-keyed limiter to actually see each client's real IP. **Do not** set this
to `true`: that trusts the *entire* `X-Forwarded-For` chain, which lets a
client prepend any IP it wants to that header and have Express believe it —
defeating IP-based rate limiting entirely. Leaving `trust proxy` unset would
have the opposite failure mode: every request resolves to Render's proxy
address, so all callers share one bucket and rate limiting blocks everyone
at once. `express-rate-limit` validates this itself at request time and
throws on either misconfiguration.

Rate limiting is disabled by default under `NODE_ENV=test`
(`RATE_LIMIT_ENABLED` in `config/env.ts`) — the rest of the test suite hits
these routes many times from one fixed, un-forwarded IP via shared fixture
helpers, which isn't a real attack pattern and isn't what those tests are
checking. `tests/rateLimit.test.ts` opts back in explicitly (setting
`RATE_LIMIT_ENABLED=true` for just that file) to exercise the real, wired-up
routes end to end, in addition to unit-testing the limiter factories
directly with small explicit limits.

`RATE_LIMIT_ENABLED=true` is set explicitly in `render.yaml` for both
staging and production — not left to the `NODE_ENV !== 'test'` default, so
it's visible directly in the deploy config rather than something you have
to trace through `env.ts`'s fallback logic to confirm.

### Checkout quantity caps (implemented)

Before this, nothing bounded `line_items[].quantity` on `POST
/v1/events/:eventId/orders`, or how many line items an order could hold.
One request could reserve a ticket type's — or, spread across several line
items, an entire event's — whole remaining stock for the reservation
window (`ORDER_RESERVATION_TTL_MINUTES`, 20 minutes by default), without
ever paying: an inventory-hoarding vector, not just a nuisance, since it
denies real buyers the ability to check out at all while it holds.

`createOrderSchema` (`src/routes/v1/checkout.ts`) now enforces two caps:
`MAX_QUANTITY_PER_LINE_ITEM` (10) on each line item's `quantity`, and
`MAX_QUANTITY_PER_ORDER` (50) on the sum across every line item in the
order — the second one closes the gap the first alone wouldn't: splitting
a large reservation across many line items or ticket types.

The two aren't set to the same value: 10/line matches a single table —
Intahe's target segment (nonprofits with a board, sports leagues, galas,
festivals) sells tables of 8-10 — while 50/order specifically
accommodates a sponsor buying several tables in one transaction (e.g. 3
tables of 10 = 30) without forcing a split across orders, which is exactly
the kind of purchase this platform wants to support in one checkout.
Inventory-hoarding itself is already covered by reservation expiry and
the checkout rate limit below — these two caps only bound how much a
single isolated request can grab, so raising the per-order cap from an
earlier, tighter value barely moved that protection. A legitimate buyer
needing more than 50 tickets in one go places more than one order.

`POST /v1/events/:eventId/orders` now also runs the same IP + `buyer_email`
rate-limiter pair as the other public routes (`CHECKOUT_RATE_LIMIT_*`, see
"Rate limiting" above), closing the other half of the hoarding vector the
quantity caps alone don't — many separate, individually-small orders
adding up.

### Ticket access token, not buyer_email in the URL (implemented)

`GET /v1/events/:eventId/orders/:orderId/tickets` used to accept
`?buyer_email=...` as proof the caller placed the order. That leaked the
buyer's email address into every place this URL travels through as plain
text — server access logs, Render's log aggregation, the `Referer` header
of anything the tickets page itself links out to, and any analytics
tooling — none of which should see a customer's email address as a side
effect of a GET request.

It's replaced with a per-order bearer token (`crypto.randomBytes(32)`,
`src/utils/ticketAccessToken.ts`), passed as `?token=...` instead. Only its
SHA-256 hash is ever persisted (`orders.ticket_access_token_hash`) — the
same pattern already used for password reset tokens — and the ownership
check (`ticketService.listTicketsForOrder`) compares it in constant time
(`crypto.timingSafeEqual`) rather than the plain `===` the email comparison
used, since this now guards a real bearer credential. An authenticated
buyer (`buyer_user_id` on the order matching the caller's session) still
needs no token at all, unchanged from before.

The token is minted in `stripeWebhookService.markOrderPaidAndIssueTickets`,
at the exact moment `payment_intent.succeeded` issues the tickets — not at
order creation. It has no reason to exist before then: nothing can be
viewed with it until tickets actually exist, and minting it earlier would
mean carrying the raw value across the gap between the checkout request and
the later, asynchronous webhook that sends the confirmation email — which
was the first version of this fix's approach (Stripe PaymentIntent
metadata), rejected because Stripe metadata is permanent, visible in the
dashboard to every collaborator with platform access, and not something
this app can purge. Minting inside the webhook avoids that gap entirely:
the token is generated, hashed into `orders.ticket_access_token_hash`, and
handed to `deliverOrderConfirmationEmail` all within the same function call,
so the raw value only ever exists in memory for the life of that request.

Also worth flagging: orders created before this change have no token, and
their confirmation emails linked with `?buyer_email=...`, which this
endpoint no longer honors — those old links are now dead. Given this app
hasn't shipped to real customers yet, that one-time transition cost was
judged acceptable rather than keeping the old mechanism around as a
fallback.

#### Confirmation polling (implemented)

The token not existing until the webhook runs means the checkout page
can't build a working tickets link the instant `stripe.confirmPayment()`
resolves — but just telling the buyer to "check your email" isn't
acceptable as the end of a purchase: someone standing at the door on a bad
connection needs to see their ticket now, or they'll believe the payment
failed and dispute the charge. `GET /v1/events/:eventId/orders/:orderId/confirmation`
(`orderConfirmationService.ts`) exists for that gap — the client polls it
with the `orderId` it already has from the checkout response (no token
needed to ask "is it ready yet") every few seconds:

- `{ status: 'pending' }` while `payment_intent.succeeded` hasn't run yet.
- `{ status: 'ready', access_token }` the first time it's polled after
  tickets exist — this route mints and hashes its *own* token
  (`orders.confirmation_token_hash`), independent of the one emailed by the
  webhook, rather than trying to recover a value that was only ever hashed.
  Either token works for `GET .../tickets`.
- `{ status: 'already_retrieved' }` on every poll after that — the token is
  handed out exactly once. The `UPDATE ... WHERE confirmation_token_hash IS NULL`
  that sets it is the atomicity guarantee: Postgres serializes concurrent
  UPDATEs to the same row, so two requests racing each other can't both
  come away with a (different) valid token.
- `{ status: 'expired' }` if nobody successfully polled within
  `CONFIRMATION_TOKEN_WINDOW_MINUTES` (default 10) of the tickets being
  issued — the confirmation email, which never expires, is the fallback
  from here on.

Both public checkout pages (`public/event.js`, the mobile app's guest
checkout) poll this every 3 seconds for up to 2 minutes after payment
succeeds, and navigate straight to the tickets page the moment they get a
token. If polling times out or comes back `already_retrieved`/`expired`,
they fall back to the "check your email" message. Rate limited like the
other public routes, but with a higher default (`CONFIRMATION_RATE_LIMIT_MAX`,
100 per 5 minutes) — this route is *meant* to be hit repeatedly by one
legitimate buyer in a short window, unlike login/signup/ticket-lookup.

## Check-in + Guest List (implemented)

- `POST /v1/organizations/:organizationId/events/:eventId/check-in` — any
  role (owner/admin/staff/volunteer), body `{ qr_code }`. `404
  ticket_not_found` if the code doesn't match any ticket *for this event* —
  including a ticket that's real but belongs to a different event, even in
  the same organization: `tickets` only stores `order_id`, so every lookup
  joins through `orders.event_id` to scope it, making cross-event check-in
  structurally impossible rather than just policy. `409
  ticket_already_checked_in` on a repeat scan (race-safe: the update is
  conditioned on `checked_in_at IS NULL`, so two simultaneous scans of the
  same ticket can't both succeed).
- `GET /v1/organizations/:organizationId/events/:eventId/guest-list` —
  owner/admin/staff only (not volunteer, per the brief's table); cursor-paginated,
  joins ticket + order + ticket type for attendee/buyer/status info.

## Dashboard (implemented)

- `GET /v1/organizations/:organizationId/dashboard` — owner/admin only
  ("voir les rapports financiers"). Returns org-wide `totals` plus a
  per-event breakdown array (every non-deleted event appears, even with
  zero sales). Both are built from orders currently `status = 'paid'`
  only — once an order moves to `refunded`/`partial_refund` it drops out
  of every sum automatically, satisfying "exclut les remboursements"
  without a separate filter. `net_revenue_cents = total_cents -
  stripe_fee_cents - intahe_fee_cents`, which works out to `subtotal_cents`
  when the buyer paid the fees, or `subtotal_cents` minus both fees when
  the organizer absorbed them — either way, it's what actually lands in
  the organization's Stripe balance.

This completes the brief's Phase 1/MVP roadmap end to end: Auth →
Organizations + Events → Ticket Types + Checkout + Stripe → Check-in +
Orders + Guest List → Dashboard. Beyond that roadmap, this repo also adds
organization member management, refunds, and Stripe Connect onboarding
(below) — all real functional gaps once the MVP is actually being used.

## Public discovery + web pages (implemented)

Unauthenticated, per the differentiation goal of not requiring organizers
to pay for marketing to be found and not requiring buyers to have an
account:

- `GET /v1/discover/events` — published events the organizer opted into
  discovery (`is_public_discoverable`, defaults to `false` — independent
  from `status = 'published'`, an event can be live and sellable via a
  direct link without showing up in search). Sorted by great-circle
  distance in SQL (plain haversine, no PostGIS) when `?latitude=&longitude=`
  are given, otherwise soonest-first. No cursor pagination yet — a capped
  flat list, deliberate scope cut for a first version.
- `GET /v1/discover/events/:eventId` — a single published event by id
  alone, regardless of the discoverable flag (direct-link access).
- `GET /v1/discover/events/:eventId/ticket-types` — public ticket types
  for a published event.

`src/web/` + `public/` serve three server-rendered pages from this same
service (no separate frontend to deploy): `/discover` (browse, browser
geolocation), `/events/:eventId` (detail + real payment via Stripe.js
Payment Element — the web equivalent of the mobile app's PaymentSheet,
against the same guest-checkout endpoint), and
`/events/:eventId/orders/:orderId/tickets` (QR codes for a paid order —
the order confirmation email links here now instead of just citing an
order id with nowhere to go). Every dynamic value on these pages is
fetched client-side and written with `textContent`/DOM APIs, never
interpolated into server-rendered HTML, so there's no user-controlled
data in the templates to escape.

Helmet's default CSP blocks Stripe.js entirely (`script-src`/`connect-src`/
`frame-src` all default to `'self'`) — `src/app.ts` allowlists Stripe's
documented CSP requirements instead of disabling CSP. Caught by testing
with an actual headless browser instead of just `curl`; would have made
web checkout completely non-functional in production otherwise.

## Organizer web app (implemented)

The same server (`src/web/routes.ts`, `public/`) also serves a full
organizer-facing app — login/signup, organizations, events, ticket types,
members, dashboard, check-in, guest list, orders — so organizer
functionality isn't mobile-only. No separate frontend framework: every
route renders the same minimal HTML shell (`renderPage()` in
`src/web/layout.ts`) with a page-specific `<script>` that builds the UI via
`window.intaheT()`/DOM APIs, same pattern as the public pages above.

Auth is a JWT in `localStorage` (`public/session.js`), not a cookie —
matching the mobile app's bearer-token model rather than introducing a
second auth mechanism. `session.js` self-guards any page `layout.ts` marks
`requireAuth: true` (redirects to `/login?next=...` if nothing's stored)
and exposes a shared `apiRequest()` every organizer page script uses
instead of repeating fetch/auth-header/error-parsing boilerplate. One real
bug caught while building this: `apiRequest()` originally treated *any*
401 response as "the token is dead, log out" — but `DELETE /v1/me` also
answers 401 with `invalid_password` for a wrong password on the
account-deletion page, which would have silently logged a user out
instead of just showing the error. Fixed to only auto-logout on
`code === 'unauthorized'`.

Verified end-to-end with headless-browser tests (signup → create org →
create event → publish → create ticket type → invite/accept/role-change/
remove a member → check-in error paths → account deletion, including the
wrong-password case above) across both languages. The one thing that
can't be exercised from this sandbox is an actual Stripe payment — the
sandbox's network egress policy blocks `api.stripe.com` outright, which
also means it would block the already-shipped public checkout flow above,
not something specific to this page; the checkout code here reuses the
exact same Stripe Elements pattern verified in production on the public
event page, just via the authenticated organizer's own token instead of a
guest.

## Transactional email (implemented)

Password reset and order confirmation emails go through
[Resend](https://resend.com) via `src/services/email/emailClient.ts` — the
one function (`sendEmail`) every other part of the app calls, mirroring how
Stripe/Google API calls are each isolated to a single thin wrapper.

The wrapper checks `RESEND_API_KEY` on every call (not cached at import
time): with the placeholder default, it logs what it would have sent and
returns without touching the network at all. This matters more here than
for Stripe/Google because order confirmation fires from the checkout
webhook, which most of the test suite exercises indirectly just to test
unrelated things (dashboards, refunds, check-in) — requiring every one of
those files to remember to mock email sending would be fragile. With a real
key configured, both delivery failures are caught locally and logged
rather than allowed to propagate:

- Password reset: propagating would turn "always 200" into "200 for
  unknown emails, 500 for known ones during a Resend outage" — exactly the
  enumeration signal that response is designed to never give.
- Order confirmation: the DB transaction is already committed by the time
  the email is sent; letting a delivery error fail the webhook response
  would make Stripe retry, and the retry would just hit the
  `status === 'paid'` idempotency guard and return early — never actually
  retrying the email it seemed to be asking for.

## Out of scope for this MVP

Per the brief: promo codes, global capacity, guest list export, and push
notifications.

Deliberately deferred from the destination-to-direct-charge migration,
to be picked up once it's stable:

- Dispute/litigation webhooks (`charge.dispute.created`, `dispute.closed`)
  — nothing in this codebase currently reacts to a dispute being opened or
  resolved.
- Refunds issued outside this application (`charge.refunded` webhook,
  e.g. an organizer refunding directly from their Stripe Express
  dashboard) — only refunds issued through `POST .../orders/:orderId/refund`
  are reflected in `transactions`/`orders.status` today.
- A proper $0-order checkout path (see "Direct charges, not destination
  charges" above) — a fully free order still attempts a Stripe
  `PaymentIntent` for `amountCents: 0`, which real Stripe will reject.
- Mobile UI for everything below — the web app has it, the mobile app
  doesn't yet.
- ~~A configurable minimum ticket price~~ — done. See "Minimum ticket
  price" under Web UI (implemented) below.
- Admin console screens for "approve an organization" and "unpublish an
  event" specifically — both endpoints exist and are tested
  (`POST /v1/admin/organizations/:organizationId/approve`,
  `POST /v1/admin/events/:eventId/unpublish`), but `adminPayoutsPage.js`
  only covers the payouts section of the admin console (due/executed/
  failed, hold/unhold, manual trigger), which is what was specified in
  detail. The other two admin actions are reachable via the API only.

## Web UI (implemented)

Built on top of the read-only endpoints and admin backend above, following
the existing organizer-app conventions (vanilla JS per page, `window.intaheT`
for FR/EN copy, `window.intaheSession.apiRequest`):

- **`organizationDetailPage.js`** — a Stripe billing status section: not
  connected (with the exact required explanatory copy and a "Connect
  Stripe" button), connected-but-`charges_enabled: false` (a "verification
  in progress" state with a manual refresh button — not a frozen screen),
  or active. A "Payouts" nav button links to the new payouts page.
- **`orgPayoutsPage.js`** (`/organizations/:orgId/payouts`) — collected
  ("pending") and available Stripe balance, upcoming payouts with their
  computed date and the "48h after the event ends" wording, and the full
  attempt history with per-status styling.
- **`eventFeesPage.js`** (`/organizations/:orgId/events/:eventId/fees`) —
  price, Intahe's commission, and units sold per ticket type, plus the
  event's cumulative gross/Stripe-fee/Intahe-fee/net totals. Linked from
  `manageEventPage.js`'s management row.
- **`manageEventPage.js`** — the "Cancel event" button now confirms first
  with the required warning that Stripe's fees are never refunded and stay
  on the organization's account; ticket-type creation surfaces
  `stripe_not_connected` with a specific message and a link back to the
  Stripe section, instead of a generic error. The price field shows a live
  commission/Stripe-fee/net estimate while the organizer types, computed
  client-side with the same formulas as `commissionGrid.ts`/`fees.ts` (no
  round-trip needed), using a red style once the estimated net goes
  negative. Below `MIN_TICKET_PRICE_CENTS` the estimate line is replaced by
  the below-minimum explanation instead — visible from the very first digit
  typed, not only on submit — see "Minimum ticket price" below.

### Minimum ticket price

`MIN_TICKET_PRICE_CENTS` (`src/config/env.ts`, default **200**, i.e.
**$2.00**) is a floor on *paid* ticket types only — a $0 (free) ticket is
always allowed, since that's a free event, not a ticket under the floor.
Enforced in `ticketTypeService.createTicketType`/`updateTicketType` (the
same place, and same "checked fresh on every write" pattern, as the
Stripe-connected gate above), returning `400 ticket_price_below_minimum`
with an explanatory message, not a bare rejection.

Why $2.00: the exact organizer-net breakeven (where `price - Stripe's fee -
Intahe's commission = 0`, when the organizer absorbs fees) is $0.81 — see
`tests/orderFeeBoundaries.test.ts`. $2.00 was chosen well above that on
purpose: it nets the organizer $1.15 (58% retained, 2.47x the breakeven),
vs. a $1.00 floor's thin $0.18 (18%) margin, which wouldn't survive a
routine Stripe fee adjustment. It doesn't constrain this platform's actual
segment (concerts, galas, tables typically $15-40+).

`manageEventPage.js` mirrors this exact figure client-side (hardcoded, not
fetched — there's no round-trip on keystroke) both in the live per-keystroke
estimate and in the submit-time error, and the FR/EN copy
(`manage_event.price_below_minimum`/`price_below_minimum_error` in
`i18n.js`) also hardcodes "$2.00"/"2,00 $". If `MIN_TICKET_PRICE_CENTS` is
ever changed, both of those need to be updated by hand — a documented
coupling, not an automated one, same convention as the `quantity_sold`
trigger bound vs. `MAX_QUANTITY_PER_ORDER` elsewhere in this codebase.
- **`orgOrdersPage.js`** — a full refund flow per order: choose full or
  partial amount, a required reason presented in plain language ("I'm
  cancelling the event" / "I'm postponing the event" / "The buyer
  requested it") with its commission consequence shown inline as soon as
  it's picked, then a confirmation step restating the exact buyer amount,
  the commission consequence, and the Stripe-fees-are-never-refunded
  reminder before anything is submitted. After execution, the order shows
  its refund reason and date. Backend: `refundOrder` now emails the buyer
  a refund confirmation (amount + usual bank delay) after commit, and
  `PublicOrder` exposes `refund_reason`/`refunded_at` (the latter derived
  from the latest `type = 'refund'` transaction, since orders have no
  `updated_at` column). Also fixed a pre-existing bug found while touching
  this file: the status-label lookup used the key `partially_refunded`,
  which never matched the real order status value (`partial_refund`), so
  a partially-refunded order displayed its raw status string instead of a
  translated label.
- **`stripeConnectReturnPage.js`** (`/stripe/connect/return`,
  `/stripe/connect/refresh`) — Stripe's return/refresh URLs are static and
  organization-agnostic, so the organization id is stashed in
  `sessionStorage` right before redirecting to Stripe and read back here to
  send the owner to the right place.
- **`adminPayoutsPage.js`** (`/admin/payouts`) — not linked from the main
  nav (server-side authorization is what actually matters); due payouts
  with an overdue-hours badge and hold/unhold/trigger actions, plus
  executed and failed history across every organization.
