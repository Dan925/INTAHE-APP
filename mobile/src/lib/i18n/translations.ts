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
  nav: {
    organizations: string;
    members: string;
    dashboard: string;
    orders: string;
    guest_list: string;
    check_in: string;
  };
  roles: {
    owner: string;
    admin: string;
    staff: string;
    volunteer: string;
  };
  organizations_list: {
    load_error: string;
    create_error: string;
    accept_error: string;
    discover_button: string;
    pending_invites_title: string;
    accept_button: string;
    org_name_label: string;
    cancel_button: string;
    create_button: string;
    new_org_button: string;
    empty: string;
  };
  organization_detail: {
    load_error: string;
    create_event_error: string;
    members_button: string;
    dashboard_button: string;
    event_name_label: string;
    start_label: string;
    end_label: string;
    address_label: string;
    location_saved: string;
    use_current_location: string;
    discoverable_title: string;
    discoverable_subtitle: string;
    cancel_button: string;
    create_button: string;
    new_event_button: string;
    empty: string;
  };
  org_members: {
    load_error: string;
    invite_error_generic: string;
    invite_error_not_found: string;
    invite_error_already_member: string;
    invite_error_already_pending: string;
    role_update_error: string;
    remove_error: string;
    invite_title: string;
    email_label: string;
    invite_button: string;
    empty: string;
    pending_invite_suffix: string;
    change_role_button: string;
    remove_button: string;
  };
  org_dashboard: {
    load_error: string;
    tickets_sold: string;
    orders_paid: string;
    net_revenue: string;
    by_event: string;
    empty: string;
    orders_tickets_summary: string;
    net_prefix: string;
  };
  manage_event: {
    load_error: string;
    action_error: string;
    create_ticket_type_error: string;
    publish_button: string;
    cancel_event_button: string;
    management_title: string;
    orders_button: string;
    guest_list_button: string;
    check_in_button: string;
    ticket_types_title: string;
    add_button: string;
    ticket_name_label: string;
    ticket_price_label: string;
    ticket_quantity_label: string;
    create_type_button: string;
    cancel_form_button: string;
    ticket_types_empty: string;
    sold_summary: string;
    buy_tickets_title: string;
    buy_tickets_hint: string;
  };
  check_in: {
    hint: string;
    code_label: string;
    submit_button: string;
    error_generic: string;
    error_not_found: string;
    error_already: string;
    success_title: string;
  };
  guest_list: {
    load_error: string;
    empty: string;
    scanned: string;
    pending: string;
  };
  org_orders: {
    load_error: string;
    empty: string;
    status_pending: string;
    status_paid: string;
    status_refunded: string;
    status_partially_refunded: string;
  };
  order_tickets: {
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
  nav: {
    organizations: 'Organisations',
    members: 'Membres',
    dashboard: 'Tableau de bord',
    orders: 'Commandes',
    guest_list: 'Liste des invités',
    check_in: 'Check-in',
  },
  roles: {
    owner: 'Propriétaire',
    admin: 'Admin',
    staff: 'Staff',
    volunteer: 'Bénévole',
  },
  organizations_list: {
    load_error: 'Impossible de charger les organisations.',
    create_error: "Impossible de créer l'organisation.",
    accept_error: "Impossible d'accepter cette invitation.",
    discover_button: 'Découvrir des événements',
    pending_invites_title: 'Invitations en attente',
    accept_button: 'Accepter',
    org_name_label: "Nom de l'organisation",
    cancel_button: 'Annuler',
    create_button: 'Créer',
    new_org_button: 'Nouvelle organisation',
    empty: 'Aucune organisation pour l’instant.',
  },
  organization_detail: {
    load_error: 'Impossible de charger cette organisation.',
    create_event_error: "Impossible de créer l'événement.",
    members_button: 'Membres',
    dashboard_button: 'Tableau de bord',
    event_name_label: "Nom de l'événement",
    start_label: 'Début',
    end_label: 'Fin',
    address_label: 'Adresse (optionnel)',
    location_saved: 'Position enregistrée ✓',
    use_current_location: 'Utiliser ma position actuelle',
    discoverable_title: 'Événement découvrable',
    discoverable_subtitle: 'Visible dans la recherche publique d’événements à proximité.',
    cancel_button: 'Annuler',
    create_button: 'Créer',
    new_event_button: 'Nouvel événement',
    empty: 'Aucun événement pour l’instant.',
  },
  org_members: {
    load_error: 'Impossible de charger les membres.',
    invite_error_generic: "Impossible d'inviter cette personne.",
    invite_error_not_found: "Aucun compte Intahe n'existe avec cet email.",
    invite_error_already_member: 'Cette personne est déjà membre de l’organisation.',
    invite_error_already_pending: 'Une invitation est déjà en attente pour cette personne.',
    role_update_error: 'Impossible de modifier ce rôle.',
    remove_error: 'Impossible de retirer ce membre.',
    invite_title: 'Inviter un membre',
    email_label: 'Email',
    invite_button: 'Inviter',
    empty: 'Aucun membre pour l’instant.',
    pending_invite_suffix: ' (invitation en attente)',
    change_role_button: 'Changer le rôle',
    remove_button: 'Retirer',
  },
  org_dashboard: {
    load_error: 'Impossible de charger le dashboard.',
    tickets_sold: 'Billets vendus',
    orders_paid: 'Commandes payées',
    net_revenue: 'Revenu net',
    by_event: 'Par événement',
    empty: 'Aucun événement pour l’instant.',
    orders_tickets_summary: '{{orders}} commandes · {{tickets}} billets',
    net_prefix: 'Net : {{amount}}',
  },
  manage_event: {
    load_error: "Impossible de charger l'événement.",
    action_error: 'Action impossible.',
    create_ticket_type_error: 'Impossible de créer ce type de billet.',
    publish_button: "Publier l'événement",
    cancel_event_button: "Annuler l'événement",
    management_title: 'Gestion',
    orders_button: 'Commandes',
    guest_list_button: 'Liste des invités',
    check_in_button: 'Check-in',
    ticket_types_title: 'Types de billets',
    add_button: 'Ajouter',
    ticket_name_label: 'Nom',
    ticket_price_label: 'Prix (CAD)',
    ticket_quantity_label: 'Quantité disponible',
    create_type_button: 'Créer',
    cancel_form_button: 'Annuler',
    ticket_types_empty: 'Aucun type de billet pour l’instant.',
    sold_summary: '{{price}} · {{sold}}/{{total}} vendus',
    buy_tickets_title: 'Acheter des billets',
    buy_tickets_hint: 'Choisissez un type de billet ci-dessus, puis renseignez vos informations pour créer la commande.',
  },
  check_in: {
    hint: 'Saisis le code du billet (habituellement scanné via QR code) pour l’enregistrer à l’entrée.',
    code_label: 'Code du billet',
    submit_button: "Enregistrer l'entrée",
    error_generic: 'Impossible de valider ce billet.',
    error_not_found: 'Aucun billet ne correspond à ce code pour cet événement.',
    error_already: 'Ce billet a déjà été scanné.',
    success_title: 'Billet validé',
  },
  guest_list: {
    load_error: 'Impossible de charger la liste des invités.',
    empty: 'Aucun billet vendu pour l’instant.',
    scanned: 'Scanné',
    pending: 'En attente',
  },
  org_orders: {
    load_error: 'Impossible de charger les commandes.',
    empty: 'Aucune commande pour l’instant.',
    status_pending: 'En attente',
    status_paid: 'Payée',
    status_refunded: 'Remboursée',
    status_partially_refunded: 'Partiellement remboursée',
  },
  order_tickets: {
    load_error: "Impossible de charger les billets. Le paiement n'a peut-être pas encore été confirmé.",
    empty: 'Aucun billet pour cette commande pour l’instant.',
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
  nav: {
    organizations: 'Organizations',
    members: 'Members',
    dashboard: 'Dashboard',
    orders: 'Orders',
    guest_list: 'Guest list',
    check_in: 'Check-in',
  },
  roles: {
    owner: 'Owner',
    admin: 'Admin',
    staff: 'Staff',
    volunteer: 'Volunteer',
  },
  organizations_list: {
    load_error: 'Unable to load organizations.',
    create_error: 'Unable to create the organization.',
    accept_error: 'Unable to accept this invite.',
    discover_button: 'Discover events',
    pending_invites_title: 'Pending invites',
    accept_button: 'Accept',
    org_name_label: 'Organization name',
    cancel_button: 'Cancel',
    create_button: 'Create',
    new_org_button: 'New organization',
    empty: 'No organizations yet.',
  },
  organization_detail: {
    load_error: 'Unable to load this organization.',
    create_event_error: 'Unable to create the event.',
    members_button: 'Members',
    dashboard_button: 'Dashboard',
    event_name_label: 'Event name',
    start_label: 'Start',
    end_label: 'End',
    address_label: 'Address (optional)',
    location_saved: 'Location saved ✓',
    use_current_location: 'Use my current location',
    discoverable_title: 'Discoverable event',
    discoverable_subtitle: 'Visible in the public search for nearby events.',
    cancel_button: 'Cancel',
    create_button: 'Create',
    new_event_button: 'New event',
    empty: 'No events yet.',
  },
  org_members: {
    load_error: 'Unable to load members.',
    invite_error_generic: 'Unable to invite this person.',
    invite_error_not_found: 'No Intahe account exists with this email.',
    invite_error_already_member: 'This person is already a member of the organization.',
    invite_error_already_pending: 'An invite is already pending for this person.',
    role_update_error: 'Unable to change this role.',
    remove_error: 'Unable to remove this member.',
    invite_title: 'Invite a member',
    email_label: 'Email',
    invite_button: 'Invite',
    empty: 'No members yet.',
    pending_invite_suffix: ' (invite pending)',
    change_role_button: 'Change role',
    remove_button: 'Remove',
  },
  org_dashboard: {
    load_error: 'Unable to load the dashboard.',
    tickets_sold: 'Tickets sold',
    orders_paid: 'Paid orders',
    net_revenue: 'Net revenue',
    by_event: 'By event',
    empty: 'No events yet.',
    orders_tickets_summary: '{{orders}} orders · {{tickets}} tickets',
    net_prefix: 'Net: {{amount}}',
  },
  manage_event: {
    load_error: 'Unable to load the event.',
    action_error: 'This action failed.',
    create_ticket_type_error: 'Unable to create this ticket type.',
    publish_button: 'Publish event',
    cancel_event_button: 'Cancel event',
    management_title: 'Management',
    orders_button: 'Orders',
    guest_list_button: 'Guest list',
    check_in_button: 'Check-in',
    ticket_types_title: 'Ticket types',
    add_button: 'Add',
    ticket_name_label: 'Name',
    ticket_price_label: 'Price (CAD)',
    ticket_quantity_label: 'Quantity available',
    create_type_button: 'Create',
    cancel_form_button: 'Cancel',
    ticket_types_empty: 'No ticket types yet.',
    sold_summary: '{{price}} · {{sold}}/{{total}} sold',
    buy_tickets_title: 'Buy tickets',
    buy_tickets_hint: 'Choose a ticket type above, then fill in your details to create the order.',
  },
  check_in: {
    hint: 'Enter the ticket code (usually scanned via QR code) to check it in at the door.',
    code_label: 'Ticket code',
    submit_button: 'Check in',
    error_generic: 'Unable to validate this ticket.',
    error_not_found: 'No ticket matches this code for this event.',
    error_already: 'This ticket has already been scanned.',
    success_title: 'Ticket validated',
  },
  guest_list: {
    load_error: 'Unable to load the guest list.',
    empty: 'No tickets sold yet.',
    scanned: 'Scanned',
    pending: 'Pending',
  },
  org_orders: {
    load_error: 'Unable to load orders.',
    empty: 'No orders yet.',
    status_pending: 'Pending',
    status_paid: 'Paid',
    status_refunded: 'Refunded',
    status_partially_refunded: 'Partially refunded',
  },
  order_tickets: {
    load_error: 'Unable to load tickets. The payment may not be confirmed yet.',
    empty: 'No tickets for this order yet.',
    scanned: 'Scanned',
    not_scanned: 'Not scanned yet',
  },
};

export type Locale = 'fr' | 'en';
export const dictionaries: Record<Locale, Translations> = { fr, en };
