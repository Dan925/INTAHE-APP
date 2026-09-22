import * as Sentry from '@sentry/node';
import { env } from './env';

const isConfigured = env.SENTRY_DSN.length > 0;

// Called once, as early as possible (see index.ts) — must run before the
// rest of the app is imported for Sentry's automatic instrumentation
// (HTTP, Postgres via pg) to attach correctly. A no-op when SENTRY_DSN
// isn't set, same "boots fine without it" contract as Resend/Stripe.
export function initSentry(): void {
  if (!isConfigured) return;
  Sentry.init({
    dsn: env.SENTRY_DSN,
    environment: env.NODE_ENV,
    sendDefaultPii: false,
  });
}

/**
 * The one place every "something went wrong that a human should know
 * about" call site in this codebase reports through — errorHandler.ts's
 * unhandled-500 branch, the payout/reconciliation worker tick failures in
 * index.ts, and any future one. Falls back to plain console.error (the
 * pre-existing behavior everywhere) when Sentry isn't configured, so this
 * is always safe to call instead of a bare console.error.
 */
export function captureError(err: unknown, context?: Record<string, unknown>): void {
  if (context) {
    console.error(context, err);
  } else {
    console.error(err);
  }
  if (!isConfigured) return;
  Sentry.captureException(err, context ? { extra: context } : undefined);
}

/**
 * For business-level alerts that aren't exceptions — a capacity overshoot,
 * a payment stuck in reconciliation — see capacityOvershootService.ts and
 * paymentReconciliationService.ts, whose own comments point here. Same
 * "always safe to call" contract as captureError.
 */
export function captureAlert(message: string, context?: Record<string, unknown>): void {
  if (!isConfigured) return;
  Sentry.captureMessage(message, context ? { level: 'warning', extra: context } : { level: 'warning' });
}
