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
    share_description_fallback: string;
  };
  tickets: {
    title: string;
    loading: string;
  };
  legal: {
    terms_title: string;
    organizer_terms_title: string;
    refund_policy_title: string;
    privacy_title: string;
    acceptable_use_title: string;
    effective_date_label: string;
    draft_notice: string;
  };
  footer: {
    terms_link: string;
    organizer_terms_link: string;
    refund_link: string;
    privacy_link: string;
    acceptable_use_link: string;
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
  quick_sale: {
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
  brand: 'Intahé',
  toggle_label: 'English',
  discover: {
    title: 'Découvrir des événements',
    intro: 'Trouve des événements près de chez toi.',
    use_location: 'Utiliser ma position',
  },
  event: {
    title: 'Événement — Intahé',
    loading: 'Chargement…',
    share_description_fallback: 'Achète tes billets sur Intahé.',
  },
  tickets: {
    title: 'Mes billets — Intahé',
    loading: 'Chargement…',
  },
  legal: {
    terms_title: 'Conditions d’utilisation — Intahé',
    organizer_terms_title: 'Convention d’organisateur — Intahé',
    refund_policy_title: 'Politique de remboursement — Intahé',
    privacy_title: 'Politique de confidentialité — Intahé',
    acceptable_use_title: 'Politique d’utilisation acceptable — Intahé',
    effective_date_label: 'En vigueur depuis',
    draft_notice: 'Brouillon — ce document n’a pas encore été révisé par un avocat.',
  },
  footer: {
    terms_link: 'Conditions d’utilisation',
    organizer_terms_link: 'Convention d’organisateur',
    refund_link: 'Remboursements',
    privacy_link: 'Confidentialité',
    acceptable_use_link: 'Utilisation acceptable',
  },
  nav: {
    organizations: 'Organisations',
    profile: 'Profil',
    logout: 'Se déconnecter',
    login_link: 'Se connecter',
  },
  login: { title: 'Connexion — Intahé' },
  signup: { title: 'Créer un compte — Intahé' },
  organizations_page: { title: 'Organisations — Intahé' },
  organization_detail: { title: 'Organisation — Intahé' },
  org_members: { title: 'Membres — Intahé' },
  org_dashboard: { title: 'Tableau de bord — Intahé' },
  org_payouts: { title: 'Versements — Intahé' },
  quick_sale: { title: 'Vente rapide — Intahé' },
  event_fees: { title: 'Détail des frais — Intahé' },
  stripe_connect_return: { title: 'Stripe — Intahé' },
  admin_payouts: { title: 'Console d’administration — Versements — Intahé' },
  admin_reconciliation: { title: 'Console d’administration — Réconciliation — Intahé' },
  manage_event: { title: 'Événement — Intahé' },
  check_in: { title: 'Check-in — Intahé' },
  guest_list: { title: 'Liste des invités — Intahé' },
  org_orders: { title: 'Commandes — Intahé' },
  order_tickets: { title: 'Billets — Intahé' },
  profile: { title: 'Profil — Intahé' },
  delete_account: { title: 'Supprimer mon compte — Intahé' },
};

const en: ServerStrings = {
  brand: 'Intahé',
  toggle_label: 'Français',
  discover: {
    title: 'Discover events',
    intro: 'Find events near you.',
    use_location: 'Use my location',
  },
  event: {
    title: 'Event — Intahé',
    loading: 'Loading…',
    share_description_fallback: 'Get your tickets on Intahé.',
  },
  tickets: {
    title: 'My tickets — Intahé',
    loading: 'Loading…',
  },
  legal: {
    terms_title: 'Terms of Use — Intahé',
    organizer_terms_title: 'Organizer Terms — Intahé',
    refund_policy_title: 'Refund policy — Intahé',
    privacy_title: 'Privacy policy — Intahé',
    acceptable_use_title: 'Acceptable Use Policy — Intahé',
    effective_date_label: 'Effective',
    draft_notice: 'Draft — this document has not yet been reviewed by a lawyer.',
  },
  footer: {
    terms_link: 'Terms of Use',
    organizer_terms_link: 'Organizer Terms',
    refund_link: 'Refunds',
    privacy_link: 'Privacy',
    acceptable_use_link: 'Acceptable Use',
  },
  nav: {
    organizations: 'Organizations',
    profile: 'Profile',
    logout: 'Log out',
    login_link: 'Log in',
  },
  login: { title: 'Log in — Intahé' },
  signup: { title: 'Create an account — Intahé' },
  organizations_page: { title: 'Organizations — Intahé' },
  organization_detail: { title: 'Organization — Intahé' },
  org_members: { title: 'Members — Intahé' },
  org_dashboard: { title: 'Dashboard — Intahé' },
  org_payouts: { title: 'Payouts — Intahé' },
  quick_sale: { title: 'Quick sale — Intahé' },
  event_fees: { title: 'Fee breakdown — Intahé' },
  stripe_connect_return: { title: 'Stripe — Intahé' },
  admin_payouts: { title: 'Admin console — Payouts — Intahé' },
  admin_reconciliation: { title: 'Admin console — Reconciliation — Intahé' },
  manage_event: { title: 'Event — Intahé' },
  check_in: { title: 'Check-in — Intahé' },
  guest_list: { title: 'Guest list — Intahé' },
  org_orders: { title: 'Orders — Intahé' },
  order_tickets: { title: 'Tickets — Intahé' },
  profile: { title: 'Profile — Intahé' },
  delete_account: { title: 'Delete my account — Intahé' },
};

export const serverStrings: Record<Locale, ServerStrings> = { fr, en };
