import type { Locale } from './i18n';

// Static legal content — authored directly, never interpolated with
// user-controlled data, so no escaping concerns here (unlike the other
// pages in src/web/, which fetch everything client-side for that reason).
//
// DRAFT ONLY: written to accurately reflect what the app's code actually
// does with personal information, not reviewed by a lawyer. Covers both
// Canada (PIPEDA federally, Loi 25 specifically for Quebec residents) and
// the United States (CCPA/CPRA specifically for California residents) at
// a general level — it does not attempt to enumerate every US state's
// privacy law, which is a real patchwork; a lawyer needs to confirm
// what's actually required once the go-to-market states/provinces are
// locked down. Fields marked [À COMPLÉTER]/[TO COMPLETE] must be filled
// in before publishing. The English version is a translation of the
// French draft, not an independently reviewed text — keep them in sync
// by hand if either changes.

const fr = `
<h1>Politique de confidentialité</h1>
<p class="text-secondary small">Dernière mise à jour : 20 août 2026</p>

<p><strong>Brouillon — non révisé par un avocat.</strong> Ce document décrit fidèlement ce que l'application Intahe fait réellement avec les renseignements personnels, mais n'a pas encore été révisé par un professionnel du droit de la protection des renseignements personnels. Comme Intahe sert des utilisateurs au Canada et aux États-Unis, plusieurs cadres légaux différents peuvent s'appliquer selon où tu habites (voir section 7) — ce brouillon vise à respecter l'esprit des principaux d'entre eux, mais ne remplace pas une révision juridique propre à chaque marché où l'app est réellement offerte. Les sections marquées [À COMPLÉTER] doivent être remplies avant publication officielle.</p>

<h2>1. Qui nous sommes</h2>
<p>Intahe (« nous », « notre ») est une plateforme de billetterie et de gestion d'événements. Le responsable du traitement des renseignements personnels décrits ci-dessous est :</p>
<p>[À COMPLÉTER — raison sociale de l'entreprise]<br/>
[À COMPLÉTER — adresse]<br/>
[À COMPLÉTER — courriel de contact général]</p>

<h2>2. Renseignements personnels que nous recueillons</h2>
<p>Nous recueillons uniquement ce qui est nécessaire au fonctionnement du service :</p>
<ul>
  <li><strong>Compte utilisateur :</strong> nom complet, adresse courriel, mot de passe (jamais stocké en clair — seul un hachage cryptographique irréversible est conservé), ou identifiant Google si tu te connectes avec Google.</li>
  <li><strong>Achat de billets :</strong> l'adresse courriel de l'acheteur (nécessaire pour envoyer la confirmation et les billets), même sans compte.</li>
  <li><strong>Paiement :</strong> nous ne recevons et ne stockons <strong>jamais</strong> ton numéro de carte ni tes renseignements bancaires complets. Le paiement est traité entièrement par Stripe, notre fournisseur de traitement de paiement; nous recevons seulement la confirmation que le paiement a réussi.</li>
  <li><strong>Organisations et événements :</strong> pour les organisateurs — nom de l'organisation, nom et description de l'événement, adresse et coordonnées géographiques de l'événement (si fournies).</li>
  <li><strong>Position géographique :</strong> uniquement si tu l'autorises explicitement, pour te montrer les événements à proximité ou pour situer un événement que tu crées. Optionnel — refuser n'empêche pas d'utiliser l'application.</li>
  <li><strong>Renseignements techniques :</strong> aucune analyse de comportement ni témoin (cookie) de suivi publicitaire n'est utilisé. Seules les données strictement nécessaires au fonctionnement (ex. : jeton de connexion) sont conservées sur ton appareil.</li>
</ul>

<h2>3. Pourquoi nous recueillons ces renseignements</h2>
<ul>
  <li>Créer et gérer ton compte, t'authentifier</li>
  <li>Traiter tes commandes de billets et générer tes billets (codes QR)</li>
  <li>Permettre aux organisateurs de gérer leurs événements et d'accueillir leurs invités (validation des billets à l'entrée)</li>
  <li>T'envoyer les communications nécessaires au service (confirmation de commande, réinitialisation de mot de passe)</li>
  <li>Te montrer les événements publics à proximité, si tu utilises cette fonctionnalité</li>
  <li>Détecter et prévenir la fraude</li>
</ul>
<p>Nous n'utilisons jamais tes renseignements personnels à des fins de marketing tiers, et nous ne les <strong>vendons</strong> ni ne les <strong>louons</strong> à personne — y compris au sens large que certaines lois américaines (comme le CCPA) donnent au mot « vente ».</p>

<h2>4. Avec qui nous partageons ces renseignements</h2>
<p>Nous faisons appel à des fournisseurs de services tiers pour opérer la plateforme, chacun n'ayant accès qu'à ce dont il a besoin pour sa tâche :</p>
<ul>
  <li><strong>Stripe</strong> (traitement des paiements) — reçoit les renseignements nécessaires au paiement.</li>
  <li><strong>Resend</strong> (envoi de courriels transactionnels) — reçoit ton adresse courriel pour te livrer les confirmations et réinitialisations de mot de passe.</li>
  <li><strong>Google</strong> — uniquement si tu choisis de te connecter avec un compte Google.</li>
  <li><strong>Render</strong> (hébergement infonuagique de nos serveurs et bases de données).</li>
  <li><strong>L'organisateur d'un événement auquel tu achètes un billet</strong> — voit ton adresse courriel et le statut de ton billet, dans la mesure nécessaire pour gérer son événement (liste des invités, validation à l'entrée).</li>
</ul>
<p>Nous ne partageons aucun renseignement personnel à des fins publicitaires.</p>

<h2>5. Où sont hébergées les données</h2>
<p>Nos serveurs et bases de données sont hébergés chez Render, aux États-Unis (Oregon). Si tu résides au Canada, cela signifie que tes renseignements personnels sont traités et conservés à l'extérieur du pays. [À COMPLÉTER — confirmer qu'une évaluation des facteurs relatifs à la vie privée (EFVP) a été complétée pour ce transfert hors Québec, tel que requis par la Loi 25 pour les résidents du Québec, et résumer ici les mesures de protection contractuelles en place avec Render.]</p>

<h2>6. Combien de temps nous conservons tes renseignements</h2>
<p>Les renseignements de ton compte (nom, courriel, mot de passe, position géographique fournie) sont conservés tant que ton compte est actif. Si tu supprimes ton compte, ces renseignements personnels sont effacés immédiatement de notre base de données active. L'historique de tes commandes et billets est conservé séparément pendant 7 ans après la transaction, à des fins de comptabilité et d'obligations fiscales — même après la suppression de ton compte, cet historique demeure visible aux organisateurs concernés. Comme pour la plupart des services infonuagiques, tes renseignements peuvent aussi subsister temporairement (jusqu'à 30 jours) dans nos copies de sauvegarde de routine après une suppression, le temps que le cycle normal de sauvegarde les remplace.</p>

<h2>7. Tes droits selon où tu habites</h2>
<p>Intahe sert des utilisateurs au Canada et aux États-Unis; les droits ci-dessous varient selon ta province, ton État, et la loi qui s'applique à toi. En général, tu peux :</p>
<ul>
  <li>Accéder aux renseignements personnels que nous détenons à ton sujet</li>
  <li>Faire corriger un renseignement inexact ou incomplet</li>
  <li>Demander la suppression de ton compte et des renseignements associés, sous réserve des obligations légales de conservation (ex. : registres fiscaux)</li>
  <li>Obtenir une copie de tes renseignements dans un format structuré et couramment utilisé (portabilité)</li>
  <li>Retirer ton consentement à certains traitements, lorsque applicable</li>
</ul>
<p><strong>Canada :</strong> la Loi sur la protection des renseignements personnels et les documents électroniques (LPRPDE) encadre ces droits au niveau fédéral. Si tu résides au Québec, la Loi 25 s'applique en plus et te donne des droits et recours additionnels, y compris auprès de la Commission d'accès à l'information du Québec (voir section 11).</p>
<p><strong>États-Unis :</strong> si tu résides en Californie, le California Consumer Privacy Act (CCPA/CPRA) te donne le droit de savoir quels renseignements sont recueillis, de les faire supprimer, et de refuser leur « vente » ou leur « partage » (nous ne vendons ni ne partageons de renseignements personnels à des fins publicitaires, voir section 3). D'autres États américains ont des lois similaires; si la tienne t'accorde des droits additionnels, ils s'appliquent aussi. [À COMPLÉTER — confirmer avec un avocat si des mécanismes spécifiques supplémentaires sont requis selon les États où l'app est réellement offerte, par exemple un lien dédié « Do Not Sell or Share My Personal Information ».]</p>
<p>Pour exercer un de ces droits, peu importe où tu habites, écris-nous à [À COMPLÉTER — courriel dédié aux demandes de confidentialité].</p>

<h2>8. Sécurité</h2>
<p>Les mots de passe sont hachés (jamais stockés en clair). Les communications entre l'application et nos serveurs sont chiffrées (HTTPS). L'accès aux renseignements d'une organisation est restreint à ses membres selon leur rôle. Aucun système n'est parfaitement sécurisé; en cas d'incident de confidentialité présentant un risque de préjudice sérieux, nous aviserons les personnes concernées ainsi que les autorités compétentes (par exemple la Commission d'accès à l'information du Québec pour les résidents du Québec) conformément aux lois applicables.</p>

<h2>9. Enfants</h2>
<p>Ce service ne s'adresse pas aux personnes de moins de 14 ans (13 ans aux États-Unis, selon le COPPA) et nous ne recueillons pas sciemment de renseignements personnels auprès d'elles.</p>

<h2>10. Responsable de la protection des renseignements personnels</h2>
<p>[À COMPLÉTER — nom et coordonnées de la personne désignée, tel que requis par la Loi 25 pour les résidents du Québec. À défaut de désignation explicite, cette fonction est exercée par la personne ayant la plus haute autorité au sein de l'entreprise.]</p>

<h2>11. Plaintes</h2>
<p>Si tu as une préoccupation quant au traitement de tes renseignements personnels, communique d'abord avec nous à [À COMPLÉTER]. Selon où tu habites, tu peux aussi porter plainte auprès de l'autorité compétente — par exemple la <a href="https://www.cai.gouv.qc.ca/" target="_blank" rel="noopener">Commission d'accès à l'information du Québec</a> pour les résidents du Québec, ou le <a href="https://www.priv.gc.ca/" target="_blank" rel="noopener">Commissariat à la protection de la vie privée du Canada</a> pour les autres résidents canadiens.</p>

<h2>12. Modifications</h2>
<p>Nous pouvons mettre à jour cette politique de temps à autre. La date de la dernière mise à jour est indiquée en haut de cette page.</p>

<h2>13. Nous joindre</h2>
<p>[À COMPLÉTER — courriel de contact général]</p>
`;

