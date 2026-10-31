// Exports (CSV, sauvegarde JSON) et résumé de match partageable.

import { LINE_LABELS, POSITION_LABELS } from './labels';
import { getScore } from './match';
import { normalizeState } from './schema';
import { computePlayerStats, matchResult, type PlayerStats } from './stats';
import type { AppState, Match, Player, Season } from './types';
import { formatDateFr } from './util';

export type CsvCell = string | number | null;

/** CSV pour Excel FR : séparateur « ; », BOM UTF-8, guillemets échappés. */
export function toCsv(rows: CsvCell[][]): string {
  const esc = (c: CsvCell): string => {
    if (c === null) return '';
    const s = String(c);
    return /[;"\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return '﻿' + rows.map((r) => r.map(esc).join(';')).join('\r\n') + '\r\n';
}

export function sortPlayers(players: Player[]): Player[] {
  return [...players].sort(
    (a, b) =>
      (a.number ?? Number.MAX_SAFE_INTEGER) - (b.number ?? Number.MAX_SAFE_INTEGER) ||
      a.name.localeCompare(b.name, 'fr'),
  );
}

export function playerName(players: Player[], id: string | null): string {
  if (!id) return '';
  return players.find((p) => p.id === id)?.name ?? 'Joueur supprimé';
}

export function statsCsv(players: Player[], stats: Map<string, PlayerStats>): string {
  const header = [
    'Joueur', 'Numéro', 'Poste', 'Matchs', 'Points joués', 'Buts', 'Passes décisives', 'Défenses',
    'Lancers ratés', 'Drops', 'Disques perdus', 'Pulls', 'Plus-minus', 'Diff. équipe sur le terrain',
  ];
  const rows: CsvCell[][] = [header];
  for (const p of sortPlayers(players)) {
    const s = stats.get(p.id);
    if (!s) continue;
    rows.push([
      p.name, p.number, POSITION_LABELS[p.position], s.matches, s.pointsPlayed, s.goals, s.assists,
      s.defenses, s.throwaways, s.drops, s.turnovers, s.pulls, s.plusMinus, s.onFieldDiff,
    ]);
  }
  return toCsv(rows);
}

/** Un point par ligne : pratique pour des analyses libres dans un tableur. */
export function pointsCsv(state: AppState): string {
  const rows: CsvCell[][] = [
    ['Saison', 'Date', 'Type', 'Adversaire', 'Tournoi', 'N° point', 'Score après (nous)', 'Score après (eux)',
     'Départ', 'Type de ligne', 'Résultat', 'Marqueur', 'Passeur', 'Ligne', 'Défenses', 'Lancers ratés', 'Drops', 'Pull'],
  ];
  const seasons = new Map(state.seasons.map((s) => [s.id, s.name]));
  const sorted = [...state.matches].sort((a, b) => a.date.localeCompare(b.date) || a.createdAt - b.createdAt);
  for (const m of sorted) {
    let pour = 0;
    let contre = 0;
    m.points.forEach((p, i) => {
      if (p.result === 'pour') pour++;
      else if (p.result === 'contre') contre++;
      const names = (type: string): string =>
        p.events.filter((e) => e.type === type).map((e) => playerName(state.players, e.playerId)).join(', ');
      rows.push([
        seasons.get(m.seasonId) ?? '', m.date, m.kind === 'match' ? 'Match' : 'Entraînement', m.opponent,
        m.tournament, i + 1, pour, contre, p.startedOn === 'attaque' ? 'Attaque' : 'Défense',
        LINE_LABELS[p.lineType], p.result === 'pour' ? 'Pour' : p.result === 'contre' ? 'Contre' : 'En cours',
        playerName(state.players, p.scorerId), playerName(state.players, p.assistId),
        p.lineup.map((id) => playerName(state.players, id)).join(', '),
        names('defense'), names('lancer_rate'), names('drop'), names('pull'),
      ]);
    });
  }
  return toCsv(rows);
}

export const BACKUP_APP = 'stats-ultimate-plouf';

export function backupJson(state: AppState, now: Date = new Date()): string {
  return JSON.stringify({ app: BACKUP_APP, exportedAt: now.toISOString(), state }, null, 2);
}

/** Lit une sauvegarde (enveloppe ou état brut). Lève une erreur lisible si le fichier est invalide. */
export function parseBackup(text: string): { state: AppState; warnings: string[] } {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error("Ce fichier n'est pas un JSON valide.");
  }
  const raw = json && typeof json === 'object' && 'state' in json ? (json as { state: unknown }).state : json;
  return normalizeState(raw);
}

export interface RankedName {
  name: string;
  count: number;
}

export interface MatchSummary {
  title: string;
  teamName: string;
  opponent: string;
  pour: number;
  contre: number;
  meta: string;
  outcome: string;
  scorers: RankedName[];
  assisters: RankedName[];
  defenders: RankedName[];
  turnovers: { total: number; throwaways: number; drops: number };
}

function top(
  stats: PlayerStats[],
  players: Player[],
  key: 'goals' | 'assists' | 'defenses',
  limit: number,
): RankedName[] {
  return stats
    .filter((s) => s[key] > 0)
    .sort((a, b) => b[key] - a[key] || playerName(players, a.playerId).localeCompare(playerName(players, b.playerId), 'fr'))
    .slice(0, limit)
    .map((s) => ({ name: playerName(players, s.playerId), count: s[key] }));
}

export function buildMatchSummary(m: Match, players: Player[], teamName: string, season?: Season): MatchSummary {
  const { pour, contre } = getScore(m);
  const stats = [...computePlayerStats([m]).values()];
  const result = matchResult(m);
  const opponent = m.opponent || (m.kind === 'entrainement' ? 'Entraînement' : 'Adversaire');
  const meta = [formatDateFr(m.date), m.tournament, m.location, season?.name].filter(Boolean).join(' · ');
  const throwaways = stats.reduce((a, s) => a + s.throwaways, 0);
  const drops = stats.reduce((a, s) => a + s.drops, 0);
  return {
    title: `${teamName} ${pour} – ${contre} ${opponent}`,
    teamName,
    opponent,
    pour,
    contre,
    meta,
    outcome:
      result === 'victoire' ? 'Victoire !' : result === 'defaite' ? 'Défaite' : result === 'nul' ? 'Match nul' : 'Match en cours',
    scorers: top(stats, players, 'goals', 5),
    assisters: top(stats, players, 'assists', 5),
    defenders: top(stats, players, 'defenses', 5),
    turnovers: { total: throwaways + drops, throwaways, drops },
  };
}

export function summaryText(s: MatchSummary): string {
  const list = (items: RankedName[]): string => items.map((i) => `${i.name} ${i.count}`).join(', ');
  const lines = [`🥏 ${s.title}`, s.meta, `${s.outcome}`, ''];
  if (s.scorers.length) lines.push(`🎯 Buts : ${list(s.scorers)}`);
  if (s.assisters.length) lines.push(`🤝 Passes D : ${list(s.assisters)}`);
  if (s.defenders.length) lines.push(`🛡️ Défenses : ${list(s.defenders)}`);
  lines.push(`💨 Disques perdus : ${s.turnovers.total} (${s.turnovers.throwaways} lancers, ${s.turnovers.drops} drops)`);
  return lines.join('\n');
}
