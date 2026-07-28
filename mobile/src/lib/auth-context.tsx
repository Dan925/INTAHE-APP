import * as SecureStore from 'expo-secure-store';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Platform } from 'react-native';

import { ApiError, apiRequest } from '@/lib/api';

const STORAGE_KEY = 'intahe.session';
// expo-secure-store has no web implementation — the app's real targets are
// iOS/Android, so web just falls back to an in-memory-only session instead
// of persisting across reloads.
const isPersistenceSupported = Platform.OS !== 'web';

export interface User {
  id: string;
  email: string;
  full_name: string;
  phone: string | null;
  avatar_url: string | null;
}

interface AuthResult {
  user: User;
  access_token: string;
}

interface Session {
  user: User;
  token: string;
}

interface AuthContextValue {
  session: Session | null;
  /** True only while the persisted session is being restored at app boot. */
  isRestoring: boolean;
  signup: (input: { email: string; password: string; full_name: string; phone?: string }) => Promise<void>;
  login: (input: { email: string; password: string }) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

async function persistSession(session: Session | null): Promise<void> {
  if (!isPersistenceSupported) return;
  if (session) {
    await SecureStore.setItemAsync(STORAGE_KEY, JSON.stringify(session));
  } else {
    await SecureStore.deleteItemAsync(STORAGE_KEY);
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [isRestoring, setIsRestoring] = useState(true);

  useEffect(() => {
    if (!isPersistenceSupported) {
      setIsRestoring(false);
      return;
    }
    SecureStore.getItemAsync(STORAGE_KEY)
      .then((raw) => {
        if (raw) setSession(JSON.parse(raw) as Session);
      })
      .finally(() => setIsRestoring(false));
  }, []);

  const applyAuthResult = useCallback(async (result: AuthResult) => {
    const next: Session = { user: result.user, token: result.access_token };
    setSession(next);
    await persistSession(next);
  }, []);

  const signup = useCallback(
    async (input: { email: string; password: string; full_name: string; phone?: string }) => {
      const result = await apiRequest<AuthResult>('/v1/auth/signup', { method: 'POST', body: input });
      await applyAuthResult(result);
    },
    [applyAuthResult],
  );

  const login = useCallback(
    async (input: { email: string; password: string }) => {
      const result = await apiRequest<AuthResult>('/v1/auth/login', { method: 'POST', body: input });
      await applyAuthResult(result);
    },
    [applyAuthResult],
  );

  const logout = useCallback(async () => {
    setSession(null);
    await persistSession(null);
  }, []);

  const value = useMemo(
    () => ({ session, isRestoring, signup, login, logout }),
    [session, isRestoring, signup, login, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider.');
  return ctx;
}

export { ApiError };
