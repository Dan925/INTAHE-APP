import type { RequestHandler } from 'express';

export const notFoundHandler: RequestHandler = (_req, res) => {
  res.status(404).json({
    error: { code: 'not_found', message: 'Resource not found.', field: null },
  });
};
