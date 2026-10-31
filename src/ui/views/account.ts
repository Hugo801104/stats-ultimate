// Compte et synchronisation : section des réglages, indicateur, dialogues (conflit, nouveau mot de passe).

import { cloudEnabled } from '../../cloud/client';
import { deleteAccount, dismissRecovery, getSession, goToSignIn, signOut, updatePassword } from '../../cloud/session';
import { clearLocalAfterSignOut, flushBeforeSignOut, getSyncInfo, syncNow, type ConflictInfo, type SyncStatus } from '../../cloud/sync';
import { backupJson } from '../../exporters';
import { getState } from '../../store';
import type { AppState } from '../../types';
import { confirmDialog, errorMessage, field, openModal, toast } from '../components';
import { h } from '../dom';
import { downloadText, fileStamp } from '../files';

const STATUS_LABEL: Record<SyncStatus, string> = {
  off: 'Synchronisation inactive',
  syncing: 'Synchronisation…',
  synced: 'Synchronisé',
  pending: 'Modifications en attente d’envoi',
  offline: 'Hors-ligne : envoi au retour du réseau',
  error: 'Erreur de synchronisation',
};

const timeFmt = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'short', timeStyle: 'short' });

/** Petit indicateur d'état (navigation). */
export function syncBadge(): HTMLElement | null {
  const s = getSession();
  if (!cloudEnabled || s.status !== 'signed_in') return null;
  const info = getSyncInfo();
  return h('a', { class: `sync-badge sync-badge--${info.status}`, href: '#/reglages', title: STATUS_LABEL[info.status] },
    h('span', { class: 'sync-badge__dot', 'aria-hidden': 'true' }),
    h('span', { class: 'sync-badge__text' }, info.status === 'synced' ? 'Synchronisé' : info.status === 'offline' ? 'Hors-ligne' : info.status === 'error' ? 'Erreur synchro' : info.status === 'off' ? '' : 'Synchro…'));
}

/** Section « Compte et synchronisation » des réglages. */
export function accountSection(): HTMLElement {
  const s = getSession();
  const block = (...children: (HTMLElement | string | null)[]): HTMLElement =>
    h('section', { class: 'card settings-block' }, h('h2', null, 'Compte et synchronisation'), children);

  if (!cloudEnabled) {
    return block(h('p', { class: 'muted' }, 'Synchronisation cloud non configurée pour cette version : les données restent dans ce navigateur.'));
  }
  if (s.status !== 'signed_in') {
    return block(
      h('p', { class: 'muted' }, 'Tu utilises l’appli sans compte : les données ne sont que dans ce navigateur.'),
      h('p', { class: 'hint' }, 'Connecte-toi pour les sauvegarder dans le cloud et les retrouver sur ton téléphone et ton ordinateur. Les données actuelles seront envoyées dans ton espace.'),
      h('button', { class: 'btn btn--primary', type: 'button', onclick: () => goToSignIn() }, 'Se connecter / créer un compte'),
    );
  }

  const info = getSyncInfo();
  return block(
    h('p', null, 'Connecté en tant que ', h('b', null, s.email ?? '?')),
    h('p', { class: `sync-line sync-line--${info.status}` },
      h('span', { class: 'sync-badge__dot', 'aria-hidden': 'true' }),
      STATUS_LABEL[info.status],
      info.syncedAt && info.status !== 'syncing' ? h('span', { class: 'muted' }, ` · dernière synchro ${timeFmt.format(new Date(info.syncedAt))}`) : null),
    info.error ? h('p', { class: 'form-error' }, info.error) : null,
    h('p', { class: 'hint' }, 'Tes données sont enregistrées sur cet appareil ET dans ton espace en ligne (Supabase, hébergé en France). Seul ton compte peut y accéder.'),
    h('div', { class: 'inline-actions' },
      h('button', { class: 'btn', type: 'button', onclick: async () => { await syncNow(); toast(getSyncInfo().status === 'synced' ? 'Données synchronisées.' : STATUS_LABEL[getSyncInfo().status], { kind: getSyncInfo().status === 'synced' ? 'success' : 'info' }); } }, 'Synchroniser maintenant'),
      h('button', { class: 'btn', type: 'button', onclick: () => openPasswordDialog(false) }, 'Changer le mot de passe'),
      h('button', { class: 'btn btn--danger-ghost', type: 'button', onclick: () => void signOutFlow() }, 'Se déconnecter'),
    ),
    h('details', { class: 'danger-zone' },
      h('summary', null, 'Supprimer mon compte'),
      h('p', { class: 'hint' }, 'Efface définitivement ton compte et toutes tes données en ligne. Télécharge d’abord une sauvegarde si tu veux les garder.'),
      h('button', { class: 'btn btn--danger', type: 'button', onclick: () => openDeleteDialog() }, 'Supprimer définitivement mon compte')),
  );
}

async function signOutFlow(): Promise<void> {
  const ok = await confirmDialog('Se déconnecter ? Tes données restent dans ton espace en ligne et seront retirées de cet appareil.', 'Se déconnecter');
  if (!ok) return;
  const synced = await flushBeforeSignOut();
  if (!synced) {
    const force = await confirmDialog(
      'Des modifications n’ont pas pu être envoyées (pas de réseau ?). Si tu te déconnectes maintenant, elles seront perdues. Télécharge d’abord une sauvegarde depuis les Réglages, ou réessaie une fois connecté à internet.',
      'Se déconnecter quand même',
      true,
    );
    if (!force) return;
  }
  try {
    await signOut();
  } catch (err) {
    toast(errorMessage(err), { kind: 'error' });
    return;
  }
  clearLocalAfterSignOut();
  toast('Déconnecté.');
}

