// Écran d'analyse : synthèse, tableau joueurs, équipe & lignes, comparaison de saisons.
// Même code que sur téléphone ; la mise en page s'élargit sur ordinateur (CSS).

import { playerName, sortPlayers, statsCsv, pointsCsv } from '../../exporters';
import {
  breakPct, computePlayerStats, computeTeamStats, filterMatches, holdPct, matchResult, playerSeasonRows, rankBy,
  type PlayerStats, type StatKey, type StatsFilter,
} from '../../stats';
import { getState } from '../../store';
import type { AppState, MatchKind, Player } from '../../types';
import { formatPct, signed } from '../../util';
import { LINE_LABELS } from '../../labels';
import { emptyState, pageHeader, segmented } from '../components';
import { h } from '../dom';
import { downloadText, fileStamp } from '../files';
import { requestRender, type View } from '../router';

type Tab = 'synthese' | 'joueurs' | 'equipe' | 'saisons';

const ui: {
  tab: Tab;
  seasonId: string | 'all' | null; // null = saison courante
  kind: MatchKind | 'all';
  sort: { key: StatKey | 'name'; dir: 'asc' | 'desc' };
  seasonPlayerId: string | null;
} = { tab: 'synthese', seasonId: null, kind: 'all', sort: { key: 'plusMinus', dir: 'desc' }, seasonPlayerId: null };

const COLUMNS: { key: StatKey; label: string; title: string }[] = [
  { key: 'matches', label: 'M', title: 'Matchs joués' },
  { key: 'pointsPlayed', label: 'Pts', title: 'Points joués' },
  { key: 'goals', label: 'B', title: 'Buts' },
  { key: 'assists', label: 'PD', title: 'Passes décisives' },
  { key: 'defenses', label: 'D', title: 'Défenses' },
  { key: 'turnovers', label: 'Pertes', title: 'Disques perdus (lancers ratés + drops)' },
  { key: 'pulls', label: 'Pulls', title: 'Pulls' },
  { key: 'plusMinus', label: '+/-', title: 'Plus-minus = buts + passes D + défenses − disques perdus' },
  { key: 'onFieldDiff', label: '±Éq.', title: 'Différence de points de l’équipe quand le joueur est sur le terrain' },
];

export function currentFilter(st: AppState): StatsFilter {
  return { seasonId: ui.seasonId ?? st.settings.currentSeasonId, kind: ui.kind };
}

