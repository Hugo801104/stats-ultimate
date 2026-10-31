// filepath: src/views/statsTable.ts
// Composant réutilisable : tableau de stats triable (écran Stats et bilan d'un match).
import { h } from '../dom';
import { playerLabel, signed } from '../format';
import type { PlayerStats } from '../stats';
import type { AppData } from '../types';

export type NumericKey = Exclude<keyof PlayerStats, 'playerId'>;
export type StatKey = 'name' | NumericKey;

interface Column {
  key: StatKey;
  label: string;
  title: string;
}

const COLUMNS: Column[] = [
  { key: 'name', label: 'Joueur', title: 'Joueur' },
  { key: 'matches', label: 'MJ', title: 'Matchs joués' },
  { key: 'pointsPlayed', label: 'PJ', title: 'Points joués' },
  { key: 'goals', label: 'Buts', title: 'Points marqués' },
  { key: 'assists', label: 'PD', title: 'Passes décisives' },
  { key: 'defenses', label: 'D', title: 'Défenses' },
  { key: 'turnovers', label: 'Perdus', title: 'Disques perdus' },
  { key: 'pulls', label: 'Pulls', title: 'Pulls' },
  { key: 'plusMinus', label: '+/-', title: 'Plus-minus' },
];

export interface TableOptions {
  sortKey: StatKey;
  sortDir: 'asc' | 'desc';
  onSort?: (key: StatKey) => void;
  hide?: StatKey[];
}

export function statsTable(data: AppData, rows: readonly PlayerStats[], opts: TableOptions): HTMLElement {
  const columns = COLUMNS.filter((c) => !opts.hide?.includes(c.key));
  const dir = opts.sortDir === 'asc' ? 1 : -1;
  const key = opts.sortKey;
  const label = (r: PlayerStats): string => playerLabel(data, r.playerId);

  const sorted = [...rows].sort((a, b) => {
    if (key === 'name') return dir * label(a).localeCompare(label(b), 'fr');
    return dir * (a[key] - b[key]) || label(a).localeCompare(label(b), 'fr');
  });

  const head = h(
    'tr',
    {},
    ...columns.map((c) => {
      const active = c.key === key;
      const content = opts.onSort
        ? h(
            'button',
            { type: 'button', class: 'th-btn', title: `Trier par ${c.title.toLowerCase()}`, onclick: () => opts.onSort?.(c.key) },
            c.label,
            active ? (opts.sortDir === 'asc' ? ' ▲' : ' ▼') : '',
          )
        : c.label;
      return h(
        'th',
        { scope: 'col', title: c.title, 'aria-sort': active ? (opts.sortDir === 'asc' ? 'ascending' : 'descending') : 'none' },
        content,
      );
    }),
  );

  const body = sorted.map((r) =>
    h(
      'tr',
      {},
      ...columns.map((c) => {
        if (c.key === 'name') return h('th', { scope: 'row' }, label(r));
        const value = r[c.key];
        return h('td', { class: c.key === 'plusMinus' && value < 0 ? 'neg' : '' }, c.key === 'plusMinus' ? signed(value) : String(value));
      }),
    ),
  );

  return h('div', { class: 'table-wrap' }, h('table', { class: 'stats' }, h('thead', {}, head), h('tbody', {}, ...body)));
}
