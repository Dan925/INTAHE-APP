# Intahe — Backend

Node.js + TypeScript (strict) REST API for Intahe, an event ticketing platform.
See the project brief for full context; this README only covers running the code.

## Stack

- Node.js + TypeScript (strict mode)
- PostgreSQL, migrated with [`node-pg-migrate`](https://github.com/salsita/node-pg-migrate) (plain SQL migrations)
- Express, versioned REST API under `/v1`
- Money is always integer cents, never floats

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

Google OAuth is part of the schema (`users.auth_provider`) but not yet wired
up as a route — out of scope for this first pass.

## Organizations + Events (implemented)

All routes below require `Authorization: Bearer <access_token>`.

- `POST /v1/organizations` — create an organization; the creator becomes its
  `owner` (every organization always has exactly one, enforced by a partial
  unique index on `organization_members`, not just application code)
- `GET /v1/organizations` — organizations the caller belongs to (cursor-paginated)
- `GET /v1/organizations/:organizationId` — any member
- `PATCH /v1/organizations/:organizationId` — owner/admin only

- `POST /v1/organizations/:organizationId/events` — create a draft event (owner/admin)
- `GET /v1/organizations/:organizationId/events` — list events (any member, cursor-paginated)
- `GET /v1/organizations/:organizationId/events/:eventId` — any member
- `PATCH /v1/organizations/:organizationId/events/:eventId` — owner/admin only
- `POST /v1/organizations/:organizationId/events/:eventId/publish` — owner/admin
  only; only valid from `draft` status (`409 event_not_publishable` otherwise)

Role hierarchy (`owner > admin > staff > volunteer`) matches the brief's
permission table exactly, so a single `requireOrgRole(minRole)` middleware
covers every route.

## Next up

Ticket Types + Checkout + Stripe Connect, with a blocking `Idempotency-Key`
on the order endpoint.
