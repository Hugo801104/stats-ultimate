// Client Supabase, chargé à la demande (le reste de l'appli fonctionne sans lui, hors-ligne).

import type { SupabaseClient } from '@supabase/supabase-js';
import { KEY_PREFIX } from '../legacyKeys';

const URL = (import.meta.env.VITE_SUPABASE_URL ?? '').trim();
const KEY = (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? '').trim();

/** false = pas de projet Supabase configuré : l'appli reste 100 % locale, sans écran de connexion. */
export const cloudEnabled = URL !== '' && KEY !== '';

let clientPromise: Promise<SupabaseClient> | null = null;

export function getClient(): Promise<SupabaseClient> {
  if (!cloudEnabled) return Promise.reject(new Error('Synchronisation cloud non configurée.'));
  clientPromise ??= import('@supabase/supabase-js').then(({ createClient }) =>
    createClient(URL, KEY, {
      auth: {
        // PKCE : les liens reçus par e-mail reviennent avec « ?code=… », compatible avec notre routage par « # ».
        flowType: 'pkce',
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        storageKey: `${KEY_PREFIX}auth`,
      },
    }),
  );
  return clientPromise;
}

/** Adresse où reviennent les liens envoyés par e-mail (confirmation, mot de passe oublié). */
export function redirectUrl(): string {
  return `${window.location.origin}${window.location.pathname}`;
}
