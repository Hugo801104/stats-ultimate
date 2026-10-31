import { POSITION_LABELS } from '../../labels';
import { computePlayerStats } from '../../stats';
import { getState } from '../../store';
import { formatDateFr, signed } from '../../util';
import { emptyState } from '../components';
import { h, icon } from '../dom';
import type { View } from '../router';
import { seasonTable } from './stats';

export function playerView(params: Record<string, string>): View {
  const st = getState();
  const player = st.players.find((p) => p.id === params.id);
  if (!player) {
    return { el: h('div', { class: 'page' }, emptyState('Joueur introuvable', 'Il a peut-être été supprimé.', h('a', { class: 'btn btn--primary', href: '#/effectif' }, 'Effectif'))) };
  }
  const career = computePlayerStats(st.matches).get(player.id);
  const perMatch = st.matches
    .map((m) => ({ m, s: computePlayerStats([m]).get(player.id) }))
    .filter((x): x is { m: typeof x.m; s: NonNullable<typeof x.s> } => !!x.s && (x.s.pointsPlayed > 0 || x.s.matches > 0))
    .sort((a, b) => b.m.date.localeCompare(a.m.date) || b.m.createdAt - a.m.createdAt);

  const kpi = (label: string, value: string | number): HTMLElement =>
    h('div', { class: 'kpi' }, h('div', { class: 'kpi__value' }, value), h('div', { class: 'kpi__label' }, label));

  const el = h('div', { class: 'page page--wide' },
    h('header', { class: 'page-head' },
      h('a', { class: 'btn btn--ghost btn--icon', href: '#/stats', 'aria-label': 'Retour aux statistiques' }, icon('back')),
      h('div', { class: 'page-head__title' },
        h('h1', null, player.number !== null ? `#${player.number} ${player.name}` : player.name),
        h('p', { class: 'muted' }, POSITION_LABELS[player.position] + (player.active ? '' : ' · archivé'))),
    ),
  );

  if (!career || (career.pointsPlayed === 0 && career.matches === 0)) {
    el.appendChild(emptyState('Pas encore de stats', 'Ce joueur n’a pas encore joué de point enregistré.'));
    return { el };
  }

  el.appendChild(h('div', { class: 'kpis' },
    kpi('Matchs', career.matches), kpi('Points joués', career.pointsPlayed), kpi('Buts', career.goals), kpi('Passes D', career.assists),
    kpi('Défenses', career.defenses), kpi('Disques perdus', career.turnovers), kpi('Plus-minus', signed(career.plusMinus)),
  ));
  el.appendChild(h('div', { class: 'two-col' },
    h('section', { class: 'card' }, h('h3', null, 'Saison par saison'), seasonTable(st, player.id)),
    h('section', { class: 'card' },
      h('h3', null, 'Match par match'),
      h('div', { class: 'table-wrap' }, h('table', { class: 'table' },
        h('thead', null, h('tr', null, h('th', null, 'Rencontre'), ['Pts', 'B', 'PD', 'D', 'Pertes', '+/-'].map((x) => h('th', { class: 'num' }, x)))),
        h('tbody', null, perMatch.map(({ m, s }) => h('tr', null,
          h('td', null, h('a', { href: `#/match/${m.id}` }, `${formatDateFr(m.date)} · ${m.opponent || 'Entr.'}`)),
          h('td', { class: 'num' }, s.pointsPlayed), h('td', { class: 'num' }, s.goals), h('td', { class: 'num' }, s.assists),
          h('td', { class: 'num' }, s.defenses), h('td', { class: 'num' }, s.turnovers),
          h('td', { class: `num ${s.plusMinus > 0 ? 'pos' : s.plusMinus < 0 ? 'neg' : ''}` }, signed(s.plusMinus))))))),
    ),
  ));
  return { el };
}
