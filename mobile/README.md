# Intahe — mobile app

React Native app (Expo + Expo Router) for Intahe, targeting iOS and Google Play from a single codebase, per the project brief.

## Get started

```bash
npm install
npx expo start        # or: npm run web / npm run ios / npm run android
```

`EXPO_PUBLIC_API_BASE_URL` (see `.env`) points at the deployed staging API by default. To test against a local backend instead, temporarily change it to `http://localhost:3000` and restart the dev server (`EXPO_PUBLIC_*` vars are baked in at bundle time, not hot-reloadable).

`EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY` (see `.env`) must be set to the *test* publishable key (`pk_test_...`) from the same Stripe account as `intahe-api-staging`'s secret key, or checkout will fail at the `initPaymentSheet` step. It's safe to commit/share — publishable keys can only create PaymentMethods, never charge anything.

**`npm run web` no longer works** — see "Stripe payment" below.

## Structure

- `src/app/` — Expo Router file-based routes.
  - `(auth)/` — login, signup. Shown when signed out.
  - `(app)/` — the main tab navigator. Shown when signed in.
  - `(public)/` — discovery + guest checkout + guest ticket view. Shown regardless of session state (reachable from a link on the login screen, or a button on the Organisations screen when signed in).
  - `_layout.tsx` — wraps everything in `AuthProvider` and uses `Stack.Protected` to gate `(app)`/`(auth)` on session state; `(public)` sits outside both, always reachable.
