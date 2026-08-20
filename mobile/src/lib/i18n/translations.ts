export interface Translations {
  common: {
    error_generic: string;
  };
  login: {
    brand: string;
    subtitle: string;
    email: string;
    password: string;
    submit: string;
    invalid_credentials: string;
    no_account: string;
    discover_link: string;
  };
  signup: {
    title: string;
    subtitle: string;
    full_name: string;
    email: string;
    password: string;
    submit: string;
    email_taken: string;
    already_account: string;
  };
  discover: {
    header_title: string;
    use_location: string;
    location_denied: string;
    load_error: string;
    empty: string;
  };
  event_detail: {
    header_title: string;
    date_range: string;
    load_error: string;
    tickets_heading: string;
    tickets_empty: string;
    remaining: string;
    buyer_email: string;
    quantity: string;
    order_button: string;
    order_error_generic: string;
    selected: string;
    order_created: string;
    total: string;
    status: string;
    payment_succeeded: string;
    pay_now: string;
    view_tickets: string;
    payment_not_ready: string;
  };
  tickets: {
    header_title: string;
    load_error: string;
    empty: string;
    scanned: string;
    not_scanned: string;
  };
}

export const fr: Translations = {
  common: {
    error_generic: 'Une erreur est survenue. Réessaie.',
  },
  login: {
    brand: 'Intahe',
    subtitle: 'Connecte-toi pour gérer tes événements ou tes billets.',
    email: 'Email',
    password: 'Mot de passe',
    submit: 'Se connecter',
    invalid_credentials: 'Email ou mot de passe incorrect.',
    no_account: 'Pas encore de compte ? Inscris-toi',
    discover_link: 'Découvrir des événements sans compte',
  },
  signup: {
    title: 'Créer un compte',
    subtitle: 'Un seul compte pour acheter des billets et organiser des événements.',
    full_name: 'Nom complet',
    email: 'Email',
    password: 'Mot de passe',
    submit: 'Créer le compte',
    email_taken: 'Un compte existe déjà avec cet email.',
    already_account: 'Déjà un compte ? Connecte-toi',
  },
  discover: {
    header_title: 'Découvrir',
    use_location: 'Utiliser ma position',
    location_denied: 'Position refusée — les événements sont affichés par date.',
    load_error: 'Impossible de charger les événements.',
    empty: "Aucun événement découvrable pour l'instant.",
  },
  event_detail: {
    header_title: 'Événement',
    date_range: 'Du {{start}} au {{end}}',
    load_error: "Impossible de charger l'événement.",
    tickets_heading: 'Billets',
    tickets_empty: "Aucun billet disponible pour l'instant.",
    remaining: '{{count}} restant(s)',
    buyer_email: "E-mail de l'acheteur",
    quantity: 'Quantité',
    order_button: 'Commander',
    order_error_generic: 'Impossible de créer la commande.',
    selected: 'Sélectionné',
    order_created: 'Commande créée',
    total: 'Total : {{amount}}',
    status: 'Statut : {{status}}',
    payment_succeeded: 'Paiement réussi',
    pay_now: 'Payer maintenant',
    view_tickets: 'Voir mes billets',
    payment_not_ready: "Le paiement n'a pas pu être initialisé.",
  },
  tickets: {
    header_title: 'Mes billets',
    load_error:
      "Impossible de charger les billets. Le paiement n'a peut-être pas encore été confirmé.",
    empty: "Aucun billet pour cette commande pour l'instant.",
    scanned: 'Scanné',
    not_scanned: 'Pas encore scanné',
  },
};

export const en: Translations = {
  common: {
    error_generic: 'Something went wrong. Try again.',
  },
  login: {
    brand: 'Intahe',
    subtitle: 'Sign in to manage your events or tickets.',
    email: 'Email',
    password: 'Password',
    submit: 'Sign in',
    invalid_credentials: 'Incorrect email or password.',
    no_account: "Don't have an account? Sign up",
    discover_link: 'Discover events without an account',
  },
  signup: {
    title: 'Create an account',
    subtitle: 'One account to buy tickets and organize events.',
    full_name: 'Full name',
    email: 'Email',
    password: 'Password',
    submit: 'Create account',
    email_taken: 'An account already exists with this email.',
    already_account: 'Already have an account? Sign in',
  },
  discover: {
    header_title: 'Discover',
    use_location: 'Use my location',
    location_denied: 'Location denied — events are shown sorted by date.',
    load_error: 'Unable to load events.',
    empty: 'No discoverable events right now.',
  },
  event_detail: {
    header_title: 'Event',
    date_range: 'From {{start}} to {{end}}',
    load_error: 'Unable to load this event.',
    tickets_heading: 'Tickets',
    tickets_empty: 'No tickets available right now.',
    remaining: '{{count}} left',
    buyer_email: "Buyer's email",
    quantity: 'Quantity',
    order_button: 'Order',
    order_error_generic: 'Unable to create the order.',
    selected: 'Selected',
    order_created: 'Order created',
    total: 'Total: {{amount}}',
    status: 'Status: {{status}}',
    payment_succeeded: 'Payment successful',
    pay_now: 'Pay now',
    view_tickets: 'View my tickets',
    payment_not_ready: 'Payment could not be initialized.',
  },
  tickets: {
    header_title: 'My tickets',
    load_error: "Unable to load tickets. The payment may not be confirmed yet.",
    empty: 'No tickets for this order yet.',
    scanned: 'Scanned',
    not_scanned: 'Not scanned yet',
  },
};

export type Locale = 'fr' | 'en';
export const dictionaries: Record<Locale, Translations> = { fr, en };
