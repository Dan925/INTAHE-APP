import * as Localization from 'expo-localization';
import * as SecureStore from 'expo-secure-store';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Platform } from 'react-native';

import { dictionaries, type Locale, type Translations } from './translations';

const STORAGE_KEY = 'intahe.locale';
const isPersistenceSupported = Platform.OS !== 'web';

type NestedKeyOf<T> = {
  [K in keyof T & string]: T[K] extends string ? K : `${K}.${NestedKeyOf<T[K]>}`;
}[keyof T & string];

export type TranslationKey = NestedKeyOf<Translations>;

function resolve(dict: Translations, key: string): string {
  const value = key.split('.').reduce<unknown>((acc, part) => {
    if (acc && typeof acc === 'object' && part in acc) return (acc as Record<string, unknown>)[part];
    return undefined;
  }, dict);
  return typeof value === 'string' ? value : key;
}

function interpolate(template: string, vars?: Record<string, string | number>): string {
  if (!vars) return template;
  return template.replace(/\{\{(\w+)\}\}/g, (_, name: string) => String(vars[name] ?? ''));
}

function detectDeviceLocale(): Locale {
  const tag = Localization.getLocales()[0]?.languageCode;
  return tag === 'en' ? 'en' : 'fr';
}

interface I18nContextValue {
  locale: Locale;
  /** BCP 47 tag for Intl/toLocaleString calls, e.g. Intl.NumberFormat, Date#toLocaleString. */
  localeTag: string;
  setLocale: (locale: Locale) => void;
  t: (key: TranslationKey, vars?: Record<string, string | number>) => string;
}

const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(detectDeviceLocale);

  useEffect(() => {
    if (!isPersistenceSupported) return;
    SecureStore.getItemAsync(STORAGE_KEY).then((stored) => {
      if (stored === 'fr' || stored === 'en') setLocaleState(stored);
    });
  }, []);

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    if (isPersistenceSupported) SecureStore.setItemAsync(STORAGE_KEY, next);
  }, []);

  const value = useMemo<I18nContextValue>(() => {
    const dict = dictionaries[locale];
    return {
      locale,
      localeTag: locale === 'en' ? 'en-CA' : 'fr-CA',
      setLocale,
      t: (key, vars) => interpolate(resolve(dict, key), vars),
    };
  }, [locale, setLocale]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useTranslation() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useTranslation must be used within an I18nProvider');
  return ctx;
}
