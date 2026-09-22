import type { Locale } from './i18n';

// Static legal content, same pattern as privacyContent.ts/refundContent.ts:
// authored directly, never interpolated with user-controlled data.
//
// UNLIKE privacyContent.ts/refundContent.ts, this document has NOT been
// reviewed by a lawyer yet — it's a draft covering the gap flagged
// mid-conversation (an organizer/merchant agreement distinct from the
// buyer-facing privacy/refund policies). Structure benchmarked against
// Eventbrite's own Terms of Service (content license, IP ownership,
// indemnification, liability cap, force majeure, standard boilerplate).
//
// Dispute resolution (section 15) is deliberately split by user location
// rather than a single blanket clause: forced arbitration + a
// class-action waiver for US users (per explicit instruction), but normal
// courts + class-action rights preserved for Canadian users — several
// provinces (notably Quebec and Ontario) void that combination outright
// for a consumer contract, and Syncera Digital LLC being a Wyoming entity
// doesn't change that: a US company can't use its own choice-of-law
// clause to strip a Canadian consumer of protections that are
// non-waivable under their province's law (see section 16's carve-out).
// A lawyer still needs to confirm the exact arbitration-body/rules
// language before this is final.

const fr = `
<h1>Conditions d'utilisation</h1>
<p class="text-secondary small">Dernière mise à jour : 22 septembre 2026 — <strong>brouillon, pas encore révisé par un avocat.</strong></p>

<h2>1. Acceptation et admissibilité</h2>
<p>En créant un compte ou en utilisant Intahé, tu acceptes ces conditions. Tu dois avoir au moins l'âge de la majorité dans ta province ou ton État pour créer un compte. Si tu utilises Intahé au nom d'une organisation, tu confirmes avoir l'autorité de l'engager.</p>

<h2>2. Ce qu'est Intahé</h2>
<p>Intahé est une plateforme de billetterie et de gestion d'événements exploitée par Syncera Digital LLC, 1309 Coffeen Avenue, Ste 1200, Sheridan, WY 82801, États-Unis. Intahé fournit aux organisateurs les outils pour créer des événements, vendre des billets, encaisser des paiements (en ligne ou en personne via un lecteur de carte), et gérer leurs ventes. Intahé n'organise pas les événements elle-même et n'est pas partie à la relation entre un organisateur et les personnes qui achètent ses billets.</p>

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
<p>Intahé retient une commission de 3 % du prix de chaque billet ou article vendu, avec un minimum de 0,49 $ et un maximum de 4,99 $ par billet/article. Cette commission est prélevée automatiquement au moment de la transaction (voir la politique de remboursement pour ce qui se passe lors d'un remboursement). Les frais de traitement de carte de Stripe s'ajoutent séparément et ne reviennent pas à Intahé. Si nous modifions cette grille, les événements déjà publiés au moment du changement conservent l'ancienne grille jusqu'à leur tenue; le nouveau taux s'applique aux événements créés après le changement.</p>

<h2>6. Lecteurs de carte et matériel physique</h2>
<p>Si tu connectes un lecteur de carte physique (via Bluetooth ou internet) à ton compte pour Vente rapide ou Vente à la porte, tu es responsable de son usage conforme aux lois applicables et aux conditions du fabricant. Intahé n'est pas responsable du matériel lui-même, de sa défectuosité, ou de sa perte.</p>

<h2>7. Responsabilités de l'organisateur</h2>
<p>En tant qu'organisateur, tu es seul responsable de :</p>
<ul>
<li>La légalité, la sécurité et la bonne tenue de ton événement, y compris tout permis ou licence requis;</li>
<li>L'exactitude des informations que tu publies (description, prix, capacité, adresse);</li>
<li>Le respect de tes propres obligations fiscales sur les revenus générés;</li>
<li>Les remboursements dus à tes acheteurs, selon la politique de remboursement d'Intahé.</li>
</ul>

<h2>8. Ton contenu</h2>
<p>Tu conserves tous les droits sur le contenu que tu publies (description d'événement, photos, logo). En le publiant sur Intahé, tu nous donnes une licence non exclusive, mondiale et gratuite pour l'héberger, l'afficher et le distribuer dans le cadre du fonctionnement de la plateforme — par exemple sur la page publique de découverte d'événements, ou dans les aperçus générés lors d'un partage sur les réseaux sociaux. Tu confirmes détenir les droits nécessaires sur tout ce que tu publies.</p>

<h2>9. Propriété intellectuelle d'Intahé</h2>
<p>Le logiciel, le nom, le logo et la marque Intahé nous appartiennent. Ces conditions ne te donnent aucun droit sur notre propriété intellectuelle au-delà de l'usage normal de la plateforme pendant que ton compte est actif.</p>

<h2>10. Utilisations interdites</h2>
<p>Tu ne peux pas utiliser Intahé pour un événement ou une vente illégale, frauduleuse, trompeuse, ou qui enfreint les droits d'un tiers (y compris les droits d'auteur sur du contenu publié sans autorisation). Si tu penses qu'un événement publié sur Intahé enfreint tes droits d'auteur, écris-nous à support@syncerainc.com avec les détails; nous allons enquêter et retirer le contenu si la plainte est fondée. Intahé peut suspendre ou fermer un compte qui enfreint cette règle, avec ou sans préavis selon la gravité.</p>

<h2>11. Rôle limité d'Intahé et exclusion de garanties</h2>
<p>Intahé fournit la plateforme et les outils « tels quels » — elle n'est pas responsable de la tenue, de la qualité, ou de l'annulation d'un événement organisé par un tiers. Dans la mesure permise par la loi applicable, Intahé décline toute garantie implicite quant à la disponibilité continue ou sans erreur de la plateforme.</p>

<h2>12. Limitation de responsabilité</h2>
<p>Dans la mesure permise par la loi applicable, la responsabilité totale d'Intahé envers toi pour toute réclamation liée à l'utilisation de la plateforme est limitée au montant des commissions que tu nous as payées au cours des 12 mois précédant la réclamation. Intahé n'est pas responsable des dommages indirects, accessoires ou consécutifs (perte de profits, de données, de réputation).</p>

<h2>13. Indemnisation</h2>
<p>Tu acceptes de défendre et d'indemniser Intahé contre toute réclamation d'un tiers découlant de ton événement, de ton contenu, ou de ton non-respect de ces conditions — sauf dans la mesure où la réclamation découle de la négligence grave ou de la faute intentionnelle d'Intahé. De notre côté, nous t'indemniserons pour toute réclamation découlant directement de notre propre négligence grave dans l'exploitation de la plateforme.</p>

<h2>14. Résiliation</h2>
<p>Tu peux fermer ton compte en tout temps en nous écrivant à support@syncerainc.com. Intahé peut suspendre ou fermer un compte en cas de non-respect de ces conditions, proportionnellement à la gravité du manquement.</p>

<h2>15. Résolution de différends</h2>
<p>Si un différend survient entre toi et Intahé, nous te demandons d'abord d'essayer de le régler à l'amiable en écrivant à support@syncerainc.com — la grande majorité des problèmes se règlent ainsi. Si ça ne fonctionne pas, la suite dépend d'où tu te trouves :</p>
<ul>
<li><strong>États-Unis :</strong> tout différend qui ne se règle pas à l'amiable sera tranché par arbitrage individuel exécutoire, siégeant au Wyoming, et non devant un tribunal ni par voie de recours collectif. Ni toi ni Intahé ne pouvez intenter une réclamation à titre de demandeur collectif ou de membre d'un recours collectif. Tu conserves le droit de porter une réclamation admissible devant les petites créances.</li>
<li><strong>Canada :</strong> le différend peut être porté devant les tribunaux compétents de ta province, et tu conserves le droit de te joindre à un recours collectif — l'arbitrage forcé combiné à une renonciation aux recours collectifs n'est pas exécutoire dans plusieurs provinces (notamment le Québec et l'Ontario) pour un contrat de consommation, donc cette section ne s'applique pas de la même façon qu'aux États-Unis.</li>
</ul>

<h2>16. Droit applicable</h2>
<p>Ces conditions sont régies par le droit de l'État du Wyoming, États-Unis, sans égard aux principes de conflits de lois — sauf que si tu es un consommateur au Canada, tu conserves toute protection qui ne peut être renoncée en vertu du droit de ta province, et cette section ne t'enlève pas ces protections.</p>

<h2>17. Force majeure</h2>
<p>Ni toi ni Intahé n'êtes responsables d'un manquement à ces conditions causé par un événement hors de contrôle raisonnable (catastrophe naturelle, panne majeure d'un fournisseur comme Stripe, etc.).</p>

<h2>18. Dispositions générales</h2>
<p>Tu ne peux pas céder ces conditions sans notre accord écrit; nous pouvons céder les nôtres dans le cadre d'une fusion, acquisition ou vente d'actifs. Si une disposition de ces conditions est jugée invalide, le reste demeure en vigueur. Le fait de ne pas faire valoir une disposition ne constitue pas une renonciation à celle-ci.</p>

<h2>19. Modifications</h2>
<p>Nous pouvons mettre à jour ces conditions de temps à autre. La date de la dernière mise à jour est indiquée en haut de cette page. Pour un changement important, nous ferons un effort raisonnable pour t'aviser (courriel ou avis sur la plateforme) avant son entrée en vigueur.</p>

<h2>20. Nous joindre</h2>
<p>Pour toute question sur ces conditions, écris-nous à support@syncerainc.com.</p>
`;

