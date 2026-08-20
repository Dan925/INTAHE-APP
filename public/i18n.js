window.__INTAHE_I18N__ = {
  fr: {
    common: {
      unknown_error: 'Erreur inconnue.',
    },
    discover: {
      empty: 'Aucun événement découvrable pour le moment.',
      loading: 'Chargement…',
      load_error: 'Impossible de charger les événements. ',
      geo_unavailable: 'La géolocalisation n’est pas disponible sur cet appareil.',
      locating: 'Localisation en cours…',
      location_denied: 'Position refusée — affichage de tous les événements à venir.',
    },
    event: {
      load_error: 'Impossible de charger cet événement. ',
      tickets_heading: 'Billets',
      tickets_empty: 'Aucun billet disponible pour cet événement.',
      remaining: '{{n}} restant(s)',
      email_label: 'E-mail',
      quantity_label: 'Quantité',
      order_button: 'Commander',
      order_button_wait: 'Un instant…',
      missing_fields: 'Renseigne ton e-mail et une quantité valide.',
      payment_not_ready: 'Le paiement n’a pas pu être initialisé.',
      pay_button: 'Payer',
      pay_button_wait: 'Paiement en cours…',
      payment_failed: 'Le paiement a échoué.',
      title_suffix: ' — Intahe',
    },
    tickets: {
      title: 'Mes billets',
      load_error:
        'Impossible de charger les billets (le paiement n’a peut-être pas encore été confirmé — réessaie dans quelques secondes). ',
      empty:
        'Aucun billet pour l’instant — si tu viens de payer, le paiement est peut-être encore en cours de confirmation. Recharge la page dans quelques secondes.',
      qr_alt: 'QR code du billet',
      scanned: 'Scanné',
      not_scanned: 'Pas encore scanné',
    },
  },
  en: {
    common: {
      unknown_error: 'Unknown error.',
    },
    discover: {
      empty: 'No discoverable events right now.',
      loading: 'Loading…',
      load_error: 'Unable to load events. ',
      geo_unavailable: 'Geolocation is not available on this device.',
      locating: 'Locating…',
      location_denied: 'Location denied — showing all upcoming events.',
    },
    event: {
      load_error: 'Unable to load this event. ',
      tickets_heading: 'Tickets',
      tickets_empty: 'No tickets available for this event.',
      remaining: '{{n}} left',
      email_label: 'Email',
      quantity_label: 'Quantity',
      order_button: 'Order',
      order_button_wait: 'One moment…',
      missing_fields: 'Enter your email and a valid quantity.',
      payment_not_ready: 'Payment could not be initialized.',
      pay_button: 'Pay',
      pay_button_wait: 'Processing payment…',
      payment_failed: 'Payment failed.',
      title_suffix: ' — Intahe',
    },
    tickets: {
      title: 'My tickets',
      load_error:
        'Unable to load tickets (the payment may not be confirmed yet — try again in a few seconds). ',
      empty:
        'No tickets yet — if you just paid, the payment may still be confirming. Reload the page in a few seconds.',
      qr_alt: 'Ticket QR code',
      scanned: 'Scanned',
      not_scanned: 'Not scanned yet',
    },
  },
};

window.intaheLocale = function () {
  return document.documentElement.lang === 'en' ? 'en' : 'fr';
};

window.intaheLocaleTag = function () {
  return window.intaheLocale() === 'en' ? 'en-CA' : 'fr-CA';
};

window.intaheT = function (key, vars) {
  var dict = window.__INTAHE_I18N__[window.intaheLocale()];
  var value = key.split('.').reduce(function (acc, part) {
    return acc && Object.prototype.hasOwnProperty.call(acc, part) ? acc[part] : undefined;
  }, dict);
  if (typeof value !== 'string') return key;
  if (!vars) return value;
  return value.replace(/\{\{(\w+)\}\}/g, function (_, name) {
    return Object.prototype.hasOwnProperty.call(vars, name) ? String(vars[name]) : '';
  });
};
