# Intahe — Backend

Node.js + TypeScript (strict) REST API for Intahe, an event ticketing platform.
See the project brief for full context; this README only covers running the code.

## Stack

- Node.js + TypeScript (strict mode)
- PostgreSQL, migrated with [`node-pg-migrate`](https://github.com/salsita/node-pg-migrate) (plain SQL migrations)
- Express, versioned REST API under `/v1`
- Stripe Connect (destination charges), one connected account per organization
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
   `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`,
   `STRIPE_CONNECT_REFRESH_URL`, `STRIPE_CONNECT_RETURN_URL`,
   `GOOGLE_OAUTH_CLIENT_IDS`. `JWT_SECRET` is auto-generated per
   environment by Render itself — staging and production never share one.
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
  whether the email is registered
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
  `PaymentIntent` is created in the same request (destination charge to the
  organization's connected account with `application_fee_amount` set to
  `intahe_fee_cents`, or a plain platform charge if the organization hasn't
  connected Stripe yet).
- `POST /v1/stripe/webhook` — Stripe calls this on `payment_intent.succeeded`;
  marks the order `paid`, generates one `tickets` row (with QR code) per
  unit purchased, and records a `transactions` row. QR codes are generated
  here, at payment confirmation, never at checkout initiation. Idempotent
  against Stripe's at-least-once delivery.
- `GET /v1/organizations/:organizationId/events/:eventId/orders`,
  `GET .../orders/:orderId` — owner/admin only ("voir les rapports
  financiers"); order detail includes its tickets.
- `POST .../orders/:orderId/refund` — owner/admin only ("émettre des
  remboursements"). Body `{ amount_cents? }`; omit for a full refund of
  whatever balance remains. Partial refunds can stack (e.g. refund half,
  then refund the rest later) — the refundable balance is derived from
  `SUM(transactions.amount_cents) WHERE type = 'refund'` rather than stored
  redundantly on the order, so it can't drift out of sync. The order moves
  to `partial_refund` while a balance remains, or `refunded` once it hits
  zero; either way it leaves `status = 'paid'`, which is what makes it drop
  out of the dashboard's revenue sums automatically. `409
  order_not_refundable` for a `pending` or already-fully-refunded order;
  `400 invalid_refund_amount` for a request over the remaining balance. On
  a Connect destination charge (organization has `stripe_account_id`), the
  refund also sets `reverse_transfer` + `refund_application_fee` so the
  money actually comes back from the connected account and Intahe's own
  cut, instead of the platform silently eating the loss.

Reserving inventory (`ticket_types.quantity_sold`), inserting the order, and
creating the Stripe PaymentIntent all happen inside one DB transaction — if
the Stripe call fails, the reservation is rolled back, so no capacity is
ever held for an order that never got a PaymentIntent. `ticket_sold_out` is
returned when demand exceeds supply, matching the brief's exact error format
example.

Two tables exist beyond the brief's core schema, both required to make the
above work: `password_reset_tokens` (auth) and `order_line_items`, which
records what was purchased before any `tickets` row exists (needed because
ticket/QR generation is deferred to payment confirmation).

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
  accept charges on it — onboarding can be started and abandoned — so
  checkout and refunds both gate on `stripe_account_id AND
  stripe_charges_enabled` before attempting a destination charge /
  `reverse_transfer`, falling back to a plain platform charge otherwise.

## Out of scope for this MVP

Per the brief: promo codes, global capacity, guest list export, and push
notifications.
