// Routage par hash (#/...) : fonctionne hors-ligne et sans configuration serveur.

export interface Route {
  name: 'matchs' | 'live' | 'match' | 'effectif' | 'stats' | 'joueur' | 'meteo' | 'reglages' | 'tournois' | 'tournoi' | 'feuille' | 'legal';
  params: Record<string, string>;
}

export function parseHash(hash: string): Route {
  const path = hash.replace(/^#/, '').split('?')[0] ?? '';
  const parts = path.split('/').filter(Boolean).map(decodeURIComponent);
  const [first, id, sub] = parts;
  switch (first) {
    case 'tournois':
      return { name: 'tournois', params: {} };
    case 'mentions-legales':
    case 'confidentialite':
    case 'conditions':
      return { name: 'legal', params: { page: first } };
    case 'tournoi':
      return id ? { name: 'tournoi', params: { id } } : { name: 'tournois', params: {} };
    case 'feuille':
      return id && sub ? { name: 'feuille', params: { tid: id, gid: sub } } : { name: 'tournois', params: {} };
    case 'live':
      return id ? { name: 'live', params: { id } } : { name: 'matchs', params: {} };
    case 'match':
      return id ? { name: 'match', params: { id } } : { name: 'matchs', params: {} };
    case 'joueur':
      return id ? { name: 'joueur', params: { id } } : { name: 'effectif', params: {} };
    case 'effectif':
    case 'stats':
    case 'meteo':
    case 'reglages':
      return { name: first, params: {} };
    default:
      return { name: 'matchs', params: {} };
  }
}

export function navigate(path: string): void {
  const target = `#${path}`;
  if (window.location.hash === target) window.dispatchEvent(new HashChangeEvent('hashchange'));
  else window.location.hash = target;
}

/** Permet aux vues de demander un nouveau rendu (après un changement d'état purement visuel). */
let renderer: () => void = () => undefined;
export function setRenderer(fn: () => void): void {
  renderer = fn;
}
export function requestRender(): void {
  renderer();
}

export interface View {
  el: HTMLElement;
  /** Appelé quand on QUITTE la page (pas à chaque rafraîchissement). */
  leave?: () => void;
}
