import type { Locale } from './i18n';

// Static legal content, same pattern as privacyContent.ts: authored
// directly, never interpolated with user-controlled data.
//
// Reflects how refunds actually work in the code today (see
// eventService.cancelEvent and orderService.refundOrder): cancelling an
// event does NOT automatically refund its orders — an organizer (or
// Intahe, in a dispute) has to trigger a refund, full or partial, as a
// separate deliberate action. So the policy states a "sales are final by
// default, refunds are the organizer's call, except where the event
// itself gets cancelled" position rather than promising an automatic
// refund that the system doesn't actually perform.

const fr = `
<h1>Politique de remboursement</h1>
<p class="text-secondary small">Dernière mise à jour : 20 août 2026</p>

<h2>1. Principe général : ventes finales</h2>
<p>Sauf indication contraire de l'organisateur pour un événement précis, les ventes de billets sur Intahe sont finales. Cela reflète la pratique courante en billetterie d'événements : une fois un billet acheté, une place a été retenue pour toi et retirée de l'inventaire disponible.</p>

<h2>2. Si l'événement est annulé</h2>
<p>Si l'organisateur annule l'événement, il est responsable d'émettre les remboursements aux personnes ayant acheté un billet. Intahe fournit à l'organisateur les outils pour le faire (remboursement total ou partiel, directement via Stripe). Si un événement que tu as payé est annulé et que tu ne reçois pas de remboursement dans un délai raisonnable, écris-nous à support@syncerainc.com — nous allons contacter l'organisateur en ton nom.</p>

<h2>3. Si l'événement est reporté</h2>
<p>Si l'organisateur reporte un événement à une date ultérieure, ton billet demeure valide pour la nouvelle date, sauf si l'organisateur choisit d'offrir des remboursements. Vérifie les communications de l'organisateur pour les détails propres à l'événement.</p>

<h2>4. Remboursements à la discrétion de l'organisateur</h2>
<p>Un organisateur peut choisir, à sa discrétion, d'offrir un remboursement total ou partiel même sans annulation (par exemple en cas d'erreur d'achat ou de situation exceptionnelle). Adresse-toi directement à l'organisateur de l'événement pour ce type de demande — c'est lui qui contrôle sa politique de vente, Intahe fournit seulement la plateforme et les outils de paiement.</p>

<h2>5. Frais de service</h2>
<p>Lorsqu'un remboursement est accordé, le ou les frais Stripe déjà engagés sur la transaction originale ne sont généralement pas récupérables par Intahe ni par l'organisateur; ils peuvent donc ne pas être inclus dans le montant remboursé, selon ce que l'organisateur choisit.</p>

<h2>6. Erreurs techniques</h2>
<p>Si tu as été facturé deux fois pour le même billet, si le paiement a échoué mais que le montant a tout de même été débité, ou si tu rencontres tout autre problème technique lié à un paiement, écris-nous à support@syncerainc.com — ce type de situation est corrigé rapidement, peu importe la politique de vente de l'événement.</p>

<h2>7. Comment demander un remboursement</h2>
<p>Pour toute demande liée à un événement précis, contacte d'abord l'organisateur (ses coordonnées apparaissent généralement dans le courriel de confirmation de commande). Si tu ne parviens pas à le joindre ou si le problème concerne un enjeu technique de la plateforme plutôt que l'événement lui-même, écris-nous à support@syncerainc.com.</p>

<h2>8. Modifications</h2>
<p>Nous pouvons mettre à jour cette politique de temps à autre. La date de la dernière mise à jour est indiquée en haut de cette page.</p>
`;

const en = `
<h1>Refund policy</h1>
<p class="text-secondary small">Last updated: August 20, 2026</p>

<h2>1. General rule: sales are final</h2>
<p>Unless an organizer states otherwise for a specific event, ticket sales on Intahe are final. This reflects standard practice for event ticketing: once a ticket is purchased, a spot has been held for you and removed from available inventory.</p>

<h2>2. If the event is cancelled</h2>
<p>If the organizer cancels the event, they are responsible for issuing refunds to people who bought a ticket. Intahe gives the organizer the tools to do this (full or partial refund, directly through Stripe). If an event you paid for is cancelled and you don't receive a refund within a reasonable time, write to us at support@syncerainc.com — we'll follow up with the organizer on your behalf.</p>

<h2>3. If the event is postponed</h2>
<p>If the organizer postpones an event to a later date, your ticket stays valid for the new date, unless the organizer chooses to offer refunds instead. Check the organizer's communications for event-specific details.</p>

<h2>4. Refunds at the organizer's discretion</h2>
<p>An organizer may choose, at their discretion, to offer a full or partial refund even without a cancellation (for example for a purchase mistake or an exceptional situation). Reach out to the event's organizer directly for this kind of request — they control their own sales policy, Intahe only provides the platform and payment tools.</p>

<h2>5. Service fees</h2>
<p>When a refund is granted, the Stripe processing fees already incurred on the original transaction are generally not recoverable by Intahe or the organizer, and may therefore not be included in the refunded amount, depending on what the organizer decides.</p>

<h2>6. Technical errors</h2>
<p>If you were charged twice for the same ticket, if a payment failed but you were still charged, or if you run into any other payment-related technical issue, write to us at support@syncerainc.com — this kind of issue gets fixed promptly, regardless of the event's sales policy.</p>

<h2>7. How to request a refund</h2>
<p>For anything related to a specific event, contact the organizer first (their contact details usually appear in your order confirmation email). If you can't reach them, or the issue is a platform-level technical problem rather than something about the event itself, write to us at support@syncerainc.com.</p>

<h2>8. Changes</h2>
<p>We may update this policy from time to time. The date of the last update is shown at the top of this page.</p>
`;

const versions: Record<Locale, string> = { fr, en };

export function refundPolicyHtml(locale: Locale): string {
  return versions[locale];
}
