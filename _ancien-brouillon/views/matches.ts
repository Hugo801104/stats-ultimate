// filepath: src/views/matches.ts
import * as actions from '../actions';
import { emptyState, h } from '../dom';
import { TEAM_NAME, formatDate, todayIso } from '../format';
import { matchScore } from '../stats';
import { getData } from '../store';
import type { Match } from '../types';

export function matchesView(): HTMLElement {
  const data = getData();
  const sections = [...data.seasons].reverse().map((season) => {
    const matches = data.matches
      .filter((m) => m.seasonId === season.id)
      .sort((a, b) => b.date.localeCompare(a.date));
    if (matches.length === 0) return null;
    return h('section', { class: 'group' }, h('h2', {}, `Saison ${season.name}`), h('ul', { class: 'list' }, ...matches.map(matchRow)));
  });

  return h(
    'section',
    { class: 'page' },
    h('header', { class: 'page-head' }, h('h1', {}, 'Matchs'), h('a', { class: 'btn primary', href: '#/match/new' }, 'Nouveau match')),
    data.matches.length === 0
      ? emptyState(
          data.players.length === 0
            ? 'Aucun match pour l\'instant. Commence par ajouter ton effectif, puis lance un match.'
            : 'Aucun match pour l\'instant. Lance le premier !',
          data.players.length === 0 ? h('a', { class: 'btn', href: '#/roster' }, 'Ajouter les joueurs') : null,
        )
      : h('div', {}, ...sections),
  );
}

function matchRow(match: Match): HTMLElement {
  const { us, them } = matchScore(match);
  const meta = [formatDate(match.date), match.tournament, match.location].filter(Boolean).join(' · ');
  return h(
    'li',
    {},
    h(
      'a',
      { class: 'row-link', href: `#/match/${match.id}` },
      h('span', { class: 'row-main' }, h('strong', {}, `${TEAM_NAME} vs ${match.opponent}`), h('small', {}, meta)),
      h('span', { class: 'row-side' }, h('strong', { class: 'score' }, `${us} – ${them}`), h('small', { class: match.finished ? 'badge' : 'badge live' }, match.finished ? 'Terminé' : 'En cours')),
    ),
  );
}

export function newMatchView(): HTMLElement {
  const data = getData();
  const hasPlayers = data.players.some((p) => p.active);

  const season = h('select', { id: 'season', value: data.currentSeasonId }, ...data.seasons.map((s) => h('option', { value: s.id }, s.name)));
  const date = h('input', { id: 'date', type: 'date', required: true, value: todayIso() });
  const opponent = h('input', { id: 'opponent', type: 'text', required: true, maxlength: 60, value: 'Entraînement', placeholder: 'Adversaire' });
  const tournament = h('input', { id: 'tournament', type: 'text', maxlength: 60, placeholder: 'Optionnel' });
  const location = h('input', { id: 'location', type: 'text', maxlength: 60, value: 'La Chevrolière' });
  const error = h('p', { class: 'error', role: 'alert' });

  const form = h(
    'form',
    {
      class: 'form',
      onsubmit: (e: Event) => {
        e.preventDefault();
        if (!opponent.value.trim() || !date.value) {
          error.textContent = 'La date et l\'adversaire sont obligatoires.';
          return;
        }
        const id = actions.createMatch({
          seasonId: season.value,
          date: date.value,
          opponent: opponent.value,
          tournament: tournament.value,
          location: location.value,
        });
        location_hash(`#/match/${id}`);
      },
    },
    field('Saison', 'season', season),
    field('Date', 'date', date),
    field('Adversaire', 'opponent', opponent),
    field('Tournoi', 'tournament', tournament),
    field('Lieu', 'location', location),
    error,
    h('div', { class: 'row' }, h('button', { type: 'submit', class: 'btn primary', disabled: !hasPlayers }, 'Commencer le match'), h('a', { class: 'btn', href: '#/' }, 'Annuler')),
  );

  return h(
    'section',
    { class: 'page narrow' },
    h('header', { class: 'page-head' }, h('h1', {}, 'Nouveau match')),
    hasPlayers ? null : h('p', { class: 'notice' }, 'Ajoute d\'abord des joueurs dans ', h('a', { href: '#/roster' }, 'l\'effectif'), '.'),
    form,
  );
}

function location_hash(hash: string): void {
  window.location.hash = hash;
}

function field(label: string, id: string, control: HTMLElement): HTMLElement {
  return h('div', { class: 'field' }, h('label', { for: id }, label), control);
}
