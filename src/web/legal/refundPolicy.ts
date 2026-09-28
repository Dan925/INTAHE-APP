import type { Locale } from '../i18n';
import { LEGAL_DOCUMENT_VERSIONS } from '../../legal/registry';
import type { LegalDocument, LegalSection } from './types';

// Same content as the pre-/legal/ refundContent.ts (see git history),
// restructured into sections for the shared LegalPage template — no
// substantive change, so no version bump beyond the date already in
// place there.
//
// Reflects how refunds actually work in the code today (see
// eventService.cancelEvent and orderService.refundOrder): cancelling an
// event does NOT automatically refund its orders — an organizer (or
// Intahé, in a dispute) has to trigger a refund, full or partial, as a
// separate deliberate action. So the policy states a "sales are final by
// default, refunds are the organizer's call, except where the event
// itself gets cancelled" position rather than promising an automatic
// refund that the system doesn't actually perform.
//
// Section 5 (Quick Sale / Door Sale) exists because those two features
// have NO refund route/service at all in the codebase (unlike ticket
// orders, which have POST /orders/:orderId/refund) — this section says so
// plainly rather than letting the policy read as if the same in-app
// refund flow covers them too.

const fr: LegalSection[] = [
  {
    id: 'ventes-finales',
    heading: '1. Principe général : ventes finales',
    bodyHtml: `<p>Sauf indication contraire de l'organisateur pour un événement précis, les ventes de billets sur Intahé sont finales. Cela reflète la pratique courante en billetterie d'événements : une fois un billet acheté, une place a été retenue pour toi et retirée de l'inventaire disponible.</p>`,
  },
  {
    id: 'evenement-annule',
    heading: '2. Si l’événement est annulé',
    bodyHtml: `<p>Si l'organisateur annule l'événement, il est responsable d'émettre les remboursements aux personnes ayant acheté un billet. Intahé fournit à l'organisateur les outils pour le faire (remboursement total ou partiel, directement via Stripe). Si un événement que tu as payé est annulé et que tu ne reçois pas de remboursement dans un délai raisonnable, écris-nous à support@syncerainc.com — nous allons contacter l'organisateur en ton nom.</p>`,
  },
  {
    id: 'evenement-reporte',
    heading: '3. Si l’événement est reporté',
    bodyHtml: `<p>Si l'organisateur reporte un événement à une date ultérieure, ton billet demeure valide pour la nouvelle date, sauf si l'organisateur choisit d'offrir des remboursements. Vérifie les communications de l'organisateur pour les détails propres à l'événement.</p>`,
  },
  {
    id: 'discretion-organisateur',
    heading: '4. Remboursements à la discrétion de l’organisateur',
    bodyHtml: `<p>Un organisateur peut choisir, à sa discrétion, d'offrir un remboursement total ou partiel même sans annulation (par exemple en cas d'erreur d'achat ou de situation exceptionnelle). Adresse-toi directement à l'organisateur de l'événement pour ce type de demande — c'est lui qui contrôle sa politique de vente, Intahé fournit seulement la plateforme et les outils de paiement.</p>`,
  },
  {
    id: 'vente-rapide-porte',
    heading: '5. Vente rapide et Vente à la porte',
    bodyHtml: `<p>Les achats faits via Vente rapide (produits/services à prix fixe, ex. une coupe de cheveux) ou Vente à la porte (billets achetés directement sur place avec un lecteur de carte) sont aussi des ventes finales. <strong>Contrairement aux billets achetés en ligne, Intahé n'offre pas encore d'outil de remboursement intégré à la plateforme pour ces deux types de vente</strong> — si un organisateur souhaite rembourser une telle vente, il doit le faire manuellement depuis son propre tableau de bord Stripe. Si tu as un problème avec un achat de ce type, contacte d'abord le commerçant/organisateur directement.</p>`,
  },
  {
    id: 'frais-service',
    heading: '6. Frais de service',
    bodyHtml: `<p>Lorsqu'un remboursement est accordé, le ou les frais Stripe déjà engagés sur la transaction originale ne sont généralement pas récupérables par Intahé ni par l'organisateur; ils peuvent donc ne pas être inclus dans le montant remboursé, selon ce que l'organisateur choisit.</p>`,
  },
  {
    id: 'erreurs-techniques',
    heading: '7. Erreurs techniques',
    bodyHtml: `<p>Si tu as été facturé deux fois pour le même billet, si le paiement a échoué mais que le montant a tout de même été débité, ou si tu rencontres tout autre problème technique lié à un paiement, écris-nous à support@syncerainc.com — ce type de situation est corrigé rapidement, peu importe la politique de vente de l'événement.</p>`,
  },
  {
    id: 'comment-demander',
    heading: '8. Comment demander un remboursement',
    bodyHtml: `<p>Pour toute demande liée à un événement, un achat Vente rapide ou une Vente à la porte, contacte d'abord l'organisateur ou le commerçant (ses coordonnées apparaissent généralement dans le courriel de confirmation de commande). Si tu ne parviens pas à le joindre ou si le problème concerne un enjeu technique de la plateforme plutôt que la vente elle-même, écris-nous à support@syncerainc.com.</p>`,
  },
  {
    id: 'modifications',
    heading: '9. Modifications',
    bodyHtml: `<p>Nous pouvons mettre à jour cette politique de temps à autre. La date de la dernière mise à jour est indiquée en haut de cette page.</p>`,
  },
];

