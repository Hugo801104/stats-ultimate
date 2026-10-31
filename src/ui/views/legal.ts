// Pages légales : mentions légales (LCEN), politique de confidentialité (RGPD), conditions d'utilisation.
// Accessibles sans compte (depuis l'écran de connexion) et depuis les Réglages.

import { h, icon, type Child } from '../dom';

export type LegalPage = 'mentions-legales' | 'confidentialite' | 'conditions';

export const LEGAL_PAGES: { id: LegalPage; title: string }[] = [
  { id: 'mentions-legales', title: 'Mentions légales' },
  { id: 'confidentialite', title: 'Confidentialité' },
  { id: 'conditions', title: 'Conditions d’utilisation' },
];

const UPDATED = '31 octobre 2026';
const EDITOR = 'Hugo Jasmin';
const CONTACT = 'hugo.jasmin1104@gmail.com';
const SITE = 'https://hugo801104.github.io/stats-ultimate/';

const mail = (): HTMLElement => h('a', { href: `mailto:${CONTACT}` }, CONTACT);
const ext = (href: string, label: string): HTMLElement => h('a', { href, target: '_blank', rel: 'noopener noreferrer' }, label);
const sec = (title: string, ...children: Child[]): HTMLElement => h('section', { class: 'legal__section' }, h('h2', null, title), children);
const ul = (...items: Child[]): HTMLElement => h('ul', null, items.map((i) => h('li', null, i)));

function mentions(): HTMLElement[] {
  return [
    sec('Éditeur du site',
      h('p', null, `Le site et l’application « Stats Ultimate · Les Plouf » (${SITE}) sont édités à titre personnel et non commercial par `, h('b', null, EDITOR), ', particulier.'),
      h('p', null, 'Contact : ', mail(), '.'),
      h('p', null, `Directeur de la publication : ${EDITOR}.`)),
    sec('Hébergement',
      h('p', null, h('b', null, 'Site (fichiers de l’application) : '), 'GitHub, Inc. (service GitHub Pages), 88 Colin P. Kelly Jr. Street, San Francisco, CA 94107, États-Unis — ', ext('https://github.com', 'github.com'), '.'),
      h('p', null, h('b', null, 'Comptes et données synchronisées : '), 'Supabase, Inc., 970 Toa Payoh North #07-04, Singapour 318992 — ', ext('https://supabase.com', 'supabase.com'), '. Les données sont stockées dans l’Union européenne (centre de données AWS de Paris, région eu-west-3).')),
    sec('Propriété intellectuelle',
      h('p', null, 'Le code source de l’application est public : ', ext('https://github.com/Hugo801104/stats-ultimate', 'github.com/Hugo801104/stats-ultimate'), '. Les données que tu saisis (effectif, matchs, tournois…) restent les tiennes.')),
    sec('Signaler un problème',
      h('p', null, 'Pour toute question, demande liée à tes données ou signalement (y compris une faille de sécurité), écris à ', mail(), '.')),
  ];
}

function privacy(): HTMLElement[] {
  return [
    h('p', { class: 'legal__intro' }, 'En bref : pas de publicité, pas de mesure d’audience, pas de cookie de suivi, aucune revente. Sans compte, tes données ne quittent pas ton appareil. Avec un compte, elles sont stockées dans l’Union européenne et seul ton compte y a accès.'),
    sec('Responsable du traitement',
      h('p', null, `${EDITOR}, particulier — contact : `, mail(), '.')),
    sec('Données traitées',
      ul(
        [h('b', null, 'Ton compte : '), 'adresse e-mail, mot de passe (jamais stocké en clair : seule une empreinte chiffrée irréversible, « bcrypt », est conservée par Supabase), dates de création et de dernière connexion.'],
        [h('b', null, 'Ce que tu saisis dans l’appli : '), 'effectif (noms, numéros et postes des joueurs), matchs, statistiques, tournois, feuilles de match, réglages (dont la position du terrain pour la météo).'],
        [h('b', null, 'Journaux techniques : '), 'adresse IP et informations du navigateur, enregistrées automatiquement par les hébergeurs (GitHub, Supabase) pour la sécurité et le bon fonctionnement.'],
      ),
      h('p', null, 'Les noms de joueurs sont des données personnelles de tiers : en les saisissant, tu t’engages à en informer les personnes concernées. Tu peux utiliser des prénoms ou surnoms.')),
    sec('Pourquoi et sur quelle base',
      ul(
        [h('b', null, 'Fournir le service '), '(compte, sauvegarde et synchronisation entre tes appareils) : exécution des conditions d’utilisation que tu acceptes en créant un compte (art. 6.1.b du RGPD).'],
        [h('b', null, 'Sécurité '), '(prévention des abus et des attaques) : intérêt légitime (art. 6.1.f du RGPD).'],
      ),
      h('p', null, 'Aucune décision automatisée, aucun profilage, aucune utilisation commerciale.')),
    sec('Qui reçoit les données',
      ul(
        [h('b', null, 'Supabase '), '(hébergement des comptes et des données, serveurs à Paris). Supabase, Inc. est une société non européenne : d’éventuels accès pour le support sont encadrés par les clauses contractuelles types de la Commission européenne.'],
        [h('b', null, 'GitHub '), '(hébergement des fichiers du site, États-Unis) : reçoit uniquement les journaux techniques de connexion au site. Transfert encadré par le cadre de protection des données UE–États-Unis (Data Privacy Framework).'],
        [h('b', null, 'Open-Meteo '), '(prévisions météo, Suisse) : reçoit seulement les coordonnées du terrain, sans information sur toi.'],
      )),
    sec('Durée de conservation',
      ul(
        'Données du compte et données synchronisées : tant que le compte existe. Tu peux le supprimer à tout moment (Réglages → Compte → « Supprimer mon compte ») : tout est effacé immédiatement et définitivement.',
        'Un compte inactif depuis plus de 3 ans peut être supprimé, après un e-mail de prévenance.',
        'Journaux techniques : selon les durées des hébergeurs (généralement de quelques jours à 90 jours).',
        'Sans compte : les données restent dans ton navigateur jusqu’à ce que tu les effaces (Réglages → « Tout effacer », ou en vidant les données du site).',
      )),
    sec('Stockage sur ton appareil (pas de cookie de suivi)',
      h('p', null, 'L’appli n’utilise aucun cookie. Elle enregistre dans le stockage local de ton navigateur : tes données (pour fonctionner hors-ligne), ta session de connexion et tes préférences, ainsi qu’une copie des fichiers de l’appli pour l’utilisation hors-ligne. Ces éléments sont strictement nécessaires au service demandé : ils ne nécessitent pas de consentement (article 82 de la loi Informatique et Libertés).')),
    sec('Sécurité',
      ul(
        'Connexion chiffrée (HTTPS) partout.',
        'Mots de passe jamais stockés ni transmis en clair à l’éditeur ; personne, éditeur compris, ne peut les lire.',
        'Cloisonnement en base : chaque compte n’accède qu’à ses propres données (règles de sécurité au niveau des lignes).',
        'Limitation des écritures et des tentatives de connexion pour éviter les abus.',
      )),
    sec('Tes droits',
      h('p', null, 'Tu disposes des droits d’accès, de rectification, d’effacement, de limitation, d’opposition et de portabilité de tes données. La plupart s’exercent directement dans l’appli : modifier tes données, les exporter (Réglages → « Télécharger la sauvegarde complète »), supprimer ton compte. Pour toute autre demande : ', mail(), '. Réponse sous un mois.'),
      h('p', null, 'Si tu estimes que tes droits ne sont pas respectés, tu peux adresser une réclamation à la CNIL : ', ext('https://www.cnil.fr/fr/plaintes', 'cnil.fr/plaintes'), '.')),
    sec('Mineurs',
      h('p', null, 'Si tu as moins de 15 ans, l’accord d’un de tes parents (ou responsable légal) est nécessaire pour créer un compte.')),
  ];
}

