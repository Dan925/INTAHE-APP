import 'dotenv/config';
import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'staging', 'production']).default('development'),
  PORT: z.coerce.number().default(3000),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  JWT_SECRET: z.string().min(1, 'JWT_SECRET is required'),
  JWT_EXPIRES_IN: z.string().default('7d'),
  PASSWORD_RESET_TOKEN_TTL_MINUTES: z.coerce.number().default(30),
  // How long a pending order holds its ticket-type inventory before the
  // reservation is released back for someone else to buy. Long enough for
  // a buyer to enter card details, short enough that abandoned checkouts
  // don't hold real capacity hostage.
  ORDER_RESERVATION_TTL_MINUTES: z.coerce.number().default(20),
  // Rate limiting (brute force / enumeration protection) on auth endpoints
  // (login, signup, password-reset request) and on public ticket lookup by
  // buyer_email. Each guarded route runs two independent limiters sharing
  // this same window/max: one keyed by client IP, one keyed by the target
  // identifier (email / buyer_email) — so an attack spread across many IPs
  // against one account is still caught, and one IP hitting many accounts
  // is still caught too. Defaults are generous enough for legitimate bursts
  // (a shared office IP, a user mistyping a password a few times).
  AUTH_RATE_LIMIT_WINDOW_MS: z.coerce.number().default(15 * 60 * 1000),
  AUTH_RATE_LIMIT_MAX: z.coerce.number().default(20),
  TICKET_LOOKUP_RATE_LIMIT_WINDOW_MS: z.coerce.number().default(15 * 60 * 1000),
  TICKET_LOOKUP_RATE_LIMIT_MAX: z.coerce.number().default(20),
  // GET .../orders/:orderId/confirmation is meant to be polled repeatedly
  // by a buyer's own browser/app right after paying (every few seconds,
  // for up to a couple of minutes) while waiting for the webhook to issue
  // tickets — a much higher legitimate request rate than the other
  // rate-limited routes, so it gets its own, more generous limit.
  CONFIRMATION_RATE_LIMIT_WINDOW_MS: z.coerce.number().default(5 * 60 * 1000),
  CONFIRMATION_RATE_LIMIT_MAX: z.coerce.number().default(100),
  // How long GET .../confirmation keeps handing out a fresh access token
  // after tickets are issued, before falling back to "check your email"
  // (which never expires). Bounds how long a one-time credential can sit
  // unclaimed rather than tying its life to some fixed multiple of poll
  // intervals on the client.
  CONFIRMATION_TOKEN_WINDOW_MINUTES: z.coerce.number().default(10),
  // Placeholders let the app boot without real Stripe credentials; the
  // Stripe SDK requires a non-empty string but nothing calls the real API
  // until a genuine sk_test_/whsec_ value is configured.
  STRIPE_SECRET_KEY: z.string().min(1).default('sk_test_placeholder'),
  STRIPE_WEBHOOK_SECRET: z.string().min(1).default('whsec_placeholder'),
  // Safe to expose client-side (used by the public web checkout pages'
  // Stripe.js Payment Element) — publishable keys can only create
  // PaymentMethods, never charge anything. Must be the publishable key from
  // the same Stripe account as STRIPE_SECRET_KEY above.
  STRIPE_PUBLISHABLE_KEY: z.string().min(1).default('pk_test_placeholder'),
  // Where Stripe redirects the organizer after Connect onboarding. These
  // are frontend routes — placeholders until a frontend exists to own them.
  STRIPE_CONNECT_REFRESH_URL: z.string().url().default('http://localhost:3000/stripe/connect/refresh'),
  STRIPE_CONNECT_RETURN_URL: z.string().url().default('http://localhost:3000/stripe/connect/return'),
  // Comma-separated: the mobile app's iOS/Android OAuth client ID(s) plus
  // any web client ID, all valid `aud` claims for tokens we should accept.
  GOOGLE_OAUTH_CLIENT_IDS: z.string().min(1).default('placeholder.apps.googleusercontent.com'),
  // Comma-separated: every `aud` claim Apple identity tokens are allowed to
  // carry — normally just the app's bundle identifier (native Sign in with
  // Apple), plus a Services ID if a web sign-in flow is added later.
  APPLE_CLIENT_IDS: z.string().min(1).default('com.intahe.app'),
  // 're_placeholder' is a recognized sentinel (see services/email/emailClient.ts):
  // the app boots fine without a real Resend account, and emails are logged
  // instead of sent for real until this is configured.
  RESEND_API_KEY: z.string().min(1).default('re_placeholder'),
  EMAIL_FROM_ADDRESS: z.string().email().default('no-reply@intahe.app'),
  EMAIL_FROM_NAME: z.string().min(1).default('Intahe'),
  // Frontend route the password reset email's link points to — a
  // placeholder until a frontend exists to own it.
  PASSWORD_RESET_URL: z.string().url().default('http://localhost:3000/reset-password'),
  // Used to build absolute links (e.g. the order confirmation email's
  // "view your tickets" link) to this service's own public web pages.
  // Render sets RENDER_EXTERNAL_URL automatically on every web service, so
  // this only needs to be set explicitly for local dev or non-Render hosts.
  APP_BASE_URL: z.string().url().default(process.env['RENDER_EXTERNAL_URL'] ?? 'http://localhost:3000'),
});

const parsedEnv = envSchema.parse(process.env);

export const env = {
  ...parsedEnv,
  // Rate limiting is on by default everywhere except automated tests: the
  // existing test suite (and its shared fixture helpers) makes many rapid
  // requests from one fixed, un-forwarded IP with no attempt to vary it,
  // which isn't a real attack pattern — it would trip the IP-keyed limiter
  // constantly and for reasons unrelated to whatever a given test is
  // actually checking. The rate-limiting middleware itself is still fully
  // exercised in tests/rateLimit.test.ts, which opts back in explicitly via
  // RATE_LIMIT_ENABLED=true. z.coerce.boolean() isn't used here because it
  // treats the *string* "false" as truthy (Boolean("false") === true).
  RATE_LIMIT_ENABLED: process.env['RATE_LIMIT_ENABLED']
    ? process.env['RATE_LIMIT_ENABLED'] === 'true'
    : parsedEnv.NODE_ENV !== 'test',
};