function openDeleteDialog(): void {
  const s = getSession();
  const input = h('input', { type: 'text', autocomplete: 'off', placeholder: 'SUPPRIMER' });
  const error = h('p', { class: 'form-error', role: 'alert', hidden: true });
  const submit = h('button', { class: 'btn btn--danger', type: 'submit' }, 'Supprimer définitivement');
  const form = h('form', { class: 'form', novalidate: true },
    h('p', null, 'Le compte ', h('b', null, s.email ?? ''), ' et toutes ses données en ligne seront effacés immédiatement. C’est irréversible.'),
    h('button', { class: 'btn btn--small', type: 'button', onclick: () => {
      downloadText(`plouf-sauvegarde-${fileStamp()}.json`, backupJson(getState()), 'application/json');
      toast('Sauvegarde téléchargée.', { kind: 'success' });
    } }, 'Télécharger d’abord une sauvegarde'),
    field('Pour confirmer, tape SUPPRIMER', input),
    error,
    h('div', { class: 'modal__actions' }, submit));
  const modal = openModal('Supprimer mon compte', form);
  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    if (input.value.trim().toUpperCase() !== 'SUPPRIMER') {
      error.textContent = 'Tape SUPPRIMER pour confirmer.';
      error.hidden = false;
      return;
    }
    submit.disabled = true;
    try {
      await deleteAccount();
      clearLocalAfterSignOut();
      modal.close();
      toast('Compte et données supprimés.', { kind: 'success' });
    } catch (err) {
      error.textContent = errorMessage(err);
      error.hidden = false;
      submit.disabled = false;
    }
  });
}

/* ---------- Conflit : deux versions différentes ---------- */

function summary(s: AppState): string {
  const plural = (n: number, w: string): string => `${n} ${w}${n > 1 ? 's' : ''}`;
  return [plural(s.players.length, 'joueur'), plural(s.matches.length, 'match'), plural(s.tournaments.length, 'tournoi')].join(' · ');
}

export function openConflictDialog(c: ConflictInfo): Promise<'cloud' | 'device' | 'later'> {
  return new Promise((resolve) => {
    let answered = false;
    const answer = (v: 'cloud' | 'device' | 'later'): void => {
      answered = true;
      modal.close();
      resolve(v);
    };
    const updated = timeFmt.format(new Date(c.remoteUpdatedAt));
    const content = h('div', { class: 'stack' },
      h('p', null, 'Les données de cet appareil et celles de ton espace en ligne sont différentes. Laquelle garder ? L’autre version sera remplacée.'),
      h('div', { class: 'conflict' },
        h('div', { class: 'conflict__opt' },
          h('h3', null, 'Cet appareil'),
          h('p', { class: 'muted' }, summary(c.local)),
          h('button', { class: 'btn btn--block', type: 'button', onclick: () => answer('device') }, 'Garder cet appareil')),
        h('div', { class: 'conflict__opt' },
          h('h3', null, 'En ligne'),
          h('p', { class: 'muted' }, summary(c.remote)),
          h('p', { class: 'hint' }, `Modifié le ${updated}`),
          h('button', { class: 'btn btn--primary btn--block', type: 'button', onclick: () => answer('cloud') }, 'Garder la version en ligne'))),
      h('button', { class: 'btn btn--ghost btn--small', type: 'button', onclick: () => {
        downloadText(`plouf-sauvegarde-appareil-${fileStamp()}.json`, backupJson(getState()), 'application/json');
        toast('Sauvegarde de cet appareil téléchargée.', { kind: 'success' });
      } }, 'Télécharger d’abord une sauvegarde de cet appareil'),
    );
    // Fermer sans choisir : rien n'est écrasé, la question reviendra à la prochaine synchro.
    const modal = openModal('Deux versions différentes', content, {
      wide: true,
      onClose: () => { if (!answered) resolve('later'); },
    });
  });
}

/* ---------- Mot de passe ---------- */

export function openPasswordDialog(fromRecovery: boolean): void {
  const pw = h('input', { type: 'password', autocomplete: 'new-password', minlength: 8 });
  const pw2 = h('input', { type: 'password', autocomplete: 'new-password', minlength: 8 });
  const error = h('p', { class: 'form-error', role: 'alert', hidden: true });
  const submit = h('button', { class: 'btn btn--primary', type: 'submit' }, 'Enregistrer le mot de passe');
  const form = h('form', { class: 'form', novalidate: true },
    fromRecovery ? h('p', null, 'Choisis ton nouveau mot de passe.') : null,
    field('Nouveau mot de passe', pw, '8 caractères minimum.'),
    field('Confirme-le', pw2),
    error,
    h('div', { class: 'modal__actions' }, submit));
  const modal = openModal(fromRecovery ? 'Nouveau mot de passe' : 'Changer le mot de passe', form, { onClose: () => { if (fromRecovery) dismissRecovery(); } });
  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const fail = (m: string): void => { error.textContent = m; error.hidden = false; };
    if (pw.value.length < 8) return fail('8 caractères minimum.');
    if (pw.value !== pw2.value) return fail('Les deux mots de passe ne correspondent pas.');
    submit.disabled = true;
    try {
      await updatePassword(pw.value);
      modal.close();
      toast('Mot de passe enregistré.', { kind: 'success' });
    } catch (err) {
      fail(errorMessage(err));
    } finally {
      submit.disabled = false;
    }
  });
}
