import { defaultState, normalizeState } from './schema';
import type { AppState } from './types';

const STORAGE_KEY = 'stats-ultimate-plouf:state';

let state: AppState = load();
let lastSaveError: string | null = null;
const listeners = new Set<() => void>();
/** Écouteurs des modifications faites SUR CET APPAREIL (pas celles reçues du cloud). */
const changeListeners = new Set<() => void>();

function load(): AppState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return normalizeState(JSON.parse(raw)).state;
  } catch (err) {
    console.error('Lecture du stockage local impossible, état réinitialisé.', err);
  }
  return defaultState();
}

function save(): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    lastSaveError = null;
  } catch (err) {
    lastSaveError = 'Sauvegarde locale impossible (stockage plein ou bloqué). Exporte une sauvegarde.';
    console.error(err);
  }
}

export function getState(): AppState {
  return state;
}

export function getSaveError(): string | null {
  return lastSaveError;
}

/**
 * Modification atomique : le mutateur travaille sur une copie ; si il lève une erreur,
 * l'état reste intact. Après succès : sauvegarde + notification des vues.
 */
export function update(mutator: (draft: AppState) => void): void {
  const draft = structuredClone(state);
  mutator(draft);
  state = draft;
  save();
  notifyChange();
  notify();
}

/** `remote: true` = état reçu du cloud : ne doit pas être renvoyé à la synchronisation. */
export function replaceState(next: AppState, opts: { remote?: boolean } = {}): void {
  state = next;
  save();
  if (!opts.remote) notifyChange();
  notify();
}

export function subscribeChanges(fn: () => void): () => void {
  changeListeners.add(fn);
  return () => changeListeners.delete(fn);
}

function notifyChange(): void {
  for (const fn of [...changeListeners]) fn();
}

export function resetAll(): void {
  replaceState(defaultState());
}

export function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function notify(): void {
  for (const fn of [...listeners]) fn();
}
