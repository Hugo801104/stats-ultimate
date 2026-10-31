// État de connexion : compte Supabase, ou mode « sans compte » (données sur cet appareil uniquement).

import type { AuthError, Session } from '@supabase/supabase-js';
import { KEY_PREFIX } from '../legacyKeys';
import { cloudEnabled, getClient, redirectUrl } from './client';

export type AuthStatus = 'loading' | 'signed_out' | 'signed_in' | 'local';

export interface SessionState {
  status: AuthStatus;
  userId: string | null;
  email: string | null;
  /** Arrivée par un lien « mot de passe oublié » : il faut choisir un nouveau mot de passe. */
  recovery: boolean;
  /** Message à afficher sur l'écran de connexion (ex. lien expiré). */
  notice: string | null;
}

const MODE_KEY = `${KEY_PREFIX}mode`;

let state: SessionState = {
  status: cloudEnabled ? 'loading' : 'local',
  userId: null,
  email: null,
  recovery: false,
  notice: null,
};
const listeners = new Set<() => void>();

export function getSession(): SessionState {
  return state;
}

export function subscribeSession(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function set(patch: Partial<SessionState>): void {
  state = { ...state, ...patch };
  for (const fn of [...listeners]) fn();
}

function localModeChosen(): boolean {
  try {
    return localStorage.getItem(MODE_KEY) === 'local';
  } catch {
    return false;
  }
}

function applySession(session: Session | null): void {
  if (session?.user) {
    try { localStorage.removeItem(MODE_KEY); } catch { /* sans importance */ }
    set({ status: 'signed_in', userId: session.user.id, email: session.user.email ?? null });
  } else {
    set({ status: localModeChosen() ? 'local' : 'signed_out', userId: null, email: null });
  }
}

/** Lit l'erreur éventuelle renvoyée dans l'adresse par un lien e-mail, puis nettoie l'adresse. */
function readUrlError(): string | null {
  const params = new URLSearchParams(window.location.search);
  const desc = params.get('error_description') ?? params.get('error');
  const hasAuthParams = desc !== null || params.has('code');
  if (hasAuthParams) {
    // Laisse le temps à supabase-js d'échanger le code avant de nettoyer.
    window.setTimeout(() => window.history.replaceState(null, '', `${window.location.pathname}${window.location.hash}`), 0);
  }
  if (!desc) return null;
  return /expired|invalid/i.test(desc)
    ? 'Ce lien a expiré ou a déjà été utilisé. Connecte-toi, ou redemande un lien.'
    : `Le lien n’a pas fonctionné : ${desc}`;
}

export async function initSession(): Promise<void> {
  if (!cloudEnabled) return;
  const urlError = readUrlError();
  try {
    const sb = await getClient();
    sb.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') set({ recovery: true });
      applySession(session);
    });
    const { data, error } = await sb.auth.getSession();
    if (error && !urlError) set({ notice: friendlyAuthError(error) });
    applySession(data.session);
  } catch (err) {
    // Hors-ligne au tout premier lancement, ou bibliothèque introuvable : on reste utilisable en local.
    console.warn('Session indisponible', err);
    set({ status: localModeChosen() ? 'local' : 'signed_out', notice: 'Connexion au serveur impossible pour le moment. Tu peux continuer sans compte.' });
  }
  if (urlError) set({ notice: urlError });
}

/* ---------- Actions ---------- */

export function friendlyAuthError(err: unknown): string {
  const e = err as Partial<AuthError> & { message?: string };
  const msg = (e.message ?? '').toLowerCase();
  const code = (e as { code?: string }).code ?? '';
  if (code === 'invalid_credentials' || msg.includes('invalid login')) return 'E-mail ou mot de passe incorrect.';
  if (code === 'email_not_confirmed' || msg.includes('not confirmed')) return 'Confirme d’abord ton adresse : clique sur le lien reçu par e-mail.';
  if (code === 'user_already_exists' || msg.includes('already registered')) return 'Un compte existe déjà avec cet e-mail. Connecte-toi.';
  if (code === 'weak_password' || msg.includes('password should')) return 'Mot de passe trop faible : 8 caractères minimum.';
  if (code === 'over_email_send_rate_limit' || code === 'over_request_rate_limit' || msg.includes('rate limit')) return 'Trop de tentatives : réessaie dans quelques minutes.';
  if (code === 'same_password') return 'Choisis un mot de passe différent de l’ancien.';
  if (msg.includes('fetch') || msg.includes('network')) return 'Pas de connexion internet.';
  if (msg.includes('email address') && msg.includes('invalid')) return 'Adresse e-mail invalide.';
  return e.message || 'Une erreur est survenue.';
}

export async function signIn(email: string, password: string): Promise<void> {
  const sb = await getClient();
  const { error } = await sb.auth.signInWithPassword({ email, password });
  if (error) throw new Error(friendlyAuthError(error));
}

/** Renvoie true si le compte est immédiatement actif, false si une confirmation par e-mail est requise. */
export async function signUp(email: string, password: string): Promise<boolean> {
  const sb = await getClient();
  const { data, error } = await sb.auth.signUp({ email, password, options: { emailRedirectTo: redirectUrl() } });
  if (error) throw new Error(friendlyAuthError(error));
  // Compte déjà existant : Supabase ne le dit pas (anti-énumération) et renvoie un utilisateur sans identité.
  if (data.user && data.user.identities?.length === 0) throw new Error('Un compte existe déjà avec cet e-mail. Connecte-toi.');
  return data.session !== null;
}

export async function sendPasswordReset(email: string): Promise<void> {
  const sb = await getClient();
  const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: redirectUrl() });
  if (error) throw new Error(friendlyAuthError(error));
}

export async function updatePassword(password: string): Promise<void> {
  const sb = await getClient();
  const { error } = await sb.auth.updateUser({ password });
  if (error) throw new Error(friendlyAuthError(error));
  set({ recovery: false });
}

export function dismissRecovery(): void {
  set({ recovery: false });
}

/**
 * `everywhere: false` : déconnecte cet appareil (fonctionne même hors-ligne).
 * `everywhere: true` : révoque aussi les sessions de tous tes autres appareils (téléphone perdu…).
 */
export async function signOut(everywhere = false): Promise<void> {
  const sb = await getClient();
  const { error } = await sb.auth.signOut({ scope: everywhere ? 'global' : 'local' });
  if (error && everywhere) throw new Error(friendlyAuthError(error));
  applySession(null);
}

/** Droit à l'effacement : supprime définitivement le compte et ses données en ligne. */
export async function deleteAccount(): Promise<void> {
  const sb = await getClient();
  const { error } = await sb.rpc('delete_my_account');
  if (error) throw new Error(friendlyAuthError(error));
  await sb.auth.signOut({ scope: 'local' }).catch(() => undefined);
  applySession(null);
}

export function continueWithoutAccount(): void {
  try {
    localStorage.setItem(MODE_KEY, 'local');
  } catch {
    /* sans importance */
  }
  set({ status: 'local', notice: null });
}

/** Depuis le mode sans compte : revenir à l'écran de connexion. */
export function goToSignIn(): void {
  try {
    localStorage.removeItem(MODE_KEY);
  } catch {
    /* sans importance */
  }
  set({ status: cloudEnabled ? 'signed_out' : 'local', notice: null });
}

export function clearNotice(): void {
  if (state.notice) set({ notice: null });
}
