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
    }
  }
}

export {};
