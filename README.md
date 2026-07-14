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
  middleware/   error handling, 404
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
- Pagination (once list endpoints exist) is cursor-based (`?cursor=&limit=`),
  never offset-based.
- A 403 never reveals that a resource exists in another organization.

## Auth (implemented)

- `POST /v1/auth/signup` — email + password signup (`auth_provider = 'email'`)
- `POST /v1/auth/login`
- `POST /v1/auth/password-reset/request` — always returns 200, doesn't reveal
  whether the email is registered
- `POST /v1/auth/password-reset/confirm` — single-use, time-limited token

Google OAuth is part of the schema (`users.auth_provider`) but not yet wired
up as a route — out of scope for this first pass.

## Next up

Organizations + Events (create/edit/publish, one-owner-per-organization rule
already enforced at the DB level in `organization_members`).
