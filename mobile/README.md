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

## Auth flow (implemented)

Signup, login, logout, and route protection are wired to the real backend (`/v1/auth/signup`, `/v1/auth/login`) and tested end-to-end against a local instance of the backend (signup → session stored → redirect to app tabs; wrong password → French error message; logout → redirect back to login).

## Not yet built

Everything past auth: browsing/creating events, ticket types, checkout (Stripe), tickets/QR codes, check-in, organization management, dashboard. See the project brief's MVP build order.
