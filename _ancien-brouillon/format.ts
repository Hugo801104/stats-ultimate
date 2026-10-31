// filepath: src/format.ts
import type { AppData, Player } from './types';

export const TEAM_NAME = 'Plouf';

export function formatDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
}

/** Date du jour au format AAAA-MM-JJ, en heure locale. */
export function todayIso(): string {
  const d = new Date();
  const pad = (n: number): string => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function playerLabel(data: AppData, id: string | null): string {
  if (id === null) return '—';
  const p = data.players.find((x) => x.id === id);
  if (!p) return 'Joueur supprimé';
  return p.number === null ? p.name : `#${p.number} ${p.name}`;
}

export function playerName(data: AppData, id: string | null): string {
  if (id === null) return '—';
  return data.players.find((x) => x.id === id)?.name ?? 'Joueur supprimé';
}

export function signed(n: number): string {
  return n > 0 ? `+${n}` : String(n);
}

export function byNumberThenName(a: Player, b: Player): number {
  const na = a.number ?? Number.POSITIVE_INFINITY;
  const nb = b.number ?? Number.POSITIVE_INFINITY;
  return na === nb ? a.name.localeCompare(b.name, 'fr') : na - nb;
}
