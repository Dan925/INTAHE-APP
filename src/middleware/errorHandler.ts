import type { ErrorRequestHandler } from 'express';
import { ApiError } from '../utils/errors';

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof ApiError) {
    res.status(err.statusCode).json({
      error: { code: err.code, message: err.message, field: err.field },
    });
    return;
  }

  console.error(err);
  res.status(500).json({
    error: { code: 'internal_error', message: 'Something went wrong.', field: null },
  });
};
