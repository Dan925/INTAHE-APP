import 'dotenv/config';
import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
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
});

export const env = envSchema.parse(process.env);
