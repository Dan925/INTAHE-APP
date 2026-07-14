import type { RequestHandler } from 'express';
import type { ZodSchema } from 'zod';
import { ApiError } from './errors';

export function validateBody<T>(schema: ZodSchema<T>): RequestHandler {
  return (req, _res, next) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      const issue = result.error.issues[0];
      if (!issue) {
        next(new ApiError(400, 'validation_error', 'Invalid request body.', null));
        return;
      }
      const field = issue.path.length > 0 ? issue.path.join('.') : null;
      next(new ApiError(400, 'validation_error', issue.message, field));
      return;
    }
    req.body = result.data;
    next();
  };
}
