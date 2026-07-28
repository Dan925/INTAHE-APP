# Intahe — mobile app

React Native app (Expo + Expo Router) for Intahe, targeting iOS and Google Play from a single codebase, per the project brief.

## Get started

```bash
npm install
npx expo start        # or: npm run web / npm run ios / npm run android
```

`EXPO_PUBLIC_API_BASE_URL` (see `.env`) points at the deployed staging API by default. To test against a local backend instead, temporarily change it to `http://localhost:3000` and restart the dev server (`EXPO_PUBLIC_*` vars are baked in at bundle time, not hot-reloadable).

## Structure

- `src/app/` — Expo Router file-based routes.
  - `(auth)/` — login, signup. Shown when signed out.
  - `(app)/` — the main tab navigator. Shown when signed in.
  - `_layout.tsx` — wraps everything in `AuthProvider` and uses `Stack.Protected` to gate the two groups above on session state.
- `src/lib/api.ts` — fetch wrapper matching the backend's error envelope (`{ error: { code, message, field } }`); callers branch on `code`, never `message`.
- `src/lib/auth-context.tsx` — session state (token + user), persisted via `expo-secure-store` (native only — web falls back to in-memory, since web isn't a real target).
- `src/components/` — shared primitives (`Button`, `TextField`, `ThemedText`, `ThemedView`) styled from `src/constants/theme.ts`, the same kraft/paper/teal design system as the backend's web test console.

## Implemented

- **Auth**: signup, login, logout, route protection (`/v1/auth/signup`, `/v1/auth/login`), tested end-to-end against a local instance of the backend.
- **Organizations + Events**: create/list organizations, create/list events (custom date/time fields, since `@react-native-community/datetimepicker` has no web implementation), publish/cancel transitions.
- **Ticket types + checkout**: create/list ticket types on an event, and a checkout form that creates a real order (`POST /v1/events/:eventId/orders`) and displays the resulting total/status.

All of the above are tested end-to-end against a local instance of the backend, driven with a headless browser (Playwright) against the web build — see the "Get started" note above on pointing `EXPO_PUBLIC_API_BASE_URL` at `http://localhost:3000` for this.

### Stripe payment — deferred

The checkout screen creates the order and shows the receipt, but it stops there: it does not present a card form or confirm payment. `@stripe/stripe-react-native` (needed for that step) breaks Metro's entire web bundle the moment it's imported anywhere in the app — not just the payment screen — because its barrel file re-exports native-only components that import React Native internals Metro refuses to bundle for web. Since this app is tested via a headless browser against a local backend, adding it now would make everything else untestable too. This was a deliberate choice, not an oversight: build everything up through order creation, and add the actual `PaymentSheet` integration once a real device or simulator is available to test it on.

## Not yet built

Tickets/QR codes, check-in, organization member management, dashboard. See the project brief's MVP build order.
