import type { Locale } from '../i18n';
import { LEGAL_DOCUMENT_VERSIONS } from '../../legal/registry';
import type { LegalDocument, LegalSection } from './types';

// Draft, not yet reviewed by a lawyer. Split out of the single 20-section
// "Terms of Service" draft (see git history for that version) into this
// general-audience Terms of Use plus organizerTerms.ts (merchant-specific
// obligations) and acceptableUse.ts (prohibited content/conduct) — part
// of the move to a modular legal framework where each document covers
// one audience/purpose instead of one long organizer-flavored document
// every buyer also had to agree to.
//
// The old section 4 claim that "card disputes (chargebacks) are your
// responsibility, not Intahé's" has been corrected and moved to
// organizerTerms.ts — it was not accurate. Stripe's own account
// configuration (controller.losses.payments: 'application', see
// stripeConnect.ts) makes Intahé, not the organizer, liable for a
// negative balance at the Stripe-account level even though the organizer
// fights the dispute itself through their own connected account. See
// organizerTerms.ts's payment-processing section for the corrected
// version (an indemnity for that shortfall, not a claim it's already
// contractually theirs at the Stripe level).

const fr: LegalSection[] = [
  {
    id: 'acceptation',
    heading: '1. Acceptation et admissibilité',
    bodyHtml: `<p>En créant un compte ou en utilisant Intahé, tu acceptes ces conditions. Tu dois avoir au moins l'âge de la majorité dans ta province ou ton État pour créer un compte. Si tu utilises Intahé au nom d'une organisation, tu confirmes avoir l'autorité de l'engager.</p>
<p>Si tu crées une organisation pour vendre des billets ou prendre des paiements, la <a href="/legal/organizer-terms">Convention d'organisateur</a> s'ajoute à ces conditions et s'applique à toi aussi — voir la section 13 ci-dessous.</p>`,
  },
  {
    id: 'ce-qu-est-intahe',
    heading: '2. Ce qu’est Intahé',
    bodyHtml: `<p>Intahé est une plateforme de billetterie et de gestion d'événements exploitée par Syncera Digital LLC, 1309 Coffeen Avenue, Ste 1200, Sheridan, WY 82801, États-Unis. Intahé fournit aux organisateurs les outils pour créer des événements, vendre des billets, encaisser des paiements (en ligne ou en personne via un lecteur de carte), et gérer leurs ventes. Intahé n'organise pas les événements elle-même et n'est pas partie à la relation entre un organisateur et les personnes qui achètent ses billets.</p>`,
  },
  {
    id: 'comptes',
    heading: '3. Comptes',
    bodyHtml: `<p>Tu es responsable de garder ton mot de passe confidentiel et de toute activité sous ton compte. Avise-nous rapidement à support@syncerainc.com si tu soupçonnes un accès non autorisé.</p>`,
  },
  {
    id: 'propriete-intellectuelle',
    heading: '4. Propriété intellectuelle d’Intahé',
    bodyHtml: `<p>Le logiciel, le nom, le logo et la marque Intahé nous appartiennent. Ces conditions ne te donnent aucun droit sur notre propriété intellectuelle au-delà de l'usage normal de la plateforme pendant que ton compte est actif.</p>`,
  },
  {
    id: 'usages-acceptables',
    heading: '5. Utilisation acceptable',
    bodyHtml: `<p>Ce que tu peux et ne peux pas faire sur Intahé — événements interdits, contenu interdit, marche à suivre pour signaler une atteinte à tes droits d'auteur — est décrit dans notre <a href="/legal/acceptable-use">Politique d'utilisation acceptable</a>, qui fait partie intégrante de ces conditions.</p>`,
  },
  {
    id: 'indemnisation',
    heading: '6. Indemnisation',
    bodyHtml: `<p>Tu acceptes de défendre et d'indemniser Intahé contre toute réclamation d'un tiers découlant de ton usage de la plateforme ou de ton non-respect de ces conditions — sauf dans la mesure où la réclamation découle de la négligence grave ou de la faute intentionnelle d'Intahé. Si tu es organisateur, des obligations d'indemnisation additionnelles, propres à l'exploitation d'un événement, s'appliquent — voir la <a href="/legal/organizer-terms">Convention d'organisateur</a>.</p>`,
  },
  {
    id: 'role-limite',
    heading: '7. Rôle limité d’Intahé et exclusion de garanties',
    bodyHtml: `<p>Intahé fournit la plateforme et les outils « tels quels » — elle n'est pas responsable de la tenue, de la qualité, ou de l'annulation d'un événement organisé par un tiers. Dans la mesure permise par la loi applicable, Intahé décline toute garantie implicite quant à la disponibilité continue ou sans erreur de la plateforme.</p>`,
  },
  {
    id: 'limitation-responsabilite',
    heading: '8. Limitation de responsabilité',
    bodyHtml: `<p>Dans la mesure permise par la loi applicable, la responsabilité totale d'Intahé envers toi pour toute réclamation liée à l'utilisation de la plateforme est limitée au montant des commissions que tu nous as payées au cours des 12 mois précédant la réclamation. Intahé n'est pas responsable des dommages indirects, accessoires ou consécutifs (perte de profits, de données, de réputation).</p>`,
  },
  {
    id: 'resiliation',
    heading: '9. Résiliation',
    bodyHtml: `<p>Tu peux fermer ton compte en tout temps en nous écrivant à support@syncerainc.com. Intahé peut suspendre ou fermer un compte en cas de non-respect de ces conditions, proportionnellement à la gravité du manquement.</p>`,
  },
  {
    id: 'resolution-differends',
    heading: '10. Résolution de différends',
    bodyHtml: `<p>Si un différend survient entre toi et Intahé, nous te demandons d'abord d'essayer de le régler à l'amiable en écrivant à support@syncerainc.com — la grande majorité des problèmes se règlent ainsi. Si ça ne fonctionne pas, la suite dépend d'où tu te trouves :</p>
<ul>
<li><strong>États-Unis :</strong> tout différend qui ne se règle pas à l'amiable sera tranché par arbitrage individuel exécutoire, siégeant au Wyoming, et non devant un tribunal ni par voie de recours collectif. Ni toi ni Intahé ne pouvez intenter une réclamation à titre de demandeur collectif ou de membre d'un recours collectif. Tu conserves le droit de porter une réclamation admissible devant les petites créances.</li>
<li><strong>Canada :</strong> le différend peut être porté devant les tribunaux compétents de ta province, et tu conserves le droit de te joindre à un recours collectif — l'arbitrage forcé combiné à une renonciation aux recours collectifs n'est pas exécutoire dans plusieurs provinces (notamment le Québec et l'Ontario) pour un contrat de consommation, donc cette section ne s'applique pas de la même façon qu'aux États-Unis.</li>
</ul>`,
  },
  {
    id: 'droit-applicable',
    heading: '11. Droit applicable',
    bodyHtml: `<p>Ces conditions sont régies par le droit de l'État du Wyoming, États-Unis, sans égard aux principes de conflits de lois — sauf que si tu es un consommateur au Canada, tu conserves toute protection qui ne peut être renoncée en vertu du droit de ta province, et cette section ne t'enlève pas ces protections.</p>
<p>Ces conditions ne prétendent pas non plus régir la relation entre Stripe et ton propre compte Stripe connecté — voir la <a href="/legal/organizer-terms">Convention d'organisateur</a>, section 2.</p>`,
  },
  {
    id: 'force-majeure',
    heading: '12. Force majeure',
    bodyHtml: `<p>Ni toi ni Intahé n'êtes responsables d'un manquement à ces conditions causé par un événement hors de contrôle raisonnable (catastrophe naturelle, panne majeure d'un fournisseur comme Stripe, etc.).</p>`,
  },
  {
    id: 'documents-connexes',
    heading: '13. Documents connexes',
    bodyHtml: `<p>Ces conditions font partie d'un ensemble de documents qui régissent ensemble ton utilisation d'Intahé, chacun couvrant un aspect distinct :</p>
<ul>
<li><a href="/legal/organizer-terms">Convention d'organisateur</a> — obligations propres à quiconque crée une organisation, vend des billets ou prend des paiements.</li>
<li><a href="/legal/refund-policy">Politique de remboursement</a> — ce qui se passe lors d'une annulation, d'un report, ou d'une demande de remboursement.</li>
<li><a href="/legal/privacy">Politique de confidentialité</a> — comment tes renseignements personnels sont traités.</li>
<li><a href="/legal/acceptable-use">Politique d'utilisation acceptable</a> — ce que tu peux et ne peux pas publier ou vendre sur Intahé.</li>
</ul>`,
  },
  {
    id: 'dispositions-generales',
    heading: '14. Dispositions générales',
    bodyHtml: `<p>Tu ne peux pas céder ces conditions sans notre accord écrit; nous pouvons céder les nôtres dans le cadre d'une fusion, acquisition ou vente d'actifs. Si une disposition de ces conditions est jugée invalide, le reste demeure en vigueur. Le fait de ne pas faire valoir une disposition ne constitue pas une renonciation à celle-ci.</p>`,
  },
  {
    id: 'modifications',
    heading: '15. Modifications',
    bodyHtml: `<p>Nous pouvons mettre à jour ces conditions de temps à autre. La date de la dernière mise à jour est indiquée en haut de cette page. Pour un changement important, nous ferons un effort raisonnable pour t'aviser (courriel ou avis sur la plateforme) avant son entrée en vigueur, et pourrions te demander d'accepter à nouveau la nouvelle version.</p>`,
  },
  {
    id: 'contact',
    heading: '16. Nous joindre',
    bodyHtml: `<p>Pour toute question sur ces conditions, écris-nous à support@syncerainc.com.</p>`,
  },
];

