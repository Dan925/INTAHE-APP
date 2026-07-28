const BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL ?? 'https://intahe-api-staging.onrender.com';

export interface ApiErrorBody {
  code: string;
  message: string;
  field: string | null;
}

/** Mirrors the backend's stable error envelope: callers branch on `code`, never on `message`. */
export class ApiError extends Error {
  code: string;
  field: string | null;
  status: number;

  constructor(status: number, body: ApiErrorBody) {
    super(body.message);
    this.status = status;
    this.code = body.code;
    this.field = body.field;
  }
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
  token?: string | null;
  headers?: Record<string, string>;
}

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, token, headers } = options;

  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  const text = await res.text();
  const data = text ? JSON.parse(text) : null;

  if (!res.ok) {
    throw new ApiError(res.status, data?.error ?? { code: 'unknown_error', message: 'Something went wrong.', field: null });
  }

  return data as T;
}
