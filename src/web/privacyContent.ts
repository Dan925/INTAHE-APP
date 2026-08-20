// Static legal content — authored directly, never interpolated with
// user-controlled data, so no escaping concerns here (unlike the other
// pages in src/web/, which fetch everything client-side for that reason).
//
// DRAFT ONLY: written to accurately reflect what the app's code actually
// does with personal information, not reviewed by a lawyer. Quebec's
// Loi 25 imposes specific, real obligations (designating a privacy
// officer, privacy impact assessments for transfers of personal
// information outside Quebec, breach notification to the Commission
// d'accès à l'information) — get this reviewed by counsel before treating
// it as the org's actual, final privacy policy. Fields marked
// [À COMPLÉTER] must be filled in before publishing.
export const privacyPolicyHtml = `
<h1>Politique de confidentialité</h1>
<p class="text-secondary small">Dernière mise à jour : [À COMPLÉTER — date]</p>

<p><strong>Brouillon — non révisé par un avocat.</strong> Ce document décrit fidèlement ce que l'application Intahe fait réellement avec les renseignements personnels, mais n'a pas encore été révisé par un professionnel du droit de la protection des renseignements personnels. Les sections marquées [À COMPLÉTER] doivent être remplies avant publication officielle.</p>

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
<p>Nous n'utilisons jamais tes renseignements personnels à des fins de marketing tiers ni ne les vendons à qui que ce soit.</p>

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
<p>Nos serveurs et bases de données sont hébergés chez Render, aux États-Unis (Oregon). Cela signifie que tes renseignements personnels peuvent être traités et conservés à l'extérieur du Québec et du Canada. [À COMPLÉTER — confirmer qu'une évaluation des facteurs relatifs à la vie privée (EFVP) a été complétée pour ce transfert hors Québec, tel que requis par la Loi 25, et résumer ici les mesures de protection contractuelles en place avec Render.]</p>

<h2>6. Combien de temps nous conservons tes renseignements</h2>
<p>[À COMPLÉTER — durée de conservation précise pour chaque catégorie : compte actif, compte supprimé, historique de commandes/billets à des fins comptables et fiscales, etc.]</p>

<h2>7. Tes droits</h2>
<p>Conformément à la Loi 25 et à la Loi sur la protection des renseignements personnels et les documents électroniques (LPRPDE), tu as le droit de :</p>
<ul>
  <li>Accéder aux renseignements personnels que nous détenons à ton sujet</li>
  <li>Faire corriger un renseignement inexact ou incomplet</li>
  <li>Retirer ton consentement à certains traitements, lorsque applicable</li>
  <li>Demander la suppression de ton compte et des renseignements associés, sous réserve des obligations légales de conservation (ex. : registres fiscaux)</li>
  <li>Obtenir une copie de tes renseignements dans un format technologique structuré et couramment utilisé (portabilité)</li>
</ul>
<p>Pour exercer un de ces droits, écris-nous à [À COMPLÉTER — courriel dédié aux demandes de confidentialité].</p>

<h2>8. Sécurité</h2>
<p>Les mots de passe sont hachés (jamais stockés en clair). Les communications entre l'application et nos serveurs sont chiffrées (HTTPS). L'accès aux renseignements d'une organisation est restreint à ses membres selon leur rôle. Aucun système n'est parfaitement sécurisé; en cas d'incident de confidentialité présentant un risque de préjudice sérieux, nous en aviserons les personnes concernées et la Commission d'accès à l'information du Québec conformément à la Loi 25.</p>

<h2>9. Enfants</h2>
<p>Ce service ne s'adresse pas aux personnes de moins de 14 ans et nous ne recueillons pas sciemment de renseignements personnels auprès d'elles.</p>

<h2>10. Responsable de la protection des renseignements personnels</h2>
<p>[À COMPLÉTER — nom et coordonnées de la personne désignée, tel que requis par la Loi 25. À défaut de désignation explicite, cette fonction est exercée par la personne ayant la plus haute autorité au sein de l'entreprise.]</p>

<h2>11. Plaintes</h2>
<p>Si tu as une préoccupation quant au traitement de tes renseignements personnels, communique d'abord avec nous à [À COMPLÉTER]. Tu peux également porter plainte auprès de la <a href="https://www.cai.gouv.qc.ca/" target="_blank" rel="noopener">Commission d'accès à l'information du Québec</a>.</p>

<h2>12. Modifications</h2>
<p>Nous pouvons mettre à jour cette politique de temps à autre. La date de la dernière mise à jour est indiquée en haut de cette page.</p>

<h2>13. Nous joindre</h2>
<p>[À COMPLÉTER — courriel de contact général]</p>
`;
