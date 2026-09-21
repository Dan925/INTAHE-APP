import type { Locale } from './i18n';

// Static legal content, same pattern as privacyContent.ts/refundContent.ts:
// authored directly, never interpolated with user-controlled data.
//
// UNLIKE privacyContent.ts/refundContent.ts, this document has NOT been
// reviewed by a lawyer yet — it's a first draft covering the gap flagged
// mid-conversation (an organizer/merchant agreement distinct from the
// buyer-facing privacy/refund policies): the payment-processing
// relationship (Stripe Connect direct charges — funds land in the
// organizer's own account, so chargeback/dispute liability sits with them,
// not Intahé), the commission structure, prohibited events, and account
// suspension. Get this reviewed the same way the other two were before
// treating it as final.

const fr = `
<h1>Conditions d'utilisation</h1>
<p class="text-secondary small">Dernière mise à jour : 21 septembre 2026 — <strong>brouillon, pas encore révisé par un avocat.</strong></p>

<h2>1. Acceptation</h2>
<p>En créant un compte ou en utilisant Intahé, tu acceptes ces conditions. Si tu utilises Intahé au nom d'une organisation, tu confirmes avoir l'autorité de l'engager.</p>

<h2>2. Ce qu'est Intahé</h2>
<p>Intahé est une plateforme de billetterie et de gestion d'événements qui fournit aux organisateurs les outils pour créer des événements, vendre des billets, encaisser des paiements (en ligne ou en personne via un lecteur de carte), et gérer leurs ventes. Intahé n'organise pas les événements elle-même et n'est pas partie à la relation entre un organisateur et les personnes qui achètent ses billets.</p>

<h2>3. Comptes</h2>
<p>Tu es responsable de garder ton mot de passe confidentiel et de toute activité sous ton compte. Avise-nous rapidement à support@syncerainc.com si tu soupçonnes un accès non autorisé.</p>

<h2>4. Rôle de processeur de paiement — organisateurs</h2>
<p>Les paiements pour tes événements (billets en ligne, Vente rapide, Vente à la porte) sont traités via Stripe Connect, directement dans ton propre compte Stripe connecté — pas dans un compte Intahé. Ça veut dire :</p>
<ul>
<li>L'argent des ventes t'appartient dès la transaction; Intahé ne détient jamais tes fonds.</li>
<li>Tu es responsable de fournir à Stripe les informations nécessaires pour vérifier ton identité et activer ton compte.</li>
<li><strong>Les litiges de carte (chargebacks) sont ta responsabilité</strong>, pas celle d'Intahé — Stripe les gère directement avec toi via ton compte connecté, puisque les fonds y sont passés directement.</li>
<li>Le versement de tes fonds suit le calendrier applicable à ton type de vente (48 heures après la fin d'un événement pour la billetterie; instantané pour Vente rapide et Vente à la porte), sous réserve des propres délais de traitement de Stripe.</li>
</ul>

<h2>5. Commission Intahé</h2>
<p>Intahé retient une commission de 3 % du prix de chaque billet ou article vendu, avec un minimum de 0,49 $ et un maximum de 4,99 $ par billet/article. Cette commission est prélevée automatiquement au moment de la transaction (voir la politique de remboursement pour ce qui se passe lors d'un remboursement). Les frais de traitement de carte de Stripe s'ajoutent séparément et ne reviennent pas à Intahé.</p>

<h2>6. Responsabilités de l'organisateur</h2>
<p>En tant qu'organisateur, tu es seul responsable de :</p>
<ul>
<li>La légalité, la sécurité et la bonne tenue de ton événement, y compris tout permis ou licence requis;</li>
<li>L'exactitude des informations que tu publies (description, prix, capacité, adresse);</li>
<li>Le respect de tes propres obligations fiscales sur les revenus générés;</li>
<li>Les remboursements dus à tes acheteurs, selon la politique de remboursement d'Intahé.</li>
</ul>

<h2>7. Utilisations interdites</h2>
<p>Tu ne peux pas utiliser Intahé pour un événement ou une vente illégale, frauduleuse, trompeuse, ou qui enfreint les droits d'un tiers. Intahé peut suspendre ou fermer un compte qui enfreint cette règle, avec ou sans préavis selon la gravité.</p>

<h2>8. Rôle limité d'Intahé</h2>
<p>Intahé fournit la plateforme et les outils — elle n'est pas responsable de la tenue, de la qualité, ou de l'annulation d'un événement organisé par un tiers. Dans la mesure permise par la loi applicable, Intahé n'est pas responsable des dommages indirects liés à l'utilisation de la plateforme.</p>

<h2>9. Résiliation</h2>
<p>Tu peux fermer ton compte en tout temps en nous écrivant à support@syncerainc.com. Intahé peut suspendre ou fermer un compte en cas de non-respect de ces conditions.</p>

<h2>10. Droit applicable</h2>
<p>Intahé sert des utilisateurs au Canada et aux États-Unis; le droit applicable à un litige donné dépend d'où tu te trouves. Pour toute question, écris-nous à support@syncerainc.com.</p>

<h2>11. Modifications</h2>
<p>Nous pouvons mettre à jour ces conditions de temps à autre. La date de la dernière mise à jour est indiquée en haut de cette page.</p>
`;