export function statsView(): View {
  const st = getState();
  const filter = currentFilter(st);
  const matches = filterMatches(st.matches, filter);
  const statsMap = computePlayerStats(matches);
  const tie = (a: PlayerStats, b: PlayerStats): number => playerName(st.players, a.playerId).localeCompare(playerName(st.players, b.playerId), 'fr');

  const seasonSel = h('select', { 'aria-label': 'Saison', value: filter.seasonId, onchange: (e: Event) => { ui.seasonId = (e.target as HTMLSelectElement).value; requestRender(); } },
    h('option', { value: 'all' }, 'Toutes les saisons'),
    st.seasons.map((s) => h('option', { value: s.id }, `Saison ${s.name}`)));
  const kindSel = h('select', { 'aria-label': 'Type de rencontre', value: ui.kind, onchange: (e: Event) => { ui.kind = (e.target as HTMLSelectElement).value as MatchKind | 'all'; requestRender(); } },
    h('option', { value: 'all' }, 'Matchs + entraînements'), h('option', { value: 'match' }, 'Matchs seulement'), h('option', { value: 'entrainement' }, 'Entraînements seulement'));

  const el = h('div', { class: 'page page--wide' },
    pageHeader('Statistiques', seasonSel, kindSel),
    segmented<Tab>('Vue', [
      { value: 'synthese', label: 'Synthèse' }, { value: 'joueurs', label: 'Joueurs' },
      { value: 'equipe', label: 'Équipe & lignes' }, { value: 'saisons', label: 'Saisons' },
    ], ui.tab, (v) => { ui.tab = v; requestRender(); }),
  );

  if (st.matches.length === 0) {
    el.appendChild(emptyState('Pas encore de données', 'Les stats apparaissent dès le premier point saisi. Tu peux aussi charger des données d’exemple dans les réglages.', h('a', { class: 'btn btn--primary', href: '#/reglages' }, 'Réglages')));
    return { el };
  }
  if (matches.length === 0 && ui.tab !== 'saisons') {
    el.appendChild(emptyState('Rien pour ce filtre', 'Aucun match ne correspond à la saison et au type choisis.'));
    return { el };
  }

  const players = st.players;
  const rows = [...statsMap.values()].filter((s) => s.pointsPlayed > 0 || s.turnovers + s.defenses + s.pulls + s.goals + s.assists > 0);

  if (ui.tab === 'synthese') el.appendChild(synthese(st, matches, rows, tie));
  else if (ui.tab === 'joueurs') el.appendChild(playersTable(players, rows));
  else if (ui.tab === 'equipe') el.appendChild(teamTab(st, matches, rows, tie));
  else el.appendChild(seasonsTab(st));

  el.appendChild(
    h('div', { class: 'inline-actions export-row' },
      h('button', { class: 'btn btn--small', type: 'button', onclick: () => downloadText(`stats-joueurs-${fileStamp()}.csv`, statsCsv(sortPlayers(players), statsMap), 'text/csv') }, 'Exporter ces stats (CSV)'),
      h('button', { class: 'btn btn--small', type: 'button', onclick: () => downloadText(`points-${fileStamp()}.csv`, pointsCsv({ ...st, matches }), 'text/csv') }, 'Exporter les points (CSV)'),
    ),
  );
  return { el };
}

/* ---------- Synthèse ---------- */

function kpi(label: string, value: string, sub?: string): HTMLElement {
  return h('div', { class: 'kpi' }, h('div', { class: 'kpi__value' }, value), h('div', { class: 'kpi__label' }, label), sub ? h('div', { class: 'kpi__sub' }, sub) : null);
}

function board(title: string, hint: string, items: { id: string; value: number }[], players: Player[], format: (n: number) => string = String): HTMLElement {
  const max = Math.max(1, ...items.map((i) => Math.abs(i.value)));
  return h('section', { class: 'board card' },
    h('h3', null, title), h('p', { class: 'hint' }, hint),
    items.length === 0 ? h('p', { class: 'muted' }, 'Rien à afficher.') :
      h('ol', { class: 'bars' }, items.map((i, idx) =>
        h('li', null,
          h('span', { class: 'bars__rank' }, idx + 1),
          h('a', { class: 'bars__name', href: `#/joueur/${i.id}` }, playerName(players, i.id)),
          h('span', { class: 'bars__track', 'aria-hidden': 'true' }, h('span', { class: `bars__fill ${i.value < 0 ? 'is-neg' : ''}`, style: `width:${Math.max(4, (Math.abs(i.value) / max) * 100)}%` })),
          h('span', { class: 'bars__val' }, format(i.value)))))
  );
}

