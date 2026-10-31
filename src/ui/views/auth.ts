// Écran d'accueil non connecté : connexion, création de compte, mot de passe oublié, ou mode sans compte.

import { clearNotice, continueWithoutAccount, getSession, sendPasswordReset, signIn, signUp } from '../../cloud/session';
import { errorMessage, segmented } from '../components';
import { h } from '../dom';
import { legalLinks } from './legal';

type Tab = 'connexion' | 'inscription' | 'oubli';

const ui: { tab: Tab; email: string; info: string | null } = { tab: 'connexion', email: '', info: null };

export function authView(rerender: () => void): HTMLElement {
  const session = getSession();
  const error = h('p', { class: 'form-error', role: 'alert', hidden: !session.notice }, session.notice ?? '');
  const info = ui.info ? h('p', { class: 'auth__info', role: 'status' }, ui.info) : null;

  const email = h('input', {
    type: 'email', autocomplete: 'email', inputmode: 'email', required: true, value: ui.email, placeholder: 'toi@exemple.fr',
    oninput: (e: Event) => { ui.email = (e.target as HTMLInputElement).value; },
  });
  const password = h('input', {
    type: 'password', required: true, minlength: 8,
    autocomplete: ui.tab === 'inscription' ? 'new-password' : 'current-password',
    placeholder: ui.tab === 'inscription' ? '8 caractères minimum' : '',
  });
  const confirm = h('input', { type: 'password', autocomplete: 'new-password', required: true, minlength: 8 });
  const consent = h('input', { type: 'checkbox', required: true, id: 'auth-consent' });

  const submit = h('button', { class: 'btn btn--primary btn--block btn--xl', type: 'submit' },
    ui.tab === 'connexion' ? 'Se connecter' : ui.tab === 'inscription' ? 'Créer mon compte' : 'Envoyer le lien');

  const showError = (msg: string): void => {
    error.textContent = msg;
    error.hidden = false;
  };

  const form = h('form', { class: 'form', novalidate: true },
    h('div', { class: 'field' }, h('label', { for: 'auth-email' }, 'Adresse e-mail'), Object.assign(email, { id: 'auth-email' })),
    ui.tab !== 'oubli'
      ? h('div', { class: 'field' }, h('label', { for: 'auth-pw' }, 'Mot de passe'), Object.assign(password, { id: 'auth-pw' }))
      : h('p', { class: 'hint' }, 'Tu recevras un lien pour choisir un nouveau mot de passe.'),
    ui.tab === 'inscription'
      ? h('div', { class: 'field' }, h('label', { for: 'auth-pw2' }, 'Confirme le mot de passe'), Object.assign(confirm, { id: 'auth-pw2' }))
      : null,
    ui.tab === 'inscription'
      ? h('label', { class: 'check auth__consent', for: 'auth-consent' }, consent,
        h('span', null, 'J’accepte les ', h('a', { href: '#/conditions' }, 'conditions d’utilisation'), ' et j’ai lu la ', h('a', { href: '#/confidentialite' }, 'politique de confidentialité'), '.'))
      : null,
    error,
    info,
    submit,
  );

  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    clearNotice();
    error.hidden = true;
    const mail = email.value.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mail)) return showError('Adresse e-mail invalide.');
    if (ui.tab !== 'oubli' && password.value.length < 8) return showError('Le mot de passe doit faire au moins 8 caractères.');
    if (ui.tab === 'inscription' && password.value !== confirm.value) return showError('Les deux mots de passe ne correspondent pas.');
    if (ui.tab === 'inscription' && !consent.checked) return showError('Pour créer un compte, accepte les conditions d’utilisation.');
    submit.disabled = true;
    submit.textContent = 'Un instant…';
    try {
      if (ui.tab === 'connexion') {
        await signIn(mail, password.value);
        ui.info = null; // la session change : l'appli s'affiche
      } else if (ui.tab === 'inscription') {
        const active = await signUp(mail, password.value);
        if (!active) {
          ui.tab = 'connexion';
          ui.info = `Compte créé ! Clique sur le lien envoyé à ${mail} pour l’activer, puis connecte-toi.`;
          rerender();
        }
      } else {
        await sendPasswordReset(mail);
        ui.tab = 'connexion';
        ui.info = `Si un compte existe pour ${mail}, un lien de réinitialisation vient d’être envoyé.`;
        rerender();
      }
    } catch (err) {
      showError(errorMessage(err));
    } finally {
      submit.disabled = false;
      submit.textContent = ui.tab === 'connexion' ? 'Se connecter' : ui.tab === 'inscription' ? 'Créer mon compte' : 'Envoyer le lien';
    }
  });

  const switchTab = (t: Tab): void => {
    ui.tab = t;
    ui.info = null;
    clearNotice();
    rerender();
  };

  return h('div', { class: 'auth' },
    h('div', { class: 'auth__card' },
      h('div', { class: 'auth__brand' }, h('span', { class: 'auth__logo', 'aria-hidden': 'true' }, '🥏'), h('div', null, h('h1', null, 'Stats Ultimate'), h('p', { class: 'muted' }, 'Les Plouf'))),
      h('p', { class: 'auth__pitch' }, 'Connecte-toi pour retrouver tes matchs, tournois et stats sur tous tes appareils. Tout reste utilisable hors-ligne.'),
      ui.tab === 'oubli'
        ? h('div', { class: 'auth__back' }, h('button', { class: 'btn btn--ghost btn--small', type: 'button', onclick: () => switchTab('connexion') }, '← Retour à la connexion'), h('h2', null, 'Mot de passe oublié'))
        : segmented<Tab>('Connexion ou inscription', [{ value: 'connexion', label: 'Se connecter' }, { value: 'inscription', label: 'Créer un compte' }], ui.tab, switchTab),
      form,
      ui.tab === 'connexion' ? h('button', { class: 'btn btn--ghost btn--small auth__forgot', type: 'button', onclick: () => switchTab('oubli') }, 'Mot de passe oublié ?') : null,
      h('div', { class: 'auth__sep' }, h('span', null, 'ou')),
      h('button', { class: 'btn btn--block', type: 'button', onclick: () => continueWithoutAccount() }, 'Continuer sans compte'),
      h('p', { class: 'hint center' }, 'Sans compte, les données restent dans ce navigateur. Tu pourras te connecter plus tard depuis les Réglages : elles seront alors envoyées dans ton espace.'),
    ),
    legalLinks(),
  );
}