const en: LegalSection[] = [
  {
    id: 'final-sales',
    heading: '1. General rule: sales are final',
    bodyHtml: `<p>Unless an organizer states otherwise for a specific event, ticket sales on Intahé are final. This reflects standard practice for event ticketing: once a ticket is purchased, a spot has been held for you and removed from available inventory.</p>`,
  },
  {
    id: 'event-cancelled',
    heading: '2. If the event is cancelled',
    bodyHtml: `<p>If the organizer cancels the event, they are responsible for issuing refunds to people who bought a ticket. Intahé gives the organizer the tools to do this (full or partial refund, directly through Stripe). If an event you paid for is cancelled and you don't receive a refund within a reasonable time, write to us at support@syncerainc.com — we'll follow up with the organizer on your behalf.</p>`,
  },
  {
    id: 'event-postponed',
    heading: '3. If the event is postponed',
    bodyHtml: `<p>If the organizer postpones an event to a later date, your ticket stays valid for the new date, unless the organizer chooses to offer refunds instead. Check the organizer's communications for event-specific details.</p>`,
  },
  {
    id: 'organizer-discretion',
    heading: '4. Refunds at the organizer’s discretion',
    bodyHtml: `<p>An organizer may choose, at their discretion, to offer a full or partial refund even without a cancellation (for example for a purchase mistake or an exceptional situation). Reach out to the event's organizer directly for this kind of request — they control their own sales policy, Intahé only provides the platform and payment tools.</p>`,
  },
  {
    id: 'quick-sale-door-sale',
    heading: '5. Quick Sale and Door Sale',
    bodyHtml: `<p>Purchases made through Quick Sale (fixed-price products/services, e.g. a haircut) or Door Sale (tickets bought on the spot with a card reader) are also final sales. <strong>Unlike tickets bought online, Intahé does not yet offer a built-in refund tool on the platform for these two sale types</strong> — if an organizer wants to refund one, they have to do it manually from their own Stripe dashboard. If you have an issue with this kind of purchase, contact the merchant/organizer directly first.</p>`,
  },
  {
    id: 'service-fees',
    heading: '6. Service fees',
    bodyHtml: `<p>When a refund is granted, the Stripe processing fees already incurred on the original transaction are generally not recoverable by Intahé or the organizer, and may therefore not be included in the refunded amount, depending on what the organizer decides.</p>`,
  },
  {
    id: 'technical-errors',
    heading: '7. Technical errors',
    bodyHtml: `<p>If you were charged twice for the same ticket, if a payment failed but you were still charged, or if you run into any other payment-related technical issue, write to us at support@syncerainc.com — this kind of issue gets fixed promptly, regardless of the event's sales policy.</p>`,
  },
  {
    id: 'how-to-request',
    heading: '8. How to request a refund',
    bodyHtml: `<p>For anything related to an event, a Quick Sale purchase, or a Door Sale, contact the organizer or merchant first (their contact details usually appear in your order confirmation email). If you can't reach them, or the issue is a platform-level technical problem rather than the sale itself, write to us at support@syncerainc.com.</p>`,
  },
  {
    id: 'changes',
    heading: '9. Changes',
    bodyHtml: `<p>We may update this policy from time to time. The date of the last update is shown at the top of this page.</p>`,
  },
];

const bodies: Record<Locale, LegalSection[]> = { fr, en };
const titles: Record<Locale, string> = { fr: 'Politique de remboursement', en: 'Refund policy' };

export function getRefundPolicy(locale: Locale): LegalDocument {
  const meta = LEGAL_DOCUMENT_VERSIONS.refund_policy;
  return {
    title: titles[locale],
    effectiveDate: meta.effectiveDate[locale],
    isDraft: false,
    sections: bodies[locale],
  };
}