const en = `
<h1>Privacy policy</h1>
<p class="text-secondary small">Last updated: August 20, 2026</p>

<p><strong>Draft — not reviewed by a lawyer.</strong> This document accurately describes what the Intahe app actually does with personal information, but has not yet been reviewed by a privacy law professional. Since Intahe serves users in both Canada and the United States, several different legal frameworks may apply depending on where you live (see section 7) — this draft aims to respect the spirit of the main ones, but does not replace a legal review specific to each market the app is actually offered in. Sections marked [TO COMPLETE] must be filled in before official publication.</p>

<h2>1. Who we are</h2>
<p>Intahe ("we", "our") is a ticketing and event management platform. The party responsible for the personal information described below is:</p>
<p>[TO COMPLETE — legal business name]<br/>
[TO COMPLETE — address]<br/>
[TO COMPLETE — general contact email]</p>

<h2>2. Personal information we collect</h2>
<p>We only collect what's necessary for the service to work:</p>
<ul>
  <li><strong>User account:</strong> full name, email address, password (never stored in plain text — only an irreversible cryptographic hash is kept), or your Google identifier if you sign in with Google.</li>
  <li><strong>Ticket purchases:</strong> the buyer's email address (needed to send the confirmation and tickets), even without an account.</li>
  <li><strong>Payment:</strong> we <strong>never</strong> receive or store your card number or full banking details. Payment is processed entirely by Stripe, our payment processor; we only receive confirmation that the payment succeeded.</li>
  <li><strong>Organizations and events:</strong> for organizers — organization name, event name and description, event address and coordinates (if provided).</li>
  <li><strong>Location:</strong> only if you explicitly allow it, to show you nearby events or to locate an event you're creating. Optional — declining doesn't prevent you from using the app.</li>
  <li><strong>Technical information:</strong> no behavioral analytics or advertising tracking cookies are used. Only data strictly necessary for the app to function (e.g. a login token) is kept on your device.</li>
</ul>

<h2>3. Why we collect this information</h2>
<ul>
  <li>Create and manage your account, authenticate you</li>
  <li>Process your ticket orders and generate your tickets (QR codes)</li>
  <li>Let organizers manage their events and check in their guests (ticket validation at the door)</li>
  <li>Send you the communications necessary for the service (order confirmation, password reset)</li>
  <li>Show you nearby public events, if you use that feature</li>
  <li>Detect and prevent fraud</li>
</ul>
<p>We never use your personal information for third-party marketing, and we do not <strong>sell</strong> or <strong>rent</strong> it to anyone — including under the broad meaning some U.S. laws (like the CCPA) give to the word "sale".</p>

<h2>4. Who we share this information with</h2>
<p>We rely on third-party service providers to operate the platform, each with access only to what it needs for its task:</p>
<ul>
  <li><strong>Stripe</strong> (payment processing) — receives the information necessary to process payment.</li>
  <li><strong>Resend</strong> (transactional email delivery) — receives your email address to deliver confirmations and password resets.</li>
  <li><strong>Google</strong> — only if you choose to sign in with a Google account.</li>
  <li><strong>Render</strong> (cloud hosting for our servers and databases).</li>
  <li><strong>The organizer of an event you buy a ticket to</strong> — sees your email address and your ticket's status, to the extent necessary to manage their event (guest list, check-in).</li>
</ul>
<p>We do not share any personal information for advertising purposes.</p>

<h2>5. Where data is hosted</h2>
<p>Our servers and databases are hosted with Render, in the United States (Oregon). If you reside in Canada, this means your personal information is processed and stored outside the country. [TO COMPLETE — confirm that a privacy impact assessment has been completed for this transfer outside Quebec, as required by Loi 25 for Quebec residents, and summarize the contractual safeguards in place with Render.]</p>

<h2>6. How long we keep your information</h2>
<p>Your account information (name, email, password, any location you provide) is kept for as long as your account is active. If you delete your account, that personal information is erased immediately from our active database. Your order and ticket history is kept separately for 7 years after the transaction, for accounting and tax purposes — even after your account is deleted, this history remains visible to the relevant organizers. As with most cloud services, your information may also persist temporarily (up to 30 days) in our routine backup copies after a deletion, until the normal backup cycle replaces them.</p>

<h2>7. Your rights depending on where you live</h2>
<p>Intahe serves users in Canada and the United States; the rights below vary depending on your province, state, and which law applies to you. In general, you can:</p>
<ul>
  <li>Access the personal information we hold about you</li>
  <li>Have inaccurate or incomplete information corrected</li>
  <li>Request deletion of your account and associated information, subject to legal retention obligations (e.g. tax records)</li>
  <li>Get a copy of your information in a structured, commonly used format (portability)</li>
  <li>Withdraw your consent to certain processing, where applicable</li>
</ul>
<p><strong>Canada:</strong> the Personal Information Protection and Electronic Documents Act (PIPEDA) governs these rights federally. If you reside in Quebec, Loi 25 also applies and gives you additional rights and recourse, including with the Commission d'accès à l'information du Québec (see section 11).</p>
<p><strong>United States:</strong> if you reside in California, the California Consumer Privacy Act (CCPA/CPRA) gives you the right to know what information is collected, to have it deleted, and to opt out of its "sale" or "sharing" (we don't sell or share personal information for advertising purposes, see section 3). Other U.S. states have similar laws; if yours grants you additional rights, those apply too. [TO COMPLETE — confirm with a lawyer whether additional specific mechanisms are required depending on the states the app is actually offered in, e.g. a dedicated "Do Not Sell or Share My Personal Information" link.]</p>
<p>To exercise any of these rights, no matter where you live, write to us at [TO COMPLETE — dedicated privacy request email].</p>

<h2>8. Security</h2>
<p>Passwords are hashed (never stored in plain text). Communication between the app and our servers is encrypted (HTTPS). Access to an organization's information is restricted to its members based on their role. No system is perfectly secure; in the event of a privacy incident presenting a real risk of significant harm, we will notify affected individuals as well as the relevant authorities (e.g. the Commission d'accès à l'information du Québec for Quebec residents) in accordance with applicable law.</p>

<h2>9. Children</h2>
<p>This service is not directed at anyone under 14 (13 in the United States, per COPPA) and we do not knowingly collect personal information from them.</p>

<h2>10. Privacy officer</h2>
<p>[TO COMPLETE — name and contact information of the designated person, as required by Loi 25 for Quebec residents. Absent an explicit designation, this role is filled by the person with the highest authority within the company.]</p>

<h2>11. Complaints</h2>
<p>If you have a concern about how your personal information is handled, contact us first at [TO COMPLETE]. Depending on where you live, you may also file a complaint with the relevant authority — for example the <a href="https://www.cai.gouv.qc.ca/" target="_blank" rel="noopener">Commission d'accès à l'information du Québec</a> for Quebec residents, or the <a href="https://www.priv.gc.ca/" target="_blank" rel="noopener">Office of the Privacy Commissioner of Canada</a> for other Canadian residents.</p>

<h2>12. Changes</h2>
<p>We may update this policy from time to time. The date of the last update is shown at the top of this page.</p>

<h2>13. Contact us</h2>
<p>[TO COMPLETE — general contact email]</p>
`;

const versions: Record<Locale, string> = { fr, en };

export function privacyPolicyHtml(locale: Locale): string {
  return versions[locale];
}