function synthese(st: AppState, matches: ReturnType<typeof filterMatches>, rows: PlayerStats[], tie: (a: PlayerStats, b: PlayerStats) => number): HTMLElement {
  const t = computeTeamStats(matches);
  const top = (key: StatKey, dir: 'desc' | 'asc' = 'desc', min = 1): { id: string; value: number }[] =>
    rankBy(rows, key, tie, dir).filter((s) => (key === 'plusMinus' ? s.pointsPlayed > 0 : s[key] >= min)).slice(0, 5).map((s) => ({ id: s.playerId, value: s[key] }));
  const record = `${t.wins}V · ${t.draws}N · ${t.losses}D`;
  return h('div', { class: 'stack' },
    h('div', { class: 'kpis' },
      kpi('Rencontres', String(t.matches), record),
      kpi('Points', `${t.pointsFor} – ${t.pointsAgainst}`, signed(t.pointsFor - t.pointsAgainst)),
      kpi('Conversion en attaque', formatPct(holdPct(t)), `${t.holds}/${t.holdAttempts} points tenus`),
      kpi('Breaks en défense', formatPct(breakPct(t)), `${t.breaks}/${t.breakAttempts} points pris`),
      kpi('Disques perdus / point', t.turnoversPerPoint === null ? '—' : String(t.turnoversPerPoint), `${t.throwaways} lancers · ${t.drops} drops`),
    ),
    h('div', { class: 'boards' },
      board('Buteurs', 'Buts marqués', top('goals'), st.players),
      board('Passeurs', 'Passes décisives', top('assists'), st.players),
      board('Défenseurs', 'Défenses (D)', top('defenses'), st.players),
      board('Plus-minus', 'Buts + passes D + D − pertes', top('plusMinus'), st.players, signed),
      board('Disques perdus', 'Lancers ratés + drops (à réduire)', top('turnovers'), st.players),
      board('Temps de jeu', 'Points joués', top('pointsPlayed'), st.players),
    ),
  );
}

/* ---------- Tableau joueurs ---------- */

function playersTable(players: Player[], rows: PlayerStats[]): HTMLElement {
  const { key, dir } = ui.sort;
  const nameOf = (id: string): string => playerName(players, id);
  const byName = (a: PlayerStats, b: PlayerStats): number => nameOf(a.playerId).localeCompare(nameOf(b.playerId), 'fr');
  const sorted = [...rows].sort((a, b) => {
    if (key === 'name') return dir === 'asc' ? byName(a, b) : -byName(a, b);
    const diff = a[key] - b[key];
    return (dir === 'desc' ? -diff : diff) || byName(a, b);
  });

  const th = (label: string, k: StatKey | 'name', title: string, cls = ''): HTMLElement => {
    const active = ui.sort.key === k;
    return h('th', { class: `${cls} sortable`, 'aria-sort': active ? (ui.sort.dir === 'asc' ? 'ascending' : 'descending') : 'none' },
      h('button', { type: 'button', title, class: 'sortbtn', onclick: () => {
        ui.sort = { key: k, dir: active && ui.sort.dir === 'desc' ? 'asc' : 'desc' };
        requestRender();
      } }, label, active ? (ui.sort.dir === 'desc' ? ' ▾' : ' ▴') : ''));
  };
  if (sorted.length === 0) return emptyState('Aucun joueur avec des stats', 'Saisis des points pour voir apparaître le tableau.');
  return h('div', { class: 'table-wrap table-wrap--tall' },
    h('table', { class: 'table table--sticky' },
      h('thead', null, h('tr', null, th('Joueur', 'name', 'Trier par nom'), COLUMNS.map((c) => th(c.label, c.key, c.title, 'num')))),
      h('tbody', null, sorted.map((s) => h('tr', null,
        h('td', null, h('a', { href: `#/joueur/${s.playerId}` }, nameOf(s.playerId))),
        COLUMNS.map((c) => {
          const v = s[c.key];
          const signedCol = c.key === 'plusMinus' || c.key === 'onFieldDiff';
          return h('td', { class: `num ${signedCol ? (v > 0 ? 'pos' : v < 0 ? 'neg' : '') : ''}` }, signedCol ? signed(v) : v);
        }))))),
  );
}

/* ---------- Équipe & lignes ---------- */

