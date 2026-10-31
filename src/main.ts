import './styles.css';
import { cloudEnabled } from './cloud/client';
import { getSession, initSession, subscribeSession } from './cloud/session';
import { setConflictResolver, startSync, stopSync, subscribeSync } from './cloud/sync';
import { subscribe } from './store';
import { openConflictDialog, openPasswordDialog, syncBadge } from './ui/views/account';
import { authView } from './ui/views/auth';
import { h, icon } from './ui/dom';
import { initInstallPrompt } from './ui/install';
import { parseHash, setRenderer, type Route, type View } from './ui/router';
import { liveView } from './ui/views/live';
import { matchDetailView } from './ui/views/matchDetail';
import { matchesView } from './ui/views/matches';
import { playerView } from './ui/views/player';
import { rosterView } from './ui/views/roster';
import { settingsView } from './ui/views/settings';
import { statsView } from './ui/views/stats';
import { sheetView } from './ui/views/sheet';
import { tournamentView, tournamentsView } from './ui/views/tournaments';
import { weatherView } from './ui/views/weather';

const NAV: { href: string; label: string; icon: string; routes: Route['name'][] }[] = [
  { href: '#/', label: 'Matchs', icon: 'matchs', routes: ['matchs', 'live', 'match'] },
  { href: '#/tournois', label: 'Tournois', icon: 'tournoi', routes: ['tournois', 'tournoi', 'feuille'] },
  { href: '#/effectif', label: 'Effectif', icon: 'effectif', routes: ['effectif'] },
  { href: '#/stats', label: 'Stats', icon: 'stats', routes: ['stats', 'joueur'] },
  { href: '#/meteo', label: 'Météo', icon: 'meteo', routes: ['meteo'] },
  { href: '#/reglages', label: 'Réglages', icon: 'reglages', routes: ['reglages'] },
];

const TITLES: Record<Route['name'], string> = {
  matchs: 'Matchs', live: 'Saisie', match: 'Match', effectif: 'Effectif', stats: 'Statistiques',
  joueur: 'Joueur', meteo: 'Météo', reglages: 'Réglages', tournois: 'Tournois', tournoi: 'Tournoi', feuille: 'Feuille de match',
};

const root = document.getElementById('app');
if (!root) throw new Error('Élément #app introuvable.');

const main = h('main', { id: 'view', tabindex: '-1' });
const syncSlot = h('div', { class: 'nav__sync' });
const nav = h(
  'nav',
  { class: 'nav', 'aria-label': 'Navigation principale' },
  h('div', { class: 'nav__brand' }, '🥏 Stats Ultimate', syncSlot),
  NAV.map((n) => h('a', { class: 'nav__item', href: n.href, dataset: { routes: n.routes.join(',') } }, icon(n.icon), h('span', null, n.label))),
);
const shell = h('div', { class: 'shell' }, nav, main);
const authHost = h('main', { class: 'auth-host', id: 'auth', tabindex: '-1' });
const splash = h('div', { class: 'splash', role: 'status' }, h('span', { class: 'auth__logo' }, '🥏'), h('p', { class: 'muted' }, 'Chargement…'));

/** Écran affiché selon l'état de connexion : chargement, connexion, ou l'appli. */
function renderRoot(): boolean {
  const s = getSession();
  if (s.status === 'loading') {
    if (root!.firstChild !== splash) root!.replaceChildren(splash);
    return false;
  }
  if (s.status === 'signed_out') {
    authHost.replaceChildren(authView(renderRoot));
    if (root!.firstChild !== authHost) {
      root!.replaceChildren(authHost);
      window.scrollTo(0, 0);
    }
    document.title = 'Connexion · Stats Ultimate · Les Plouf';
    return false;
  }
  if (root!.firstChild !== shell) {
    root!.replaceChildren(shell);
    currentKey = ''; // force un rendu complet de la vue
  }
  return true;
}

function renderSyncBadge(): void {
  syncSlot.replaceChildren(...[syncBadge()].filter((x): x is HTMLElement => x !== null));
}

function buildView(route: Route): View {
  switch (route.name) {
    case 'live': return liveView(route.params);
    case 'match': return matchDetailView(route.params);
    case 'effectif': return rosterView();
    case 'stats': return statsView();
    case 'joueur': return playerView(route.params);
    case 'meteo': return weatherView();
    case 'reglages': return settingsView();
    case 'tournois': return tournamentsView();
    case 'tournoi': return tournamentView(route.params);
    case 'feuille': return sheetView(route.params);
    default: return matchesView();
  }
}

let currentKey = '';
let currentLeave: (() => void) | undefined;

function render(): void {
  if (!renderRoot()) return;
  renderSyncBadge();
  const route = parseHash(window.location.hash);
  const key = `${route.name}:${JSON.stringify(route.params)}`;
  const routeChanged = key !== currentKey;
  if (routeChanged) {
    currentLeave?.();
    currentLeave = undefined;
  }
  const scrollY = window.scrollY;

  let view: View;
  try {
    view = buildView(route);
  } catch (err) {
    console.error(err);
    view = {
      el: h('div', { class: 'page' },
        h('div', { class: 'empty' },
          h('h3', null, 'Oups, cet écran a rencontré un problème'),
          h('p', null, 'Tes données sont intactes. Recharge la page ou reviens à l’accueil.'),
          h('a', { class: 'btn btn--primary', href: '#/' }, 'Retour aux matchs'))),
    };
  }
  currentLeave = view.leave ?? currentLeave;
  currentKey = key;

  main.replaceChildren(view.el);
  shell.classList.toggle('shell--live', route.name === 'live' || route.name === 'feuille');
  for (const a of nav.querySelectorAll<HTMLAnchorElement>('.nav__item')) {
    const active = (a.dataset.routes ?? '').split(',').includes(route.name);
    if (active) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  }
  document.title = `${TITLES[route.name]} · Stats Ultimate · Les Plouf`;
  if (routeChanged) {
    window.scrollTo(0, 0);
    main.focus({ preventScroll: true });
  } else {
    window.scrollTo(0, scrollY);
  }
}

setRenderer(render);
subscribe(render);
window.addEventListener('hashchange', render);
initInstallPrompt();

/* ---------- Compte et synchronisation ---------- */
let syncedUser: string | null = null;
let recoveryShown = false;
setConflictResolver(openConflictDialog);
subscribeSession(() => {
  const s = getSession();
  if (s.status === 'signed_in' && s.userId && s.userId !== syncedUser) {
    syncedUser = s.userId;
    startSync(s.userId);
  } else if (s.status !== 'signed_in' && syncedUser) {
    syncedUser = null;
    stopSync();
  }
  if (s.recovery && !recoveryShown) {
    recoveryShown = true;
    openPasswordDialog(true);
  } else if (!s.recovery) recoveryShown = false;
  render();
});
subscribeSync(() => {
  renderSyncBadge();
  // Les réglages affichent l'état détaillé : on ne redessine que cet écran.
  if (parseHash(window.location.hash).name === 'reglages') render();
});
render();
if (cloudEnabled) void initSession();

// Demande au navigateur de ne pas purger les données locales (utile sur téléphone).
void navigator.storage?.persist?.().catch(() => undefined);

// Hors-ligne : service worker (généré au build avec la liste des fichiers).
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch((err) => console.warn('Service worker non enregistré', err));
  });
}
