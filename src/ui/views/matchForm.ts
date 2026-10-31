import { getState, update } from '../../store';
import { sortPlayers } from '../../exporters';
import type { Match, MatchKind } from '../../types';
import { isISODate, todayISO, uid } from '../../util';
import { errorMessage, field, openModal, playerLabel, segmented, toast } from '../components';
import { h } from '../dom';
import { navigate } from '../router';

/** Création / édition d'un match ou d'un entraînement. */
export function openMatchForm(existing?: Match): void {
  const st = getState();
  const players = sortPlayers(st.players.filter((p) => p.active || existing?.presentIds.includes(p.id)));
  const draft = {
    kind: (existing?.kind ?? 'match') as MatchKind,
    date: existing?.date ?? todayISO(),
    opponent: existing?.opponent ?? '',
    tournament: existing?.tournament ?? '',
    location: existing?.location ?? '',
    present: new Set(existing?.presentIds ?? players.map((p) => p.id)),
  };

  const uniq = (pick: (m: Match) => string): string[] =>
    [...new Set(st.matches.map(pick).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'fr'));

  const error = h('p', { class: 'form-error', role: 'alert', hidden: true });
  const kindHost = h('div');
  const renderKind = (): void => {
    kindHost.replaceChildren(
      segmented<MatchKind>(
        'Type',
        [{ value: 'match', label: 'Match' }, { value: 'entrainement', label: 'Entraînement' }],
        draft.kind,
        (v) => { draft.kind = v; renderKind(); },
      ),
    );
  };
  renderKind();

  const date = h('input', { type: 'date', value: draft.date, required: true, oninput: (e: Event) => { draft.date = (e.target as HTMLInputElement).value; } });
  const opponent = h('input', { type: 'text', value: draft.opponent, list: 'dl-opp', placeholder: 'Équipe adverse', autocomplete: 'off', oninput: (e: Event) => { draft.opponent = (e.target as HTMLInputElement).value; } });
  const tournament = h('input', { type: 'text', value: draft.tournament, list: 'dl-tour', placeholder: 'Optionnel', autocomplete: 'off', oninput: (e: Event) => { draft.tournament = (e.target as HTMLInputElement).value; } });
  const location = h('input', { type: 'text', value: draft.location, list: 'dl-loc', placeholder: 'Optionnel', autocomplete: 'off', oninput: (e: Event) => { draft.location = (e.target as HTMLInputElement).value; } });

  const presentHost = h('div', { class: 'chips' });
  const counter = h('span', { class: 'hint' });
  const renderPresent = (): void => {
    counter.textContent = `${draft.present.size} présent${draft.present.size > 1 ? 's' : ''}`;
    presentHost.replaceChildren(
      ...players.map((p) =>
        h(
          'button',
          {
            type: 'button',
            class: `chip ${draft.present.has(p.id) ? 'is-on' : ''}`,
            'aria-pressed': draft.present.has(p.id) ? 'true' : 'false',
            onclick: () => {
              if (draft.present.has(p.id)) draft.present.delete(p.id);
              else draft.present.add(p.id);
              renderPresent();
            },
          },
          playerLabel(p),
        ),
      ),
    );
  };
  renderPresent();

  const datalists = [
    h('datalist', { id: 'dl-opp' }, uniq((m) => m.opponent).map((v) => h('option', { value: v }))),
    h('datalist', { id: 'dl-tour' }, uniq((m) => m.tournament).map((v) => h('option', { value: v }))),
    h('datalist', { id: 'dl-loc' }, uniq((m) => m.location).map((v) => h('option', { value: v }))),
  ];

  const form = h(
    'form',
    { class: 'form', novalidate: true },
    kindHost,
    field('Date', date),
    field('Adversaire', opponent, 'Pour un entraînement : nom de l’autre équipe, ou laisse vide.'),
    h('div', { class: 'grid-2' }, field('Tournoi', tournament), field('Lieu', location)),
    h(
      'div',
      { class: 'field' },
      h('div', { class: 'field__row' }, h('label', null, 'Joueurs présents'), counter),
      players.length === 0
        ? h('p', { class: 'hint' }, 'Aucun joueur dans l’effectif : ajoute-les d’abord dans l’onglet Effectif.')
        : [
            h('div', { class: 'inline-actions' },
              h('button', { type: 'button', class: 'btn btn--small', onclick: () => { players.forEach((p) => draft.present.add(p.id)); renderPresent(); } }, 'Tous'),
              h('button', { type: 'button', class: 'btn btn--small', onclick: () => { draft.present.clear(); renderPresent(); } }, 'Aucun'),
            ),
            presentHost,
          ],
    ),
    error,
    h(
      'div',
      { class: 'modal__actions' },
      h('button', { class: 'btn btn--primary btn--block', type: 'submit' }, existing ? 'Enregistrer' : 'Créer et démarrer la saisie'),
    ),
    ...datalists,
  );

  const modal = openModal(existing ? 'Modifier le match' : 'Nouveau match', form);

  form.addEventListener('submit', (ev) => {
    ev.preventDefault();
    const fail = (msg: string): void => { error.textContent = msg; error.hidden = false; };
    if (!isISODate(draft.date)) return fail('Choisis une date valide.');
    if (draft.present.size === 0) return fail('Sélectionne au moins un joueur présent.');
    const clean = {
      kind: draft.kind,
      date: draft.date,
      opponent: draft.opponent.trim() || (draft.kind === 'entrainement' ? 'Équipe B' : ''),
      tournament: draft.tournament.trim(),
      location: draft.location.trim(),
      presentIds: [...draft.present],
    };
    if (clean.kind === 'match' && !clean.opponent) return fail('Indique l’adversaire.');
    try {
      let newId = '';
      update((s) => {
        if (existing) {
          const m = s.matches.find((x) => x.id === existing.id);
          if (!m) throw new Error('Match introuvable.');
          Object.assign(m, clean);
        } else {
          newId = uid();
          s.matches.push({
            id: newId, seasonId: s.settings.currentSeasonId, ...clean, status: 'en_cours', points: [], createdAt: Date.now(),
          });
        }
      });
      modal.close();
      if (newId) navigate(`/live/${newId}`);
      else toast('Match mis à jour.', { kind: 'success' });
    } catch (err) {
      fail(errorMessage(err));
    }
  });
}