function teamTab(st: AppState, matches: ReturnType<typeof filterMatches>, rows: PlayerStats[], tie: (a: PlayerStats, b: PlayerStats) => number): HTMLElement {
  const t = computeTeamStats(matches);
  const lineRow = (type: 'attaque' | 'defense' | 'mixte'): HTMLElement => {
    const l = t.byLine[type];
    return h('tr', null, h('td', null, LINE_LABELS[type]), h('td', { class: 'num' }, l.points), h('td', { class: 'num' }, l.pour), h('td', { class: 'num' }, l.contre),
      h('td', { class: `num ${l.pour - l.contre > 0 ? 'pos' : l.pour - l.contre < 0 ? 'neg' : ''}` }, signed(l.pour - l.contre)), h('td', { class: 'num' }, formatPct(l.points ? Math.round((l.pour / l.points) * 100) : null)));
  };

  const losers = rankBy(rows, 'turnovers', tie).filter((s) => s.turnovers > 0).slice(0, 8);
  const maxLoss = Math.max(1, ...losers.map((s) => s.turnovers));

  const perMatch = [...matches].sort((a, b) => a.date.localeCompare(b.date)).map((m) => {
    const ms = computeTeamStats([m]);
    const played = ms.pointsFor + ms.pointsAgainst;
    return { m, turnovers: ms.turnovers, per: played ? ms.turnovers / played : 0, result: matchResult(m) };
  }).filter((x) => x.m.points.length > 0);
  const maxPer = Math.max(0.1, ...perMatch.map((x) => x.per));

  return h('div', { class: 'two-col' },
    h('section', { class: 'card' },
      h('h3', null, 'Lignes'),
      h('p', { class: 'hint' }, 'Résultat des points selon le type de ligne alignée.'),
      h('div', { class: 'table-wrap' }, h('table', { class: 'table' },
        h('thead', null, h('tr', null, ['Ligne', 'Pts', 'Pour', 'Contre', '±', 'Réussite'].map((x, i) => h('th', { class: i ? 'num' : '' }, x)))),
        h('tbody', null, (['attaque', 'defense', 'mixte'] as const).map(lineRow)))),
      h('div', { class: 'kpis kpis--tight' },
        kpi('Points tenus en attaque', formatPct(holdPct(t)), `${t.holds}/${t.holdAttempts}`),
        kpi('Breaks en défense', formatPct(breakPct(t)), `${t.breaks}/${t.breakAttempts}`)),
    ),
    h('section', { class: 'card' },
      h('h3', null, 'Où l’équipe perd des disques'),
      h('p', { class: 'hint' }, `${t.turnovers} disques perdus : ${t.throwaways} lancers ratés, ${t.drops} drops.`),
      losers.length === 0 ? h('p', { class: 'muted' }, 'Aucun disque perdu saisi.') :
        h('ol', { class: 'bars bars--stack' }, losers.map((s) => h('li', null,
          h('a', { class: 'bars__name', href: `#/joueur/${s.playerId}` }, playerName(st.players, s.playerId)),
          h('span', { class: 'bars__track', 'aria-hidden': 'true' },
            h('span', { class: 'bars__fill is-throw', style: `width:${(s.throwaways / maxLoss) * 100}%` }),
            h('span', { class: 'bars__fill is-drop', style: `width:${(s.drops / maxLoss) * 100}%` })),
          h('span', { class: 'bars__val' }, `${s.throwaways}+${s.drops}`)))),
      h('p', { class: 'legend' }, h('span', { class: 'dot is-throw' }), ' Lancers ratés  ', h('span', { class: 'dot is-drop' }), ' Drops'),
    ),
    h('section', { class: 'card card--full' },
      h('h3', null, 'Disques perdus par point, match après match'),
      perMatch.length === 0 ? h('p', { class: 'muted' }, 'Pas de données.') :
        h('ol', { class: 'bars bars--wide' }, perMatch.map((x) => h('li', null,
          h('a', { class: 'bars__name', href: `#/match/${x.m.id}` }, `${x.m.date.slice(5).split('-').reverse().join('/')} · ${x.m.opponent || 'Entr.'}`),
          h('span', { class: 'bars__track', 'aria-hidden': 'true' }, h('span', { class: 'bars__fill is-throw', style: `width:${Math.max(3, (x.per / maxPer) * 100)}%` })),
          h('span', { class: 'bars__val' }, x.per.toFixed(1))))),
    ),
  );
}

