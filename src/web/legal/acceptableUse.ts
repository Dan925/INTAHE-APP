import type { Locale } from '../i18n';
import { LEGAL_DOCUMENT_VERSIONS } from '../../legal/registry';
import type { LegalDocument, LegalSection } from './types';

// New document — draft, not yet reviewed by a lawyer. Expanded out of
// what was a single "Prohibited uses" section in the old combined Terms
// of Service draft (see git history) into its own policy, referenced by
// both terms.ts and organizerTerms.ts rather than duplicated in each.

const fr: LegalSection[] = [
  {
    id: 'objet',
    heading: '1. Objet de cette politique',
    bodyHtml: `<p>Cette politique décrit ce que tu peux et ne peux pas faire sur Intahé, que tu sois acheteur ou organisateur. Elle fait partie intégrante des <a href="/legal/terms">Conditions d'utilisation</a> et de la <a href="/legal/organizer-terms">Convention d'organisateur</a>.</p>`,
  },
  {
    id: 'evenements-ventes-interdits',
    heading: '2. Événements et ventes interdits',
    bodyHtml: `<p>Tu ne peux pas utiliser Intahé pour créer un événement ou effectuer une vente qui :</p>
<ul>
<li>Est illégale dans la juridiction où l'événement a lieu ou où la vente est effectuée;</li>
<li>Est frauduleuse ou trompeuse (par exemple un événement qui n'aura jamais lieu, ou une description sciemment fausse);</li>
<li>Vend un produit ou service dont la vente est elle-même réglementée ou interdite (armes, substances contrôlées, contrefaçons);</li>
<li>Sert au blanchiment d'argent ou à toute autre activité financière illicite.</li>
</ul>`,
  },
  {
    id: 'contenu-interdit',
    heading: '3. Contenu interdit',
    bodyHtml: `<p>Le contenu que tu publies (description, photos, logo) ne peut pas :</p>
<ul>
<li>Enfreindre les droits d'un tiers, y compris le droit d'auteur, la marque de commerce, ou le droit à l'image;</li>
<li>Contenir de la haine, du harcèlement, ou de l'incitation à la violence envers une personne ou un groupe;</li>
<li>Être sexuellement explicite d'une manière non appropriée au contexte d'un événement public;</li>
<li>Usurper l'identité d'une autre personne ou organisation.</li>
</ul>`,
  },
  {
    id: 'conduite-interdite',
    heading: '4. Conduite interdite sur la plateforme',
    bodyHtml: `<p>Tu ne peux pas :</p>
<ul>
<li>Tenter de contourner les mesures de sécurité de la plateforme ou d'accéder à un compte qui n'est pas le tien;</li>
<li>Utiliser la plateforme pour harceler, menacer, ou nuire à un autre utilisateur;</li>
<li>Utiliser des moyens automatisés (robots, extraction de données) pour accéder à Intahé d'une manière qui en dégrade le fonctionnement pour les autres;</li>
<li>Revendre l'accès à la plateforme elle-même (par opposition à la revente légitime de billets par un organisateur).</li>
</ul>`,
  },
  {
    id: 'plaintes-droit-auteur',
    heading: '5. Plaintes en matière de droit d’auteur',
    bodyHtml: `<p>Si tu penses qu'un événement, une image, ou une description publiée sur Intahé enfreint tes droits d'auteur, écris-nous à support@syncerainc.com avec :</p>
<ul>
<li>Une description du contenu protégé et de l'endroit où il apparaît sur Intahé;</li>
<li>Ton nom et tes coordonnées;</li>
<li>Une déclaration de bonne foi que l'utilisation n'est pas autorisée.</li>
</ul>
<p>Nous allons enquêter et retirer le contenu si la plainte est fondée. <em>[Placeholder — un agent DMCA formellement désigné auprès du U.S. Copyright Office n'a pas encore été enregistré; cette section devra être mise à jour une fois que ce sera fait, pour bénéficier de la protection légale « safe harbor » complète.]</em></p>`,
  },
  {
    id: 'application',
    heading: '6. Application de cette politique',
    bodyHtml: `<p>Intahé peut retirer un événement, un contenu, ou suspendre/fermer un compte qui enfreint cette politique, avec ou sans préavis selon la gravité de l'enfreinte. Une enfreinte répétée ou grave peut mener à une fermeture définitive du compte.</p>`,
  },
  {
    id: 'modifications',
    heading: '7. Modifications',
    bodyHtml: `<p>Nous pouvons mettre à jour cette politique de temps à autre. La date de la dernière mise à jour est indiquée en haut de cette page.</p>`,
  },
  {
    id: 'contact',
    heading: '8. Nous joindre',
    bodyHtml: `<p>Pour signaler un contenu qui enfreint cette politique, écris-nous à support@syncerainc.com.</p>`,
  },
];

