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
    or_divider: string;
    apple_error: string;
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
  profile: {
    title: string;
    logout: string;
    delete_account_link: string;
  };
  delete_account: {
    title: string;
    warning: string;
    password_label: string;
    password_required: string;
    confirm_button: string;
    cancel_button: string;
    invalid_password: string;
    owns_organizations: string;
    error_generic: string;
    confirm_dialog_title: string;
    confirm_dialog_message: string;
    confirm_dialog_confirm: string;
    confirm_dialog_cancel: string;
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
    or_divider: 'ou',
    apple_error: 'La connexion avec Apple a échoué. Réessaie.',
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
  profile: {
    title: 'Profil',
    logout: 'Se déconnecter',
    delete_account_link: 'Supprimer mon compte',
  },
  delete_account: {
    title: 'Supprimer mon compte',
    warning:
      'Cette action est irréversible. Ton profil sera supprimé définitivement. Tes commandes et billets passés restent visibles aux organisateurs concernés, comme l’exige la tenue de registres.',
    password_label: 'Mot de passe',
    password_required: 'Entre ton mot de passe pour confirmer.',
    confirm_button: 'Supprimer définitivement mon compte',
    cancel_button: 'Annuler',
    invalid_password: 'Mot de passe incorrect.',
    owns_organizations:
      'Transfère ou supprime ton (tes) organisation(s) avant de supprimer ton compte.',
    error_generic: 'Une erreur est survenue. Réessaie.',
    confirm_dialog_title: 'Supprimer ton compte ?',
    confirm_dialog_message: 'Cette action est définitive et ne peut pas être annulée.',
    confirm_dialog_confirm: 'Supprimer',
    confirm_dialog_cancel: 'Annuler',
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
    or_divider: 'or',
    apple_error: 'Sign in with Apple failed. Try again.',
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
  profile: {
    title: 'Profile',
    logout: 'Log out',
    delete_account_link: 'Delete my account',
  },
  delete_account: {
    title: 'Delete my account',
    warning:
      "This can't be undone. Your profile will be permanently deleted. Your past orders and tickets stay visible to the relevant organizers, as required for record-keeping.",
    password_label: 'Password',
    password_required: 'Enter your password to confirm.',
    confirm_button: 'Permanently delete my account',
    cancel_button: 'Cancel',
    invalid_password: 'Incorrect password.',
    owns_organizations: 'Transfer or delete your organization(s) before deleting your account.',
    error_generic: 'Something went wrong. Try again.',
    confirm_dialog_title: 'Delete your account?',
    confirm_dialog_message: "This is permanent and can't be undone.",
    confirm_dialog_confirm: 'Delete',
    confirm_dialog_cancel: 'Cancel',
  },
};

export type Locale = 'fr' | 'en';
export const dictionaries: Record<Locale, Translations> = { fr, en };