- `src/lib/api.ts` — fetch wrapper matching the backend's error envelope (`{ error: { code, message, field } }`); callers branch on `code`, never `message`.
- `src/lib/auth-context.tsx` — session state (token + user), persisted via `expo-secure-store` (native only — web falls back to in-memory, since web isn't a real target).
- `src/components/` — shared primitives (`Button`, `TextField`, `ThemedText`, `ThemedView`) styled from `src/constants/theme.ts`, the same kraft/paper/teal design system as the backend's web test console.

## Implemented

- **Auth**: signup, login, logout, route protection (`/v1/auth/signup`, `/v1/auth/login`), tested end-to-end against a local instance of the backend.
- **Organizations + Events**: create/list organizations, create/list events (real native date/calendar and time pickers via `@react-native-community/datetimepicker`, forced to `locale="fr-CA"` on iOS so it doesn't follow the device's system language), publish/cancel transitions, an address field, a "use my current location" button (`expo-location`), and an "Événement découvrable" switch (see Discover below).
- **Ticket types + checkout + payment**: create/list ticket types on an event, a checkout form that creates a real order (`POST /v1/events/:eventId/orders`), and a real Stripe `PaymentSheet` step (`useStripe()`'s `initPaymentSheet`/`presentPaymentSheet`) to actually pay for it with a test card. Prices are in CAD.
- **Tickets (QR codes)**: a "Voir mes billets" screen that fetches the buyer's tickets for an order (`GET /v1/events/:eventId/orders/:orderId/tickets`, a new buyer-facing endpoint — ownership is checked via the session or the `buyer_email` used at checkout, never orderId alone) and renders each ticket's QR code (generated server-side as a PNG data URI via the `qrcode` package).
- **Check-in + Orders + Guest List** (from the event detail screen's "Gestion" section): a manual QR-code entry screen for check-in (`POST .../check-in`, shows French messages for "not found" / "already checked in"), a guest list (`GET .../guest-list`, scanned/pending status per ticket), and an admin orders list (`GET .../orders`, buyer email + total + status).
- **Organization members** (from the org detail screen's "Membres" button): invite by email + role (admin/staff/volunteer — the invitee must already have an Intahe account), list members with role and pending/accepted status, cycle a member's role, remove a member. The Organizations list screen also shows the current user's own pending invites (via the new `GET /v1/me/invites` endpoint, since `listOrganizationsForUser` only returns *accepted* memberships and gives an invitee no other way to discover a pending invite) with an "Accepter" button per invite.
- **Dashboard** (org detail screen's "Dashboard" button): totals (tickets sold, paid orders, net revenue) plus a per-event breakdown, from `GET /v1/organizations/:organizationId/dashboard`.

Everything up to and including order creation was tested end-to-end against a local instance of the backend, driven with a headless browser (Playwright) against the web build (pointing `EXPO_PUBLIC_API_BASE_URL` at `http://localhost:3000` per the "Get started" note above). Tickets are only issued once an order's Stripe payment actually succeeds (the webhook in `stripeWebhookService.ts`), so those earlier tests seeded a paid order directly in Postgres to stand in for that webhook and verify the tickets/check-in/guest-list/dashboard screens.

Check-in uses manual code entry rather than a camera scanner: real QR scanning would need `expo-camera` and real hardware to verify. The code is functionally identical either way (both end up calling the same `qr_code` string to the check-in endpoint) — swapping in a camera-based scanner later doesn't change the underlying flow.

### Stripe payment

`@stripe/stripe-react-native` is wired in (`StripeProvider` in `src/app/_layout.tsx`, `useStripe()` in both the org-scoped and public event checkout screens). **This retired the Playwright/web-based testing method used for every earlier milestone**: the package breaks Metro's entire web bundle the moment it's imported anywhere in the app (confirmed via `npx expo export --platform web`) — so `npm run web` no longer works at all, on purpose, permanently.

**Verified working end-to-end on a real iPhone**, including a full order → `initPaymentSheet` → `presentPaymentSheet` → webhook → ticket-issuance → check-in loop with a real test card. Getting there needed Expo SDK 54 (see "Testing on a physical device" below) and a couple of fixes only a real device run could have caught: the date picker defaulting to the device's English system locale instead of French, and the ticket screen showing only a QR image with no text fallback for manual check-in testing.

### Discover (public, no account)

`(public)/discover` browses events other organizers opted into public discovery (`is_public_discoverable` on the event, opt-in, defaults off) — sorted by distance via `expo-location`'s current position when granted, otherwise soonest-first. Tapping an event opens `(public)/events/[eventId]`, a guest checkout screen against the new unauthenticated `/v1/discover/*` endpoints (as opposed to the org-scoped, authenticated ones the management screens use) — same real Stripe `PaymentSheet` flow as the rest of the app, no login required. `(public)/events/[eventId]/tickets/[orderId]` shows the resulting QR codes.

No account needed anywhere in this flow: `createOrder`/`listTicketsForOrder` were already guest-capable (`optionalAuth` on the backend) from the original checkout milestone — only the "browse an event that isn't mine" read side was missing, which is what `/v1/discover/*` adds. The same web pages exist server-rendered from the backend directly (`/discover`, `/events/:eventId`, ...) for buyers who don't want to install the app at all — see the backend README's "Public discovery + web pages" section.

### Testing on a physical device

The project is pinned to **Expo SDK 54** (see `AGENTS.md`) instead of a newer SDK specifically so it can be tested with the plain Expo Go app from the Apple App Store: as of August 2026, Apple's App Store review for Expo Go builds targeting SDK 55/56/57 has been stuck for months (Expo has confirmed this publicly), so the App Store version of Expo Go only opens SDK 54 projects. If that review backlog clears and a newer Expo Go build ships to the App Store, this project can be bumped to match — check `docs.expo.dev` before doing so.

1. Set `EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY` in `.env` to the test publishable key from the same Stripe account as `intahe-api-staging`.
2. `npm install && npx expo start` on a machine with real network access (this can't run from the sandbox this app was built in — it has no route to Expo's or Stripe's servers).
3. Install **Expo Go** from the App Store / Play Store, and scan the QR code on a phone on the same Wi-Fi.
   - If the phone shows "Project is incompatible with this version of Expo Go" even after updating Expo Go, the App Store build is still behind — use [sign.expo.dev](https://sign.expo.dev) instead (free Apple ID provisioning, no paid developer account needed, re-sign every ~7 days) to get a build matching this project's SDK.
4. Sign up, create an org + published event + ticket type, then go through checkout with a [Stripe test card](https://docs.stripe.com/testing) (e.g. `4242 4242 4242 4242`, any future expiry, any CVC) on the "Payer maintenant" button.
5. Confirm: payment sheet shows "Paiement réussi", then "Voir mes billets" shows a QR code once the webhook has issued the ticket (may take a couple of seconds).

## Not yet built

Nothing from the project brief's MVP build order — everything, including the Stripe payment step, has now been verified end-to-end on a real device.

Discover is reachable via a link/button on existing screens rather than an always-visible tab: making it a proper tab that works whether or not there's a session would mean restructuring the `(app)` group's `Tabs` layout itself (currently only rendered when signed in), which was a bigger change than a first version needed.
