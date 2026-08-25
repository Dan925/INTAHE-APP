import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { errorHandler } from './middleware/errorHandler';
import { notFoundHandler } from './middleware/notFoundHandler';
import adminRouter from './routes/v1/admin';
import authRouter from './routes/v1/auth';
import capacityIncidentsRouter from './routes/v1/capacityIncidents';
import checkInRouter from './routes/v1/checkin';
import checkoutRouter from './routes/v1/checkout';
import discoverRouter from './routes/v1/discover';
import eventsRouter from './routes/v1/events';
import feeBreakdownRouter from './routes/v1/feeBreakdown';
import meRouter from './routes/v1/me';
import organizationMembersRouter from './routes/v1/organizationMembers';
import organizationsRouter from './routes/v1/organizations';
import ordersRouter from './routes/v1/orders';
import stripeConnectRouter from './routes/v1/stripeConnect';
import stripeWebhookRouter from './routes/v1/stripeWebhook';
import ticketTypesRouter from './routes/v1/ticketTypes';
import webRouter from './web/routes';

export function createApp() {
  const app = express();

  // Render puts exactly one reverse proxy in front of this service, which
  // sets X-Forwarded-For to the real client IP. `1` trusts exactly that one
  // hop. Deliberately NOT `true` (trust the whole X-Forwarded-For chain) —
  // with `true`, a client can prepend any IP it wants to that header and
  // have it trusted, which is exactly what would let it fake its way past
  // IP-based rate limiting below. Without this set at all, req.ip resolves
  // to Render's proxy for every request, so every client would share one
  // apparent IP and rate limiting would block everyone at once instead of
  // just abusive callers.
  app.set('trust proxy', 1);

  // Default CSP (script-src/connect-src/frame-src 'self' only) blocks
  // Stripe.js entirely — the public checkout pages need it loaded from
  // Stripe's CDN, talking to Stripe's API, and opening its 3DS iframe.
  // Directives per Stripe's documented CSP requirements:
  // https://docs.stripe.com/security/guide#content-security-policy
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          ...helmet.contentSecurityPolicy.getDefaultDirectives(),
          'script-src': ["'self'", 'https://js.stripe.com'],
          'connect-src': ["'self'", 'https://api.stripe.com'],
          'frame-src': ["'self'", 'https://js.stripe.com', 'https://hooks.stripe.com'],
          'img-src': ["'self'", 'data:'],
        },
      },
    }),
  );
  app.use(cors());

  // Must be registered before express.json(): Stripe verifies the webhook
  // signature against the raw request body, which express.json() would
  // otherwise have already parsed and consumed.
  app.use('/v1/stripe/webhook', stripeWebhookRouter);

  app.use(express.json());

  app.get('/health', (_req, res) => {
    res.status(200).json({ status: 'ok' });
  });

  app.use('/v1/admin', adminRouter);
  app.use('/v1/auth', authRouter);
  app.use('/v1/discover', discoverRouter);
  app.use('/v1/me', meRouter);
  app.use('/v1/organizations', organizationsRouter);
  app.use('/v1/organizations/:organizationId/members', organizationMembersRouter);
  app.use('/v1/organizations/:organizationId/stripe', stripeConnectRouter);
  app.use('/v1/organizations/:organizationId/events', eventsRouter);
  app.use('/v1/organizations/:organizationId/events/:eventId/ticket-types', ticketTypesRouter);
  app.use('/v1/organizations/:organizationId/events/:eventId/orders', ordersRouter);
  app.use('/v1/organizations/:organizationId/events/:eventId/capacity-incidents', capacityIncidentsRouter);
  app.use('/v1/organizations/:organizationId/events/:eventId/fee-breakdown', feeBreakdownRouter);
  app.use('/v1/organizations/:organizationId/events/:eventId', checkInRouter);
  app.use('/v1/events/:eventId/orders', checkoutRouter);

  app.use(webRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
