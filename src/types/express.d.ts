import type { Role } from './roles';

export interface AuthenticatedUser {
  id: string;
  email: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
      membership?: { organizationId: string; role: Role };
      // Set by requireAuth alongside `user` — POST /v1/auth/logout reads
      // these to revoke exactly the token that made this request. Not set
      // on an optionalAuth route reached as a guest.
      tokenJti?: string;
      tokenExp?: number;
    }
  }
}

export {};
