import type { Locale } from '../i18n';
import { LEGAL_DOCUMENT_VERSIONS } from '../../legal/registry';
import type { LegalDocument, LegalSection } from './types';

// Draft, not yet reviewed by a lawyer. Split out of the old single
// "Terms of Service" draft (see git history) into this organizer/merchant
// -specific document, distinct from the general-audience terms.ts.
//
// Section 2 (payment processing role) reflects the actual Stripe Connect
// architecture, verified directly against the code before writing this —
// see stripeConnect.ts, stripePayments.ts, stripeRefunds.ts:
//   - Direct charges: every PaymentIntent is created inside YOUR connected
//     account's own Stripe context, never on Intahé's platform account.
//   - controller.losses.payments: 'application' — Stripe requires the
//     PLATFORM (Intahé), not the organizer, to be liable for a negative
//     account balance (e.g. from a lost dispute with insufficient funds
//     to cover it). This is the one point the previous draft got wrong —
//     it claimed chargebacks were "your responsibility, not Intahé's,"
//     which isn't accurate at the Stripe-account level. The organizer
//     still fights the dispute directly through their own connected
//     account (the app has no dispute-handling UI of its own — disputes
//     aren't even in the webhook handler), but a lost dispute's shortfall
//     is collected from Intahé, not the organizer, unless this agreement
//     itself creates a reimbursement obligation — which section 2 now
//     does explicitly, rather than pretending the loss is already
//     contractually the organizer's at the Stripe level.
//   - payouts.schedule.interval: 'manual' — Intahé controls when money
//     actually leaves your connected account's balance (the automatic
//     Stripe payout schedule is disabled); you don't trigger your own
//     payout.
//   - application_fee_amount funds Intahé's commission; fees.payer:
//     'application' means Stripe's own processing fee is billed to
//     Intahé's balance, not yours — your balance keeps the full
//     subtotal (+ tax, if configured) minus only Intahé's commission.

