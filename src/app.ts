import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { errorHandler } from './middleware/errorHandler';
import { notFoundHandler } from './middleware/notFoundHandler';
import authRouter from './routes/v1/auth';
import checkoutRouter from './routes/v1/checkout';
import eventsRouter from './routes/v1/events';
import organizationsRouter from './routes/v1/organizations';
import ordersRouter from './routes/v1/orders';
import stripeWebhookRouter from './routes/v1/stripeWebhook';
import ticketTypesRouter from './routes/v1/ticketTypes';

export function createApp() {
  const app = express();

  app.use(helmet());
  app.use(cors());

  // Must be registered before express.json(): Stripe verifies the webhook
  // signature against the raw request body, which express.json() would
  // otherwise have already parsed and consumed.
  app.use('/v1/stripe/webhook', stripeWebhookRouter);

  app.use(express.json());

  app.get('/health', (_req, res) => {
    res.status(200).json({ status: 'ok' });
  });

  app.use('/v1/auth', authRouter);
  app.use('/v1/organizations', organizationsRouter);
  app.use('/v1/organizations/:organizationId/events', eventsRouter);
  app.use('/v1/organizations/:organizationId/events/:eventId/ticket-types', ticketTypesRouter);
  app.use('/v1/organizations/:organizationId/events/:eventId/orders', ordersRouter);
  app.use('/v1/events/:eventId/orders', checkoutRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
