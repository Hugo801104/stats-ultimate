import { getScore } from '../../match';
import { matchResult } from '../../stats';
import { getState, update } from '../../store';
import type { Match } from '../../types';
import { formatDateFr } from '../../util';
import { emptyState, pageHeader } from '../components';
import { h, icon } from '../dom';
import type { View } from '../router';
import { openMatchForm } from './matchForm';

export function matchCard(m: Match): HTMLElement {
  const { pour, contre } = getScore(m);
  const result = matchResult(m);
  const live = m.status === 'en_cours';
  const sub = [m.kind === 'entrainement' ? 'Entraînement' : '', m.tournament, m.location].filter(Boolean).join(' · ');
  return h(
    'a',
    { class: `card match-card ${live ? 'is-live' : ''}`, href: live ? `#/live/${m.id}` : `#/match/${m.id}` },
    h(
      'div',
      { class: 'match-card__main' },
      h('div', { class: 'match-card__date' }, formatDateFr(m.date)),
      h('div', { class: 'match-card__title' }, `vs ${m.opponent || 'Entraînement'}`),
      sub ? h('div', { class: 'match-card__sub' }, sub) : null,
    ),
    h(
      'div',
      { class: 'match-card__score' },
      h('span', { class: `score ${result ? `score--${result}` : ''}` }, `${pour} – ${contre}`),
      live
        ? h('span', { class: 'badge badge--live' }, 'En cours')
        : result
          ? h('span', { class: `badge badge--${result}` }, result === 'victoire' ? 'Victoire' : result === 'defaite' ? 'Défaite' : 'Nul')
          : null,
    ),
  );
}

export function matchesView(): View {
  const st = getState();
  const season = st.seasons.find((s) => s.id === st.settings.currentSeasonId) ?? st.seasons[0]!;
  const matches = st.matches
    .filter((m) => m.seasonId === season.id)
    .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt);
  const ongoing = matches.find((m) => m.status === 'en_cours');

  const seasonSelect = h(
    'select',
    {
      'aria-label': 'Saison',
      value: season.id,
      onchange: (e: Event) => {
        const id = (e.target as HTMLSelectElement).value;
        update((s) => { s.settings.currentSeasonId = id; });
      },
    },
    st.seasons.map((s) => h('option', { value: s.id }, `Saison ${s.name}`)),
  );

  const newBtn = h('button', { class: 'btn btn--primary', type: 'button', onclick: () => openMatchForm() }, icon('plus', 18), ' Nouveau match');

  const el = h('div', { class: 'page' }, pageHeader('Matchs', seasonSelect, newBtn));

  if (ongoing) {
    el.appendChild(
      h('a', { class: 'banner', href: `#/live/${ongoing.id}` }, h('strong', null, 'Saisie en cours'), ` · vs ${ongoing.opponent} — reprendre`),
    );
  }

  if (st.players.length === 0) {
    el.appendChild(
      emptyState(
        'Commence par l’effectif',
        'Ajoute tes joueurs (nom, numéro, poste) avant de saisir un match. Tu peux aussi charger des données d’exemple dans les réglages.',
        h('a', { class: 'btn btn--primary', href: '#/effectif' }, 'Aller à l’effectif'),
      ),
    );
  } else if (matches.length === 0) {
    el.appendChild(
      emptyState('Aucun match cette saison', 'Crée un match ou un entraînement pour lancer la saisie.', h('button', { class: 'btn btn--primary', type: 'button', onclick: () => openMatchForm() }, 'Nouveau match')),
    );
  } else {
    el.appendChild(h('div', { class: 'list' }, matches.map(matchCard)));
  }
  return { el };
}