const fr: LegalSection[] = [
  {
    id: 'application',
    heading: '1. Ce document s’applique à toi si...',
    bodyHtml: `<p>Cette Convention d'organisateur s'ajoute aux <a href="/legal/terms">Conditions d'utilisation</a> générales et s'applique dès que tu crées une organisation sur Intahé, que tu vendes ou non des billets payants. Les deux documents doivent être lus ensemble.</p>`,
  },
  {
    id: 'traitement-paiement',
    heading: '2. Rôle de processeur de paiement',
    bodyHtml: `<p>Les paiements pour tes événements (billets en ligne, Vente rapide, Vente à la porte) sont traités via Stripe Connect, directement dans ton propre compte Stripe connecté — jamais dans un compte Intahé. Concrètement :</p>
<ul>
<li>L'argent des ventes t'appartient dès la transaction; Intahé ne détient jamais tes fonds.</li>
<li>Tu es responsable de fournir à Stripe les informations nécessaires pour vérifier ton identité et activer ton compte.</li>
<li>Tu gères directement avec Stripe, dans ton propre compte connecté, tout litige de carte (chargeback) déposé contre une de tes transactions — Intahé n'a pas d'outil de gestion des litiges dans l'application.</li>
<li><strong>Si un litige perdu crée un solde négatif que Stripe ne peut pas prélever sur ton compte connecté, Stripe le prélève sur le compte d'Intahé plutôt que sur le tien</strong> — c'est une exigence de la configuration Stripe pour ce type de compte, pas un choix d'Intahé. En signant cette convention, tu acceptes de rembourser à Intahé tout montant qu'elle a dû ainsi absorber en raison d'un litige lié à tes propres ventes.</li>
<li>Intahé, et non toi, déclenche chaque versement vers ton compte bancaire — ton compte Stripe n'a pas de versement automatique. Le calendrier suit ton type de vente (48 heures après la fin d'un événement pour la billetterie; instantané pour Vente rapide et Vente à la porte), sous réserve des propres délais de traitement de Stripe.</li>
</ul>`,
  },
  {
    id: 'commission',
    heading: '3. Commission Intahé',
    bodyHtml: `<p>Intahé retient une commission de 3 % du prix de chaque billet ou article vendu, avec un minimum de 0,49 $ et un maximum de 4,99 $ par billet/article. Cette commission est prélevée automatiquement au moment de la transaction (voir la <a href="/legal/refund-policy">politique de remboursement</a> pour ce qui se passe lors d'un remboursement). Les frais de traitement de carte de Stripe s'ajoutent séparément et ne reviennent pas à Intahé. Si nous modifions cette grille, les événements déjà publiés au moment du changement conservent l'ancienne grille jusqu'à leur tenue; le nouveau taux s'applique aux événements créés après le changement.</p>`,
  },
  {
    id: 'lecteurs-carte',
    heading: '4. Lecteurs de carte et matériel physique',
    bodyHtml: `<p>Si tu connectes un lecteur de carte physique (via Bluetooth ou internet) à ton compte pour Vente rapide ou Vente à la porte, tu es responsable de son usage conforme aux lois applicables et aux conditions du fabricant. Intahé n'est pas responsable du matériel lui-même, de sa défectuosité, ou de sa perte.</p>`,
  },
  {
    id: 'responsabilites',
    heading: '5. Responsabilités de l’organisateur',
    bodyHtml: `<p>En tant qu'organisateur, tu es seul responsable de :</p>
<ul>
<li>La légalité, la sécurité et la bonne tenue de ton événement, y compris tout permis ou licence requis;</li>
<li>L'exactitude des informations que tu publies (description, prix, capacité, adresse);</li>
<li>Le respect de tes propres obligations fiscales sur les revenus générés, y compris toute inscription et perception de taxe de vente requise;</li>
<li>Les remboursements dus à tes acheteurs, selon la <a href="/legal/refund-policy">politique de remboursement</a> d'Intahé.</li>
</ul>`,
  },
  {
    id: 'ton-contenu',
    heading: '6. Ton contenu',
    bodyHtml: `<p>Tu conserves tous les droits sur le contenu que tu publies (description d'événement, photos, logo). En le publiant sur Intahé, tu nous donnes une licence non exclusive, mondiale et gratuite pour l'héberger, l'afficher et le distribuer dans le cadre du fonctionnement de la plateforme — par exemple sur la page publique de découverte d'événements, ou dans les aperçus générés lors d'un partage sur les réseaux sociaux. Tu confirmes détenir les droits nécessaires sur tout ce que tu publies, et que ce contenu respecte notre <a href="/legal/acceptable-use">Politique d'utilisation acceptable</a>.</p>`,
  },
  {
    id: 'indemnisation-organisateur',
    heading: '7. Indemnisation propre aux organisateurs',
    bodyHtml: `<p>En plus de l'indemnisation générale prévue aux Conditions d'utilisation, tu acceptes de défendre et d'indemniser Intahé contre toute réclamation d'un tiers découlant de ton événement ou de ton contenu, ainsi que de rembourser Intahé pour tout montant qu'elle a dû absorber en raison d'un litige de carte lié à tes ventes (voir section 2) — sauf dans la mesure où la réclamation découle de la négligence grave ou de la faute intentionnelle d'Intahé.</p>`,
  },
  {
    id: 'changements',
    heading: '8. Modifications',
    bodyHtml: `<p>Nous pouvons mettre à jour cette convention de temps à autre. La date de la dernière mise à jour est indiquée en haut de cette page. Pour un changement important, nous ferons un effort raisonnable pour t'aviser avant son entrée en vigueur, et pourrions te demander d'accepter à nouveau la nouvelle version avant de continuer à vendre sur Intahé.</p>`,
  },
  {
    id: 'contact',
    heading: '9. Nous joindre',
    bodyHtml: `<p>Pour toute question sur cette convention, écris-nous à support@syncerainc.com.</p>`,
  },
];