const en: LegalSection[] = [
  {
    id: 'acceptance',
    heading: '1. Acceptance and eligibility',
    bodyHtml: `<p>By creating an account or using Intahé, you agree to these terms. You must be at least the age of majority in your province or state to create an account. If you're using Intahé on behalf of an organization, you confirm you have the authority to bind it.</p>
<p>If you create an organization to sell tickets or take payment, the <a href="/legal/organizer-terms">Organizer Terms</a> apply to you as well, in addition to these terms — see section 13 below.</p>`,
  },
  {
    id: 'what-intahe-is',
    heading: '2. What Intahé is',
    bodyHtml: `<p>Intahé is a ticketing and event management platform operated by Syncera Digital LLC, 1309 Coffeen Avenue, Ste 1200, Sheridan, WY 82801, United States. Intahé gives organizers the tools to create events, sell tickets, take payment (online or in person via a card reader), and manage their sales. Intahé doesn't run events itself and isn't a party to the relationship between an organizer and the people who buy their tickets.</p>`,
  },
  {
    id: 'accounts',
    heading: '3. Accounts',
    bodyHtml: `<p>You're responsible for keeping your password confidential and for all activity under your account. Let us know promptly at support@syncerainc.com if you suspect unauthorized access.</p>`,
  },
  {
    id: 'intellectual-property',
    heading: '4. Intahé’s intellectual property',
    bodyHtml: `<p>The Intahé software, name, logo, and brand belong to us. These terms don't give you any rights to our intellectual property beyond normal use of the platform while your account is active.</p>`,
  },
  {
    id: 'acceptable-use',
    heading: '5. Acceptable use',
    bodyHtml: `<p>What you can and can't do on Intahé — prohibited events, prohibited content, how to report a copyright issue — is set out in our <a href="/legal/acceptable-use">Acceptable Use Policy</a>, which is part of these terms.</p>`,
  },
  {
    id: 'indemnification',
    heading: '6. Indemnification',
    bodyHtml: `<p>You agree to defend and indemnify Intahé against any third-party claim arising from your use of the platform or your violation of these terms — except to the extent the claim arises from Intahé's own gross negligence or willful misconduct. If you're an organizer, additional indemnification obligations specific to running an event apply — see the <a href="/legal/organizer-terms">Organizer Terms</a>.</p>`,
  },
  {
    id: 'limited-role',
    heading: '7. Intahé’s limited role and disclaimer of warranties',
    bodyHtml: `<p>Intahé provides the platform and tools "as is" — it isn't responsible for the running, quality, or cancellation of an event organized by a third party. To the extent permitted by applicable law, Intahé disclaims any implied warranty that the platform will be continuously available or error-free.</p>`,
  },
  {
    id: 'limitation-of-liability',
    heading: '8. Limitation of liability',
    bodyHtml: `<p>To the extent permitted by applicable law, Intahé's total liability to you for any claim arising from your use of the platform is limited to the amount of commissions you paid us in the 12 months preceding the claim. Intahé is not liable for indirect, incidental, or consequential damages (lost profits, data, or reputation).</p>`,
  },
  {
    id: 'termination',
    heading: '9. Termination',
    bodyHtml: `<p>You can close your account at any time by writing to us at support@syncerainc.com. Intahé may suspend or close an account for violating these terms, proportionate to the severity of the violation.</p>`,
  },
  {
    id: 'dispute-resolution',
    heading: '10. Dispute resolution',
    bodyHtml: `<p>If a dispute arises between you and Intahé, we ask that you first try to resolve it informally by writing to support@syncerainc.com — most issues get resolved this way. If that doesn't work, what happens next depends on where you're located:</p>
<ul>
<li><strong>United States:</strong> any dispute that isn't resolved informally will be settled by binding individual arbitration, seated in Wyoming, not in court and not as a class action. Neither you nor Intahé may bring a claim as a class representative or class member. You keep the right to bring an eligible claim in small claims court.</li>
<li><strong>Canada:</strong> the dispute can be brought before the competent courts of your province, and you keep the right to join a class action — mandatory arbitration combined with a class-action waiver is not enforceable in several provinces (notably Quebec and Ontario) for a consumer contract, so this section doesn't apply the same way it does in the United States.</li>
</ul>`,
  },
  {
    id: 'governing-law',
    heading: '11. Governing law',
    bodyHtml: `<p>These terms are governed by the law of the State of Wyoming, United States, without regard to conflict-of-law principles — except that if you're a consumer in Canada, you keep any protection that can't be waived under the law of your province, and this section doesn't take those protections away.</p>
<p>These terms also don't purport to govern the relationship between Stripe and your own connected Stripe account — see the <a href="/legal/organizer-terms">Organizer Terms</a>, section 2.</p>`,
  },
  {
    id: 'force-majeure',
    heading: '12. Force majeure',
    bodyHtml: `<p>Neither you nor Intahé is liable for a failure to meet these terms caused by an event beyond reasonable control (natural disaster, a major outage at a provider like Stripe, etc.).</p>`,
  },
  {
    id: 'related-documents',
    heading: '13. Related documents',
    bodyHtml: `<p>These terms are one of a set of documents that together govern your use of Intahé, each covering a distinct aspect:</p>
<ul>
<li><a href="/legal/organizer-terms">Organizer Terms</a> — obligations specific to anyone who creates an organization, sells tickets, or takes payment.</li>
<li><a href="/legal/refund-policy">Refund Policy</a> — what happens on a cancellation, postponement, or refund request.</li>
<li><a href="/legal/privacy">Privacy Policy</a> — how your personal information is handled.</li>
<li><a href="/legal/acceptable-use">Acceptable Use Policy</a> — what you can and can't publish or sell on Intahé.</li>
</ul>`,
  },
  {
    id: 'general-provisions',
    heading: '14. General provisions',
    bodyHtml: `<p>You may not assign these terms without our written consent; we may assign ours as part of a merger, acquisition, or sale of assets. If any provision of these terms is found invalid, the rest remains in effect. Failing to enforce a provision doesn't waive it.</p>`,
  },
  {
    id: 'changes',
    heading: '15. Changes',
    bodyHtml: `<p>We may update these terms from time to time. The date of the last update is shown at the top of this page. For a significant change, we'll make a reasonable effort to notify you (by email or an on-platform notice) before it takes effect, and may ask you to accept the new version again.</p>`,
  },
  {
    id: 'contact',
    heading: '16. Contact us',
    bodyHtml: `<p>For any question about these terms, write to us at support@syncerainc.com.</p>`,
  },
];

const bodies: Record<Locale, LegalSection[]> = { fr, en };
const titles: Record<Locale, string> = { fr: "Conditions d'utilisation", en: 'Terms of Use' };

export function getTermsOfUse(locale: Locale): LegalDocument {
  const meta = LEGAL_DOCUMENT_VERSIONS.terms_of_use;
  return {
    title: titles[locale],
    effectiveDate: meta.effectiveDate[locale],
    isDraft: true,
    sections: bodies[locale],
  };
}