/* ---------- Comparaison de saisons ---------- */

export function seasonTable(st: AppState, playerId: string): HTMLElement {
  const rows = playerSeasonRows(st.matches, st.seasons, playerId, ui.kind);
  if (rows.length === 0) return h('p', { class: 'muted' }, 'Pas encore de stats pour ce joueur.');
  const sum = (k: StatKey): number => rows.reduce((a, r) => a + r.stats[k], 0);
  const cols: StatKey[] = ['matches', 'pointsPlayed', 'goals', 'assists', 'defenses', 'turnovers', 'plusMinus'];
  const labels = ['M', 'Pts', 'B', 'PD', 'D', 'Pertes', '+/-'];
  const cell = (k: StatKey, v: number): HTMLElement => h('td', { class: `num ${k === 'plusMinus' ? (v > 0 ? 'pos' : v < 0 ? 'neg' : '') : ''}` }, k === 'plusMinus' ? signed(v) : v);
  return h('div', { class: 'table-wrap' }, h('table', { class: 'table' },
    h('thead', null, h('tr', null, h('th', null, 'Saison'), labels.map((l) => h('th', { class: 'num' }, l)))),
    h('tbody', null,
      rows.map((r) => h('tr', null, h('td', null, r.season.name), cols.map((k) => cell(k, r.stats[k])))),
      rows.length > 1 ? h('tr', { class: 'total' }, h('td', null, 'Total'), cols.map((k) => cell(k, sum(k)))) : null)));
}

function seasonsTab(st: AppState): HTMLElement {
  const sortedSeasons = [...st.seasons].reverse();
  const teamRows = sortedSeasons.map((s) => ({ s, t: computeTeamStats(filterMatches(st.matches, { seasonId: s.id, kind: ui.kind })) })).filter((x) => x.t.matches > 0);
  const actives = sortPlayers(st.players);
  if (!ui.seasonPlayerId || !st.players.some((p) => p.id === ui.seasonPlayerId)) ui.seasonPlayerId = actives[0]?.id ?? null;

  const playerSel = h('select', { 'aria-label': 'Joueur', value: ui.seasonPlayerId ?? '', onchange: (e: Event) => { ui.seasonPlayerId = (e.target as HTMLSelectElement).value; requestRender(); } },
    actives.map((p) => h('option', { value: p.id }, p.name)));

  return h('div', { class: 'two-col' },
    h('section', { class: 'card' },
      h('h3', null, 'L’équipe, saison par saison'),
      teamRows.length === 0 ? h('p', { class: 'muted' }, 'Pas de données.') :
        h('div', { class: 'table-wrap' }, h('table', { class: 'table' },
          h('thead', null, h('tr', null, ['Saison', 'Renc.', 'V-N-D', 'Points', 'Att.', 'Déf.', 'Perdus/pt'].map((x, i) => h('th', { class: i ? 'num' : '' }, x)))),
          h('tbody', null, teamRows.map(({ s, t }) => h('tr', null,
            h('td', null, s.name), h('td', { class: 'num' }, t.matches), h('td', { class: 'num' }, `${t.wins}-${t.draws}-${t.losses}`),
            h('td', { class: 'num' }, `${t.pointsFor}–${t.pointsAgainst}`), h('td', { class: 'num' }, formatPct(holdPct(t))), h('td', { class: 'num' }, formatPct(breakPct(t))),
            h('td', { class: 'num' }, t.turnoversPerPoint ?? '—')))))),
      h('p', { class: 'hint' }, 'Att. = points tenus en attaque, Déf. = breaks en défense.'),
    ),
    h('section', { class: 'card' },
      h('h3', null, 'Un joueur, saison par saison'),
      actives.length === 0 ? h('p', { class: 'muted' }, 'Aucun joueur.') : [playerSel, ui.seasonPlayerId ? seasonTable(st, ui.seasonPlayerId) : null],
    ),
  );
}
