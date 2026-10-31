// Synchronisation de l'état local avec Supabase (une ligne par utilisateur, table app_states).
//
// Principe : l'appli reste « local d'abord » (tout marche hors-ligne). Chaque modification marque
// l'état « à envoyer » ; l'envoi part 1,5 s après la dernière modification, ou au retour du réseau.
// Le serveur refuse d'écraser une version plus récente (numéro de révision) : on demande alors
// à l'utilisateur quelle version garder, plutôt que de perdre des données en silence.

import { normalizeState } from '../schema';
import { getState, replaceState, subscribeChanges } from '../store';
import type { AppState } from '../types';
import { defaultState } from '../schema';
import { getClient } from './client';

export interface SyncMeta {
  userId: string;
  /** Révision du cloud sur laquelle repose l'état local (null = jamais synchronisé). */
  revision: number | null;
  /** Modifications locales pas encore envoyées. */
  dirty: boolean;
  syncedAt: number | null;
}

export interface RemoteRow {
  revision: number;
  data: unknown;
  updated_at: string;
}

export type SyncDecision = 'nothing' | 'push' | 'pull' | 'conflict';

export function hasData(s: Pick<AppState, 'players' | 'matches' | 'tournaments'>): boolean {
  return s.players.length > 0 || s.matches.length > 0 || s.tournaments.length > 0;
}

/** Que faire en comparant l'état local et le cloud ? (fonction pure, testée) */
export function decideSync(meta: Pick<SyncMeta, 'revision' | 'dirty'>, remote: RemoteRow | null, localHasData: boolean): SyncDecision {
  if (!remote) return localHasData ? 'push' : 'nothing';
  if (remote.revision === meta.revision) return meta.dirty ? 'push' : 'nothing';
  // Le cloud a changé depuis la dernière synchro de cet appareil (ou première synchro ici).
  if (!meta.dirty || !localHasData) return 'pull';
  return 'conflict';
}

/* ---------- Moteur ---------- */

export type SyncStatus = 'off' | 'syncing' | 'synced' | 'pending' | 'offline' | 'error';

export interface SyncInfo {
  status: SyncStatus;
  syncedAt: number | null;
  error: string | null;
}

export interface ConflictInfo {
  local: AppState;
  remote: AppState;
  remoteUpdatedAt: string;
}

const META_KEY = 'stats-ultimate-plouf:sync';
const PUSH_DELAY_MS = 1500;
const POLL_MS = 120_000;

let meta: SyncMeta | null = null;
let info: SyncInfo = { status: 'off', syncedAt: null, error: null };
let busy: Promise<void> | null = null;
let again = false;
let changeCounter = 0;
let pushTimer: number | null = null;
let pollTimer: number | null = null;
let unsubscribe: (() => void) | null = null;
type ConflictChoice = 'cloud' | 'device' | 'later';
let resolveConflict: (c: ConflictInfo) => Promise<ConflictChoice> = async () => 'later';
const listeners = new Set<() => void>();

export function setConflictResolver(fn: (c: ConflictInfo) => Promise<ConflictChoice>): void {
  resolveConflict = fn;
}

export function getSyncInfo(): SyncInfo {
  return info;
}

