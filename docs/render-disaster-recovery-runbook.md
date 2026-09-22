# If Render disappears again — disaster recovery runbook

This exists because it already happened once: mid-project, every Render
service and database vanished with no clear root cause (account access was
confirmed fine — right GitHub connection, no billing issue, no reported
platform outage). The rebuild that time was worked out live, from scratch,
in a chat session — this runbook is that knowledge written down, so next
time it's a checklist, not a rediscovery.

**Scope**: this covers losing the Render side only — the two web services
(`intahe-api-staging`, `intahe-api-production`) and their two Postgres
databases. It does not cover losing the GitHub repo (not Render's
problem), the `intahe.app` domain/DNS (hosted at Cloudflare, independent
of Render — those records survive a Render-only incident untouched), or
the Stripe/Resend/Google accounts themselves.

---

## 0. First, confirm what's actually gone

Before rebuilding anything: log into the Render dashboard and check
whether this is (a) services genuinely deleted, (b) an account access
problem (wrong account, lost 2FA), or (c) a Render platform outage. Check
the account's billing/invoice history — an unpaid invoice can result in
services being removed, which is what happened last time as best as could
be determined. Rebuilding from scratch (below) only makes sense for (a);
(b) and (c) have their own fixes that don't involve touching the app at
all.

## 1. Re-provision from the Blueprint

`render.yaml` at the repo root is the single source of truth for both
services' configuration — non-secret env vars, build/start commands,
health checks, plans, regions — and both database definitions. Re-applying
it recreates almost everything automatically:

1. Render dashboard → **New** → **Blueprint** → point it at this GitHub
   repo (branch `main`).
2. Render provisions `intahe-api-staging`, `intahe-api-production`,
   `intahe-db-staging`, and `intahe-db-production` from the file, with
   every `value:`-specified env var already set.
3. **This alone is not enough to go live** — every env var marked
   `sync: false` in `render.yaml` is a secret Render deliberately does
   NOT store in the file (it doesn't belong in git). Render creates an
   empty slot for each; you must fill them in by hand, per environment,
   in the dashboard. As of this writing, that list is:
   - `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PUBLISHABLE_KEY`,
     `STRIPE_CONNECT_REFRESH_URL`, `STRIPE_CONNECT_RETURN_URL`
   - `GOOGLE_OAUTH_CLIENT_IDS`, `APPLE_CLIENT_IDS`
   - `RESEND_API_KEY`
   - `SENTRY_DSN` (optional — app runs fine without it, just with no
     error alerting; see `src/config/sentry.ts`)
   - Check `render.yaml` itself for the current, authoritative list —
     don't trust this doc's copy of it if the two ever disagree.
4. If `render.yaml` and `src/config/env.ts` have drifted (a new env var
   added to the code but never added to the Blueprint), the app still
   boots — every var in `env.ts` has a code-level default — but silently
   runs with that default instead of the real production value. This is
   exactly what happened before this runbook existed: `RESEND_API_KEY`,
   `EMAIL_FROM_ADDRESS`/`EMAIL_FROM_NAME`, and `APP_BASE_URL` were all
   missing from `render.yaml`, so a fresh Blueprint apply would have
   quietly shipped with emails logged-not-sent and confirmation links
   pointing at the raw `*.onrender.com` URL instead of `intahe.app` — the
   exact bug already fixed once this way. Whenever a new env var is added
   to `env.ts`, add it to `render.yaml` in the same change — don't let
   this drift again.

## 2. Reattach the custom domain

The `intahe.app` DNS records live at Cloudflare and are untouched by a
Render-only incident — but Render's own "this domain points at this
service" link is service-specific and does not survive a service being
recreated.

1. `intahe-api-production` → Settings → Custom Domains → add `intahe.app`
   (and `www.intahe.app` if that's in use).
2. Render shows the DNS target it expects (a CNAME or A record). Compare
   against what's already set in Cloudflare — it's likely unchanged from
   before, in which case this step is just confirmation, not a new DNS
   change.
3. Confirm `APP_BASE_URL` on `intahe-api-production` is `https://intahe.app`
   (already set by the Blueprint if `render.yaml` is current — see the
   comment on that env var in the file). Do not skip this: without it,
   `env.ts` falls back to `RENDER_EXTERNAL_URL`, which is the raw Render
   URL, not the custom domain — this breaks every link sent in a
   confirmation/reset email.

## 3. Point Stripe's webhook at the new (or confirmed) endpoint

If the service URL changed at all during the rebuild, Stripe's webhook
endpoint configuration (Dashboard → Developers → Webhooks) needs to point
at `https://intahe.app/v1/stripe/webhook` (production) and the
staging equivalent. See `docs/stripe-connect-runbook.md` Part 1 for the
full "per-connected-account events" nuance — this matters again here
because a webhook misconfiguration is invisible until the next payment,
not at deploy time.

## 4. Verify, end to end, before calling it done

Do not consider the rebuild finished until all of these pass:

1. `curl https://intahe.app/health` returns 200.
2. Sign up a real test account, create an organization, connect Stripe
   (test mode is fine on staging; use production's real Connect flow on
   production).
3. Make one real purchase through the actual checkout flow (see
   `docs/stripe-connect-runbook.md`'s Step 9/10 for the exact production
   verification bar — a real card, a real small amount, checked against
   Stripe Dashboard's webhook delivery log).
4. Confirm the order confirmation **email actually arrives**, and that
   its links point at `https://intahe.app/...`, not a raw Render URL or
   `localhost`.
5. If `SENTRY_DSN` is configured, trigger a deliberate test error (e.g.
   hit a route with an intentionally malformed request that reaches the
   generic 500 handler) and confirm it shows up in Sentry — proof the
   monitoring itself survived the rebuild, not just the app.

## 5. What this runbook doesn't cover (yet)

- **Database restore from backup.** This runbook assumes the databases
  were lost along with the services and rebuilt empty — it does not cover
  restoring `intahe-db-production` from a Render Postgres backup if only
  the *data* needs recovering (services intact, database corrupted/wrong
  data). Render's Postgres plans include automated daily backups with a
  retention window that depends on the plan — confirm the current
  retention window and practice an actual restore at least once before
  needing it for real, rather than assuming it works.
- **A second operator.** As of this writing, one account holds the Render,
  Stripe, Cloudflare, and domain-registrar access this entire runbook
  depends on. If that account becomes inaccessible (not just Render, but
  the person/credentials), none of the above helps. Worth a second trusted
  administrator or a documented credential-succession plan, independent of
  anything Render-specific.