function terms(): HTMLElement[] {
  return [
    sec('Objet',
      h('p', null, 'Stats Ultimate est une application gratuite pour saisir et analyser des statistiques d’ultimate frisbee, tenir des feuilles de match de tournoi et consulter la météo du terrain. L’utiliser, et en particulier créer un compte, vaut acceptation des présentes conditions.')),
    sec('Compte',
      ul(
        'Tu peux utiliser l’appli sans compte ; le compte sert à sauvegarder et synchroniser tes données.',
        'Tu fournis une adresse e-mail valide et gardes ton mot de passe secret. Préviens l’éditeur en cas d’utilisation non autorisée.',
        'Tu peux supprimer ton compte à tout moment depuis les Réglages.',
      )),
    sec('Utilisation acceptable',
      ul(
        'Tu es responsable des données que tu saisis. N’y mets que des informations utiles à la pratique sportive, avec l’accord des personnes concernées.',
        'Sont interdits : les contenus illicites ou injurieux, les tentatives d’accès aux données d’autrui, de contournement des protections ou de surcharge du service.',
        'L’éditeur peut suspendre ou supprimer un compte en cas de manquement, après information lorsque c’est possible.',
      )),
    sec('Disponibilité et responsabilité',
      ul(
        'Le service est fourni gratuitement, à titre bénévole, « en l’état », sans garantie de disponibilité continue. Il peut être interrompu pour maintenance ou évoluer.',
        'L’appli fonctionne hors-ligne et conserve une copie de tes données sur ton appareil ; télécharge régulièrement une sauvegarde pour te prémunir de toute perte.',
        'L’éditeur ne saurait être tenu responsable des dommages indirects liés à l’utilisation du service, dans les limites prévues par la loi.',
      )),
    sec('Évolution et droit applicable',
      h('p', null, 'Ces conditions peuvent évoluer ; la date de mise à jour figure en bas de page. Elles sont soumises au droit français.')),
  ];
}

export function legalView(page: LegalPage, opts: { signedOut?: boolean } = {}): HTMLElement {
  const meta = LEGAL_PAGES.find((p) => p.id === page) ?? LEGAL_PAGES[0]!;
  const body = page === 'confidentialite' ? privacy() : page === 'conditions' ? terms() : mentions();
  const backHref = opts.signedOut ? '#/' : '#/reglages';
  return h('div', { class: 'page legal' },
    h('header', { class: 'page-head' },
      h('a', { class: 'btn btn--ghost btn--icon', href: backHref, 'aria-label': opts.signedOut ? 'Retour à la connexion' : 'Retour aux réglages' }, icon('back')),
      h('div', { class: 'page-head__title' }, h('h1', null, meta.title))),
    h('nav', { class: 'legal__tabs', 'aria-label': 'Informations légales' },
      LEGAL_PAGES.map((p) => h('a', { href: `#/${p.id}`, class: `chip ${p.id === page ? 'is-on' : ''}`, 'aria-current': p.id === page ? 'page' : undefined }, p.title))),
    h('article', { class: 'card legal__body' }, body),
    h('p', { class: 'hint center' }, `Dernière mise à jour : ${UPDATED}.`),
  );
}

/** Liens vers les pages légales (pied de l'écran de connexion, réglages). */
export function legalLinks(): HTMLElement {
  return h('nav', { class: 'legal-links', 'aria-label': 'Informations légales' },
    LEGAL_PAGES.map((p) => h('a', { href: `#/${p.id}` }, p.title)));
}