export function subscribeSync(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function setInfo(patch: Partial<SyncInfo>): void {
  info = { ...info, ...patch };
  for (const fn of [...listeners]) fn();
}

function loadMeta(): SyncMeta | null {
  try {
    const raw = localStorage.getItem(META_KEY);
    return raw ? (JSON.parse(raw) as SyncMeta) : null;
  } catch {
    return null;
  }
}

function saveMeta(): void {
  try {
    if (meta) localStorage.setItem(META_KEY, JSON.stringify(meta));
    else localStorage.removeItem(META_KEY);
  } catch {
    /* stockage plein : la synchro continue en mémoire */
  }
}

function isNetworkError(err: unknown): boolean {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return true;
  const msg = String((err as { message?: string })?.message ?? err).toLowerCase();
  return msg.includes('fetch') || msg.includes('network') || msg.includes('load failed');
}

function fail(err: unknown): void {
  if (isNetworkError(err)) {
    setInfo({ status: 'offline', error: null });
  } else {
    console.error('Synchronisation', err);
    setInfo({ status: 'error', error: (err as { message?: string })?.message ?? 'Erreur de synchronisation.' });
  }
}

function applyRemote(row: RemoteRow): void {
  const { state } = normalizeState(row.data);
  replaceState(state, { remote: true });
  if (meta) {
    meta.revision = row.revision;
    meta.dirty = false;
    meta.syncedAt = Date.now();
    saveMeta();
  }
}

async function fetchRemote(): Promise<RemoteRow | null> {
  const sb = await getClient();
  const { data, error } = await sb.from('app_states').select('data, revision, updated_at').maybeSingle();
  if (error) throw error;
  return (data as RemoteRow | null) ?? null;
}

/** Envoie l'état local. Renvoie false si le cloud a changé entre-temps (conflit de révision). */
async function push(base: number | null): Promise<boolean> {
  if (!meta) return true;
  const sb = await getClient();
  const counter = changeCounter;
  const { data, error } = await sb.rpc('save_app_state', { p_data: getState(), p_base_revision: base });
  if (error) {
    if (error.code === '40001') return false;
    // Anti-flood côté base (1 écriture/s) : on réessaie un peu plus tard, sans erreur.
    if (error.code === 'PT429') {
      schedulePush();
      return true;
    }
    throw error;
  }
  const row = (Array.isArray(data) ? data[0] : data) as { revision: number } | undefined;
  if (!meta) return true;
  meta.revision = row?.revision ?? (base ?? 0) + 1;
  // Modifié pendant l'envoi : il faudra renvoyer.
  meta.dirty = changeCounter !== counter;
  meta.syncedAt = Date.now();
  saveMeta();
  if (meta.dirty) schedulePush();
  return true;
}

async function runSync(): Promise<void> {
  if (!meta) return;
  setInfo({ status: 'syncing', error: null });
  for (let attempt = 0; attempt < 3 && meta; attempt++) {
    const remote = await fetchRemote();
    if (!meta) return;
    const decision = decideSync(meta, remote, hasData(getState()));
    if (decision === 'pull') applyRemote(remote!);
    else if (decision === 'push') {
      // « push » n'arrive que si le cloud est vide ou à la même révision que nous.
      if (!(await push(remote?.revision ?? null))) continue;
    } else if (decision === 'conflict') {
      const remoteState = normalizeState(remote!.data).state;
      const choice = await resolveConflict({ local: getState(), remote: remoteState, remoteUpdatedAt: remote!.updated_at });
      if (choice === 'later') {
        setInfo({ status: 'error', syncedAt: meta.syncedAt, error: 'Deux versions différentes : choisis laquelle garder (« Synchroniser maintenant »).' });
        return;
      }
      if (choice === 'cloud') applyRemote(remote!);
      else if (!(await push(remote!.revision))) continue;
    } else if (meta) {
      meta.syncedAt = Date.now();
      saveMeta();
    }
    break;
  }
  if (meta) setInfo({ status: meta.dirty ? 'pending' : 'synced', syncedAt: meta.syncedAt, error: null });
}

/** Lance une synchronisation complète (récupère le cloud, envoie ou demande en cas de conflit). */
export function syncNow(): Promise<void> {
  if (!meta) return Promise.resolve();
  if (busy) {
    again = true;
    return busy;
  }
  busy = (async () => {
    try {
      do {
        again = false;
        await runSync();
      } while (again && meta);
    } catch (err) {
      fail(err);
    } finally {
      busy = null;
    }
  })();
  return busy;
}

function schedulePush(): void {
  if (pushTimer !== null) window.clearTimeout(pushTimer);
  pushTimer = window.setTimeout(() => {
    pushTimer = null;
    void pushChanges();
  }, PUSH_DELAY_MS);
}

/** Envoi rapide des modifications locales ; synchro complète si le cloud a bougé. */
async function pushChanges(): Promise<void> {
  if (!meta?.dirty) return;
  if (busy) {
    again = true;
    return;
  }
  busy = (async () => {
    try {
      setInfo({ status: 'syncing', error: null });
      const ok = await push(meta?.revision ?? null);
      if (meta) setInfo({ status: meta.dirty ? 'pending' : 'synced', syncedAt: meta.syncedAt, error: null });
      if (!ok) again = true;
    } catch (err) {
      fail(err);
    } finally {
      busy = null;
    }
    if (again) void syncNow();
  })();
  await busy;
}

function onLocalChange(): void {
  changeCounter++;
  if (!meta) return;
  meta.dirty = true;
  saveMeta();
  setInfo({ status: info.status === 'offline' ? 'offline' : 'pending' });
  schedulePush();
}

const onOnline = (): void => { void syncNow(); };
const onVisible = (): void => { if (document.visibilityState === 'visible') void syncNow(); };

export function startSync(userId: string): void {
  const saved = loadMeta();
  if (saved && saved.userId === userId) meta = saved;
  else {
    // Première connexion de ce compte sur cet appareil : les données locales éventuelles sont « à envoyer ».
    meta = { userId, revision: null, dirty: hasData(getState()), syncedAt: null };
    saveMeta();
  }
  unsubscribe ??= subscribeChanges(onLocalChange);
  window.addEventListener('online', onOnline);
  document.addEventListener('visibilitychange', onVisible);
  if (pollTimer === null) pollTimer = window.setInterval(() => { if (document.visibilityState === 'visible') void syncNow(); }, POLL_MS);
  setInfo({ status: 'syncing', syncedAt: meta.syncedAt, error: null });
  void syncNow();
}

export function stopSync(): void {
  meta = null;
  unsubscribe?.();
  unsubscribe = null;
  if (pushTimer !== null) window.clearTimeout(pushTimer);
  if (pollTimer !== null) window.clearInterval(pollTimer);
  pushTimer = null;
  pollTimer = null;
  window.removeEventListener('online', onOnline);
  document.removeEventListener('visibilitychange', onVisible);
  setInfo({ status: 'off', syncedAt: null, error: null });
}

/** Avant déconnexion : tente d'envoyer les dernières modifications. Renvoie true si tout est dans le cloud. */
export async function flushBeforeSignOut(): Promise<boolean> {
  if (!meta) return true;
  if (pushTimer !== null) {
    window.clearTimeout(pushTimer);
    pushTimer = null;
  }
  if (busy) await busy;
  if (meta?.dirty) await syncNow();
  return !meta?.dirty && info.status !== 'error' && info.status !== 'offline';
}

/** Après déconnexion : les données du compte quittent cet appareil. */
export function clearLocalAfterSignOut(): void {
  stopSync();
  try {
    localStorage.removeItem(META_KEY);
  } catch {
    /* sans importance */
  }
  replaceState(defaultState(), { remote: true });
}
