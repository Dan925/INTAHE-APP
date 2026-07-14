/**
 * All API errors are serialized as `{ error: { code, message, field } }`.
 * Clients (web + mobile) branch on `code`, never on `message`.
 */
export class ApiError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
    public readonly field: string | null = null,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}