const en: LegalSection[] = [
  {
    id: 'purpose',
    heading: '1. Purpose of this policy',
    bodyHtml: `<p>This policy describes what you can and can't do on Intahé, whether you're a buyer or an organizer. It's part of both the <a href="/legal/terms">Terms of Use</a> and the <a href="/legal/organizer-terms">Organizer Terms</a>.</p>`,
  },
  {
    id: 'prohibited-events-sales',
    heading: '2. Prohibited events and sales',
    bodyHtml: `<p>You may not use Intahé to create an event or make a sale that:</p>
<ul>
<li>Is illegal in the jurisdiction where the event takes place or the sale is made;</li>
<li>Is fraudulent or deceptive (for example an event that will never happen, or a knowingly false description);</li>
<li>Sells a product or service whose sale is itself regulated or prohibited (weapons, controlled substances, counterfeit goods);</li>
<li>Is used for money laundering or any other unlawful financial activity.</li>
</ul>`,
  },
  {
    id: 'prohibited-content',
    heading: '3. Prohibited content',
    bodyHtml: `<p>Content you publish (description, photos, logo) may not:</p>
<ul>
<li>Infringe a third party's rights, including copyright, trademark, or right of publicity;</li>
<li>Contain hate, harassment, or incitement to violence against a person or group;</li>
<li>Be sexually explicit in a way that isn't appropriate to a public-event context;</li>
<li>Impersonate another person or organization.</li>
</ul>`,
  },
  {
    id: 'prohibited-conduct',
    heading: '4. Prohibited conduct on the platform',
    bodyHtml: `<p>You may not:</p>
<ul>
<li>Attempt to bypass the platform's security measures or access an account that isn't yours;</li>
<li>Use the platform to harass, threaten, or harm another user;</li>
<li>Use automated means (bots, scraping) to access Intahé in a way that degrades it for others;</li>
<li>Resell access to the platform itself (as opposed to an organizer's legitimate resale of tickets).</li>
</ul>`,
  },
  {
    id: 'copyright-complaints',
    heading: '5. Copyright complaints',
    bodyHtml: `<p>If you believe an event, image, or description published on Intahé infringes your copyright, write to us at support@syncerainc.com with:</p>
<ul>
<li>A description of the protected content and where it appears on Intahé;</li>
<li>Your name and contact information;</li>
<li>A good-faith statement that the use is not authorized.</li>
</ul>
<p>We'll investigate and remove the content if the complaint is valid. <em>[Placeholder — a DMCA agent has not yet been formally registered with the U.S. Copyright Office; this section will need updating once that's done, to get the full "safe harbor" legal protection.]</em></p>`,
  },
  {
    id: 'enforcement',
    heading: '6. Enforcement',
    bodyHtml: `<p>Intahé may remove an event, remove content, or suspend/close an account that violates this policy, with or without notice depending on severity. A repeated or serious violation can lead to permanent account closure.</p>`,
  },
  {
    id: 'changes',
    heading: '7. Changes',
    bodyHtml: `<p>We may update this policy from time to time. The date of the last update is shown at the top of this page.</p>`,
  },
  {
    id: 'contact',
    heading: '8. Contact us',
    bodyHtml: `<p>To report content that violates this policy, write to us at support@syncerainc.com.</p>`,
  },
];

const bodies: Record<Locale, LegalSection[]> = { fr, en };
const titles: Record<Locale, string> = { fr: "Politique d'utilisation acceptable", en: 'Acceptable Use Policy' };

export function getAcceptableUse(locale: Locale): LegalDocument {
  const meta = LEGAL_DOCUMENT_VERSIONS.acceptable_use;
  return {
    title: titles[locale],
    effectiveDate: meta.effectiveDate[locale],
    isDraft: true,
    sections: bodies[locale],
  };
}