const en: LegalSection[] = [
  {
    id: 'who-this-applies-to',
    heading: '1. This document applies to you if...',
    bodyHtml: `<p>These Organizer Terms apply in addition to the general <a href="/legal/terms">Terms of Use</a>, as soon as you create an organization on Intahé — whether or not you sell paid tickets. Both documents should be read together.</p>`,
  },
  {
    id: 'payment-processing',
    heading: '2. Payment processing role',
    bodyHtml: `<p>Payments for your events (online tickets, Quick Sale, Door Sale) are processed via Stripe Connect, directly into your own connected Stripe account — never into an Intahé account. Concretely:</p>
<ul>
<li>Sale proceeds are yours from the moment of the transaction; Intahé never holds your funds.</li>
<li>You're responsible for giving Stripe the information it needs to verify your identity and activate your account.</li>
<li>You handle any card dispute (chargeback) filed against one of your transactions directly with Stripe, through your own connected account — Intahé has no dispute-management tooling in the app.</li>
<li><strong>If a lost dispute creates a negative balance Stripe can't collect from your connected account, Stripe collects it from Intahé's account instead</strong> — that's a requirement of Stripe's account configuration for this account type, not an Intahé choice. By agreeing to this document, you agree to reimburse Intahé for any amount it had to absorb this way because of a dispute tied to your own sales.</li>
<li>Intahé, not you, triggers every payout to your bank account — your Stripe account has no automatic payout. The schedule follows your sale type (48 hours after an event ends for ticketing; instant for Quick Sale and Door Sale), subject to Stripe's own processing timelines.</li>
</ul>`,
  },
  {
    id: 'commission',
    heading: '3. Intahé’s commission',
    bodyHtml: `<p>Intahé takes a 3% commission on each ticket or item sold, with a minimum of $0.49 and a maximum of $4.99 per ticket/item. This commission is deducted automatically at the time of the transaction (see the <a href="/legal/refund-policy">refund policy</a> for what happens on a refund). Stripe's own card processing fees are separate and do not go to Intahé. If we change this grid, events already published at the time of the change keep the old grid until they're held; the new rate applies to events created after the change.</p>`,
  },
  {
    id: 'card-readers',
    heading: '4. Card readers and physical hardware',
    bodyHtml: `<p>If you connect a physical card reader (via Bluetooth or internet) to your account for Quick Sale or Door Sale, you're responsible for using it in compliance with applicable law and the manufacturer's own terms. Intahé isn't responsible for the hardware itself, its defects, or its loss.</p>`,
  },
  {
    id: 'organizer-responsibilities',
    heading: '5. Organizer responsibilities',
    bodyHtml: `<p>As an organizer, you're solely responsible for:</p>
<ul>
<li>The legality, safety, and proper running of your event, including any required permits or licenses;</li>
<li>The accuracy of the information you publish (description, price, capacity, address);</li>
<li>Your own tax obligations on the revenue generated, including any required sales-tax registration and collection;</li>
<li>Refunds owed to your buyers, per Intahé's <a href="/legal/refund-policy">refund policy</a>.</li>
</ul>`,
  },
  {
    id: 'your-content',
    heading: '6. Your content',
    bodyHtml: `<p>You keep all rights to the content you publish (event description, photos, logo). By publishing it on Intahé, you give us a non-exclusive, worldwide, royalty-free license to host, display, and distribute it as part of operating the platform — for example on the public event-discovery page, or in the previews generated when an event is shared on social media. You confirm you hold whatever rights are needed for anything you publish, and that it complies with our <a href="/legal/acceptable-use">Acceptable Use Policy</a>.</p>`,
  },
  {
    id: 'organizer-indemnification',
    heading: '7. Organizer-specific indemnification',
    bodyHtml: `<p>In addition to the general indemnification in the Terms of Use, you agree to defend and indemnify Intahé against any third-party claim arising from your event or your content, and to reimburse Intahé for any amount it had to absorb because of a card dispute tied to your sales (see section 2) — except to the extent the claim arises from Intahé's own gross negligence or willful misconduct.</p>`,
  },
  {
    id: 'changes',
    heading: '8. Changes',
    bodyHtml: `<p>We may update this agreement from time to time. The date of the last update is shown at the top of this page. For a significant change, we'll make a reasonable effort to notify you before it takes effect, and may ask you to accept the new version again before continuing to sell on Intahé.</p>`,
  },
  {
    id: 'contact',
    heading: '9. Contact us',
    bodyHtml: `<p>For any question about this agreement, write to us at support@syncerainc.com.</p>`,
  },
];

const bodies: Record<Locale, LegalSection[]> = { fr, en };
const titles: Record<Locale, string> = { fr: "Convention d'organisateur", en: 'Organizer Terms' };

export function getOrganizerTerms(locale: Locale): LegalDocument {
  const meta = LEGAL_DOCUMENT_VERSIONS.organizer_terms;
  return {
    title: titles[locale],
    effectiveDate: meta.effectiveDate[locale],
    isDraft: true,
    sections: bodies[locale],
  };
}
