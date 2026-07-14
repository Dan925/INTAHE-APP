import { ApiError } from './errors';

export interface CursorPage<T> {
  items: T[];
  next_cursor: string | null;
}

export interface DecodedCursor {
  createdAt: string;
  id: string;
}

export function encodeCursor(createdAt: Date, id: string): string {
  return Buffer.from(`${createdAt.toISOString()}|${id}`, 'utf8').toString('base64url');
}

export function decodeCursor(cursor: string): DecodedCursor {
  let decoded: string;
  try {
    decoded = Buffer.from(cursor, 'base64url').toString('utf8');
  } catch {
    throw new ApiError(400, 'invalid_cursor', 'The cursor parameter is invalid.', 'cursor');
  }
  const [createdAt, id] = decoded.split('|');
  if (!createdAt || !id || Number.isNaN(Date.parse(createdAt))) {
    throw new ApiError(400, 'invalid_cursor', 'The cursor parameter is invalid.', 'cursor');
  }
  return { createdAt, id };
}

export function parseLimit(raw: unknown, max = 100, def = 20): number {
  if (raw === undefined) {
    return def;
  }
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1 || n > max) {
    throw new ApiError(400, 'validation_error', `limit must be an integer between 1 and ${max}.`, 'limit');
  }
  return n;
}

export function buildPage<Row, Item>(
  rows: Row[],
  limit: number,
  toItem: (row: Row) => Item,
  toCursor: (row: Row) => string,
): CursorPage<Item> {
  const hasMore = rows.length > limit;
  const pageRows = hasMore ? rows.slice(0, limit) : rows;
  const lastRow = pageRows[pageRows.length - 1];
  return {
    items: pageRows.map(toItem),
    next_cursor: hasMore && lastRow ? toCursor(lastRow) : null,
  };
}
