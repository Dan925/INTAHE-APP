import 'dotenv/config';
import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'staging', 'production']).default('development'),
  PORT: z.coerce.number().default(3000),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  JWT_SECRET: z.string().min(1, 'JWT_SECRET is required'),
  JWT_EXPIRES_IN: z.string().default('7d'),
  PASSWORD_RESET_TOKEN_TTL_MINUTES: z.coerce.number().default(30),
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

export const env = envSchema.parse(process.env);
