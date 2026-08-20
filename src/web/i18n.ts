import type { Request, Response } from 'express';

export type Locale = 'fr' | 'en';

const COOKIE_NAME = 'lang';

// No cookie-parsing dependency in this app (nothing else needs one) — this
// is the one place a cookie is read/written, so a couple of small manual
// helpers are simpler than adding cookie-parser for a single key.
function readCookie(req: Request, name: string): string | undefined {
  const header = req.headers.cookie;
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key === name) return decodeURIComponent(rest.join('='));
  }
  return undefined;
}

function writeCookie(res: Response, name: string, value: string): void {
  res.append('Set-Cookie', `${name}=${encodeURIComponent(value)}; Max-Age=${365 * 24 * 60 * 60}; Path=/; SameSite=Lax`);
}

function isLocale(value: unknown): value is Locale {
  return value === 'fr' || value === 'en';
}

/**
 * Resolution order: explicit ?lang= query param (also persisted to a
 * cookie so it sticks across pages) > existing cookie > Accept-Language
 * header > default fr.
 */
export function resolveLocale(req: Request, res: Response): Locale {
  const query = req.query['lang'];
  if (isLocale(query)) {
    writeCookie(res, COOKIE_NAME, query);
    return query;
  }
  const cookie = readCookie(req, COOKIE_NAME);
  if (isLocale(cookie)) return cookie;
  const acceptLanguage = req.headers['accept-language'] ?? '';
  return acceptLanguage.toLowerCase().startsWith('en') ? 'en' : 'fr';
}

interface ServerStrings {
  brand: string;
  toggle_label: string;
  discover: {
    title: string;
    intro: string;
    use_location: string;
  };
  event: {
    title: string;
    loading: string;
  };
  tickets: {
    title: string;
    loading: string;
  };
  privacy: {
    title: string;
  };
}

const fr: ServerStrings = {
  brand: 'Intahe',
  toggle_label: 'English',
  discover: {
    title: 'Découvrir des événements',
    intro: 'Trouve des événements près de chez toi.',
    use_location: 'Utiliser ma position',
  },
  event: {
    title: 'Événement — Intahe',
    loading: 'Chargement…',
  },
  tickets: {
    title: 'Mes billets — Intahe',
    loading: 'Chargement…',
  },
  privacy: {
    title: 'Politique de confidentialité — Intahe',
  },
};

const en: ServerStrings = {
  brand: 'Intahe',
  toggle_label: 'Français',
  discover: {
    title: 'Discover events',
    intro: 'Find events near you.',
    use_location: 'Use my location',
  },
  event: {
    title: 'Event — Intahe',
    loading: 'Loading…',
  },
  tickets: {
    title: 'My tickets — Intahe',
    loading: 'Loading…',
  },
  privacy: {
    title: 'Privacy policy — Intahe',
  },
};

export const serverStrings: Record<Locale, ServerStrings> = { fr, en };