const en = `
<h1>Terms of Service</h1>
<p class="text-secondary small">Last updated: September 22, 2026 — <strong>draft, not yet reviewed by a lawyer.</strong></p>

<h2>1. Acceptance and eligibility</h2>
<p>By creating an account or using Intahé, you agree to these terms. You must be at least the age of majority in your province or state to create an account. If you're using Intahé on behalf of an organization, you confirm you have the authority to bind it.</p>

<h2>2. What Intahé is</h2>
<p>Intahé is a ticketing and event management platform operated by Syncera Digital LLC, 1309 Coffeen Avenue, Ste 1200, Sheridan, WY 82801, United States. Intahé gives organizers the tools to create events, sell tickets, take payment (online or in person via a card reader), and manage their sales. Intahé doesn't run events itself and isn't a party to the relationship between an organizer and the people who buy their tickets.</p>

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
<p>Intahé takes a 3% commission on each ticket or item sold, with a minimum of $0.49 and a maximum of $4.99 per ticket/item. This commission is deducted automatically at the time of the transaction (see the refund policy for what happens on a refund). Stripe's own card processing fees are separate and do not go to Intahé. If we change this grid, events already published at the time of the change keep the old grid until they're held; the new rate applies to events created after the change.</p>

<h2>6. Card readers and physical hardware</h2>
<p>If you connect a physical card reader (via Bluetooth or internet) to your account for Quick Sale or Door Sale, you're responsible for using it in compliance with applicable law and the manufacturer's own terms. Intahé isn't responsible for the hardware itself, its defects, or its loss.</p>

<h2>7. Organizer responsibilities</h2>
<p>As an organizer, you're solely responsible for:</p>
<ul>
<li>The legality, safety, and proper running of your event, including any required permits or licenses;</li>
<li>The accuracy of the information you publish (description, price, capacity, address);</li>
<li>Your own tax obligations on the revenue generated;</li>
<li>Refunds owed to your buyers, per Intahé's refund policy.</li>
</ul>

<h2>8. Your content</h2>
<p>You keep all rights to the content you publish (event description, photos, logo). By publishing it on Intahé, you give us a non-exclusive, worldwide, royalty-free license to host, display, and distribute it as part of operating the platform — for example on the public event-discovery page, or in the previews generated when an event is shared on social media. You confirm you hold whatever rights are needed for anything you publish.</p>

<h2>9. Intahé's intellectual property</h2>
<p>The Intahé software, name, logo, and brand belong to us. These terms don't give you any rights to our intellectual property beyond normal use of the platform while your account is active.</p>

<h2>10. Prohibited uses</h2>
<p>You may not use Intahé for an event or sale that is illegal, fraudulent, deceptive, or that infringes someone else's rights (including copyright in content published without authorization). If you believe an event published on Intahé infringes your copyright, write to us at support@syncerainc.com with the details; we'll investigate and remove the content if the complaint is valid. Intahé may suspend or close an account that violates this rule, with or without notice depending on severity.</p>

<h2>11. Intahé's limited role and disclaimer of warranties</h2>
<p>Intahé provides the platform and tools "as is" — it isn't responsible for the running, quality, or cancellation of an event organized by a third party. To the extent permitted by applicable law, Intahé disclaims any implied warranty that the platform will be continuously available or error-free.</p>

<h2>12. Limitation of liability</h2>
<p>To the extent permitted by applicable law, Intahé's total liability to you for any claim arising from your use of the platform is limited to the amount of commissions you paid us in the 12 months preceding the claim. Intahé is not liable for indirect, incidental, or consequential damages (lost profits, data, or reputation).</p>

<h2>13. Indemnification</h2>
<p>You agree to defend and indemnify Intahé against any third-party claim arising from your event, your content, or your violation of these terms — except to the extent the claim arises from Intahé's own gross negligence or willful misconduct. In turn, we'll indemnify you for any claim arising directly from our own gross negligence in operating the platform.</p>

<h2>14. Termination</h2>
<p>You can close your account at any time by writing to us at support@syncerainc.com. Intahé may suspend or close an account for violating these terms, proportionate to the severity of the violation.</p>

<h2>15. Dispute resolution</h2>
<p>If a dispute arises between you and Intahé, we ask that you first try to resolve it informally by writing to support@syncerainc.com — most issues get resolved this way. If that doesn't work, what happens next depends on where you're located:</p>
<ul>
<li><strong>United States:</strong> any dispute that isn't resolved informally will be settled by binding individual arbitration, seated in Wyoming, not in court and not as a class action. Neither you nor Intahé may bring a claim as a class representative or class member. You keep the right to bring an eligible claim in small claims court.</li>
<li><strong>Canada:</strong> the dispute can be brought before the competent courts of your province, and you keep the right to join a class action — mandatory arbitration combined with a class-action waiver is not enforceable in several provinces (notably Quebec and Ontario) for a consumer contract, so this section doesn't apply the same way it does in the United States.</li>
</ul>

<h2>16. Governing law</h2>
<p>These terms are governed by the law of the State of Wyoming, United States, without regard to conflict-of-law principles — except that if you're a consumer in Canada, you keep any protection that can't be waived under the law of your province, and this section doesn't take those protections away.</p>

<h2>17. Force majeure</h2>
<p>Neither you nor Intahé is liable for a failure to meet these terms caused by an event beyond reasonable control (natural disaster, a major outage at a provider like Stripe, etc.).</p>

<h2>18. General provisions</h2>
<p>You may not assign these terms without our written consent; we may assign ours as part of a merger, acquisition, or sale of assets. If any provision of these terms is found invalid, the rest remains in effect. Failing to enforce a provision doesn't waive it.</p>

<h2>19. Changes</h2>
<p>We may update these terms from time to time. The date of the last update is shown at the top of this page. For a significant change, we'll make a reasonable effort to notify you (by email or an on-platform notice) before it takes effect.</p>

<h2>20. Contact us</h2>
<p>For any question about these terms, write to us at support@syncerainc.com.</p>
`;

const versions: Record<Locale, string> = { fr, en };

export function termsOfServiceHtml(locale: Locale): string {
  return versions[locale];
}
