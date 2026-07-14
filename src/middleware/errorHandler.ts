import type { ErrorRequestHandler } from 'express';
import { ApiError } from '../utils/errors';

// Postgres error codes: https://www.postgresql.org/docs/current/errcodes-appendix.html
const PG_CHECK_VIOLATION = '23514';

function isPgError(err: unknown): err is { code: string } {
  return typeof err === 'object' && err !== null && 'code' in err && typeof (err as { code: unknown }).code === 'string';
}

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof ApiError) {
    res.status(err.statusCode).json({
      error: { code: err.code, message: err.message, field: err.field },
    });
    return;
  }

  // A DB-level CHECK constraint failing (e.g. end_at <= start_at slipping
  // past application validation) is a client input problem, not a server
  // fault — surface it as a 400 rather than an opaque 500.
  if (isPgError(err) && err.code === PG_CHECK_VIOLATION) {
    res.status(400).json({
      error: { code: 'invalid_input', message: 'The request violates a data constraint.', field: null },
    });
    return;
  }

  console.error(err);
  res.status(500).json({
    error: { code: 'internal_error', message: 'Something went wrong.', field: null },
  });
};