const en = `
<h1>Terms of Service</h1>
<p class="text-secondary small">Last updated: September 21, 2026 — <strong>draft, not yet reviewed by a lawyer.</strong></p>

<h2>1. Acceptance</h2>
<p>By creating an account or using Intahé, you agree to these terms. If you're using Intahé on behalf of an organization, you confirm you have the authority to bind it.</p>

<h2>2. What Intahé is</h2>
<p>Intahé is a ticketing and event management platform that gives organizers the tools to create events, sell tickets, take payment (online or in person via a card reader), and manage their sales. Intahé doesn't run events itself and isn't a party to the relationship between an organizer and the people who buy their tickets.</p>

<h2>3. Accounts</h2>
<p>You're responsible for keeping your password confidential and for all activity under your account. Let us know promptly at support@syncerainc.com if you suspect unauthorized access.</p>

<h2>4. Payment processing role — organizers</h2>
<p>Payments for your events (online tickets, Quick Sale, Door Sale) are processed via Stripe Connect, directly into your own connected Stripe account — not into an Intahé account. That means:</p>
<ul>
<li>Sale proceeds are yours from the moment of the transaction; Intahé never holds your funds.</li>
<li>You're responsible for giving Stripe the information it needs to verify your identity and activate your account.</li>
<li><strong>Card disputes (chargebacks) are your responsibility</strong>, not Intahé's — Stripe handles them directly with you through your connected account, since the funds passed through it directly.</li>
<li>Your funds are paid out on the schedule that applies to your sale type (48 hours after an event ends for ticketing; instant for Quick Sale and Door Sale), subject to Stripe's own processing timelines.</li>
</ul>

<h2>5. Intahé's commission</h2>
<p>Intahé takes a 3% commission on each ticket or item sold, with a minimum of $0.49 and a maximum of $4.99 per ticket/item. This commission is deducted automatically at the time of the transaction (see the refund policy for what happens on a refund). Stripe's own card processing fees are separate and do not go to Intahé.</p>

<h2>6. Organizer responsibilities</h2>
<p>As an organizer, you're solely responsible for:</p>
<ul>
<li>The legality, safety, and proper running of your event, including any required permits or licenses;</li>
<li>The accuracy of the information you publish (description, price, capacity, address);</li>
<li>Your own tax obligations on the revenue generated;</li>
<li>Refunds owed to your buyers, per Intahé's refund policy.</li>
</ul>

<h2>7. Prohibited uses</h2>
<p>You may not use Intahé for an event or sale that is illegal, fraudulent, deceptive, or that infringes someone else's rights. Intahé may suspend or close an account that violates this rule, with or without notice depending on severity.</p>

<h2>8. Intahé's limited role</h2>
<p>Intahé provides the platform and tools — it isn't responsible for the running, quality, or cancellation of an event organized by a third party. To the extent permitted by applicable law, Intahé isn't liable for indirect damages arising from use of the platform.</p>

<h2>9. Termination</h2>
<p>You can close your account at any time by writing to us at support@syncerainc.com. Intahé may suspend or close an account for violating these terms.</p>

<h2>10. Governing law</h2>
<p>Intahé serves users in both Canada and the United States; the law that applies to a given dispute depends on where you're located. For any question, write to us at support@syncerainc.com.</p>

<h2>11. Changes</h2>
<p>We may update these terms from time to time. The date of the last update is shown at the top of this page.</p>
`;

const versions: Record<Locale, string> = { fr, en };

export function termsOfServiceHtml(locale: Locale): string {
  return versions[locale];
}
