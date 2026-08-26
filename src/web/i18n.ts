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

export interface ServerStrings {
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
  refund: {
    title: string;
  };
  footer: {
    privacy_link: string;
    refund_link: string;
  };
  nav: {
    organizations: string;
    profile: string;
    logout: string;
    login_link: string;
  };
  login: {
    title: string;
  };
  signup: {
    title: string;
  };
  organizations_page: {
    title: string;
  };
  organization_detail: {
    title: string;
  };
  org_members: {
    title: string;
  };
  org_dashboard: {
    title: string;
  };
  org_payouts: {
    title: string;
  };
  event_fees: {
    title: string;
  };
  stripe_connect_return: {
    title: string;
  };
  admin_payouts: {
    title: string;
  };
  admin_reconciliation: {
    title: string;
  };
  manage_event: {
    title: string;
  };
  check_in: {
    title: string;
  };
  guest_list: {
    title: string;
  };
  org_orders: {
    title: string;
  };
  order_tickets: {
    title: string;
  };
  profile: {
    title: string;
  };
  delete_account: {
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
  refund: {
    title: 'Politique de remboursement — Intahe',
  },
  footer: {
    privacy_link: 'Confidentialité',
    refund_link: 'Remboursements',
  },
  nav: {
    organizations: 'Organisations',
    profile: 'Profil',
    logout: 'Se déconnecter',
    login_link: 'Se connecter',
  },
  login: { title: 'Connexion — Intahe' },
  signup: { title: 'Créer un compte — Intahe' },
  organizations_page: { title: 'Organisations — Intahe' },
  organization_detail: { title: 'Organisation — Intahe' },
  org_members: { title: 'Membres — Intahe' },
  org_dashboard: { title: 'Tableau de bord — Intahe' },
  org_payouts: { title: 'Versements — Intahe' },
  event_fees: { title: 'Détail des frais — Intahe' },
  stripe_connect_return: { title: 'Stripe — Intahe' },
  admin_payouts: { title: 'Console d’administration — Versements — Intahe' },
  admin_reconciliation: { title: 'Console d’administration — Réconciliation — Intahe' },
  manage_event: { title: 'Événement — Intahe' },
  check_in: { title: 'Check-in — Intahe' },
  guest_list: { title: 'Liste des invités — Intahe' },
  org_orders: { title: 'Commandes — Intahe' },
  order_tickets: { title: 'Billets — Intahe' },
  profile: { title: 'Profil — Intahe' },
  delete_account: { title: 'Supprimer mon compte — Intahe' },
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
  refund: {
    title: 'Refund policy — Intahe',
  },
  footer: {
    privacy_link: 'Privacy',
    refund_link: 'Refunds',
  },
  nav: {
    organizations: 'Organizations',
    profile: 'Profile',
    logout: 'Log out',
    login_link: 'Log in',
  },
  login: { title: 'Log in — Intahe' },
  signup: { title: 'Create an account — Intahe' },
  organizations_page: { title: 'Organizations — Intahe' },
  organization_detail: { title: 'Organization — Intahe' },
  org_members: { title: 'Members — Intahe' },
  org_dashboard: { title: 'Dashboard — Intahe' },
  org_payouts: { title: 'Payouts — Intahe' },
  event_fees: { title: 'Fee breakdown — Intahe' },
  stripe_connect_return: { title: 'Stripe — Intahe' },
  admin_payouts: { title: 'Admin console — Payouts — Intahe' },
  admin_reconciliation: { title: 'Admin console — Reconciliation — Intahe' },
  manage_event: { title: 'Event — Intahe' },
  check_in: { title: 'Check-in — Intahe' },
  guest_list: { title: 'Guest list — Intahe' },
  org_orders: { title: 'Orders — Intahe' },
  order_tickets: { title: 'Tickets — Intahe' },
  profile: { title: 'Profile — Intahe' },
  delete_account: { title: 'Delete my account — Intahe' },
};

export const serverStrings: Record<Locale, ServerStrings> = { fr, en };
