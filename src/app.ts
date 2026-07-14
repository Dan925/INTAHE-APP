import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { errorHandler } from './middleware/errorHandler';
import { notFoundHandler } from './middleware/notFoundHandler';
import authRouter from './routes/v1/auth';
import eventsRouter from './routes/v1/events';
import organizationsRouter from './routes/v1/organizations';

export function createApp() {
  const app = express();

  app.use(helmet());
  app.use(cors());
  app.use(express.json());

  app.get('/health', (_req, res) => {
    res.status(200).json({ status: 'ok' });
  });

  app.use('/v1/auth', authRouter);
  app.use('/v1/organizations', organizationsRouter);
  app.use('/v1/organizations/:organizationId/events', eventsRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
