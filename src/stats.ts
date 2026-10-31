// Calcul des statistiques : fonctions pures, calculées à la volée depuis les événements.
// Rien n'est stocké en double : corriger un point corrige automatiquement toutes les stats.

import type { LineType, Match, MatchKind, Season } from './types';
import { pct } from './util';

export interface StatsFilter {
  seasonId: string | 'all';
  kind: MatchKind | 'all';
}

export function filterMatches(matches: Match[], f: StatsFilter): Match[] {
  return matches.filter(
    (m) => (f.seasonId === 'all' || m.seasonId === f.seasonId) && (f.kind === 'all' || m.kind === f.kind),
  );
}

export interface PlayerStats {
  playerId: string;
  /** Matchs où le joueur a joué au moins un point ou porté un événement. */
  matches: number;
  /** Points terminés joués (présent dans la ligne). */
  pointsPlayed: number;
  goals: number;
  assists: number;
  defenses: number;
  throwaways: number;
  drops: number;
  /** Disques perdus = lancers ratés + drops. */
  turnovers: number;
  pulls: number;
  /** Plus-minus individuel = buts + passes D + défenses − disques perdus. */
  plusMinus: number;
  /** Points marqués / encaissés par l'équipe pendant que le joueur était sur le terrain. */
  teamPointsFor: number;
  teamPointsAgainst: number;
  /** Différence de points de l'équipe avec le joueur sur le terrain. */
  onFieldDiff: number;
}

export function emptyStats(playerId: string): PlayerStats {
  return {
    playerId,
    matches: 0,
    pointsPlayed: 0,
    goals: 0,
    assists: 0,
    defenses: 0,
    throwaways: 0,
    drops: 0,
    turnovers: 0,
    pulls: 0,
    plusMinus: 0,
    teamPointsFor: 0,
    teamPointsAgainst: 0,
    onFieldDiff: 0,
  };
}

export function computePlayerStats(matches: Match[]): Map<string, PlayerStats> {
  const map = new Map<string, PlayerStats>();
  const get = (id: string): PlayerStats => {
    let s = map.get(id);
    if (!s) {
      s = emptyStats(id);
      map.set(id, s);
    }
    return s;
  };

  for (const m of matches) {
    const seen = new Set<string>();
    for (const p of m.points) {
      for (const id of p.lineup) {
        const s = get(id);
        seen.add(id);
        if (p.result === 'pour') {
          s.pointsPlayed++;
          s.teamPointsFor++;
        } else if (p.result === 'contre') {
          s.pointsPlayed++;
          s.teamPointsAgainst++;
        }
      }
      for (const e of p.events) {
        const s = get(e.playerId);
        seen.add(e.playerId);
        if (e.type === 'defense') s.defenses++;
        else if (e.type === 'lancer_rate') s.throwaways++;
        else if (e.type === 'drop') s.drops++;
        else s.pulls++;
      }
      if (p.result === 'pour') {
        if (p.scorerId) {
          get(p.scorerId).goals++;
          seen.add(p.scorerId);
        }
        if (p.assistId) {
          get(p.assistId).assists++;
          seen.add(p.assistId);
        }
      }
    }
    for (const id of seen) get(id).matches++;
  }

  for (const s of map.values()) {
    s.turnovers = s.throwaways + s.drops;
    s.plusMinus = s.goals + s.assists + s.defenses - s.turnovers;
    s.onFieldDiff = s.teamPointsFor - s.teamPointsAgainst;
  }
  return map;
}

export type StatKey =
  | 'matches'
  | 'pointsPlayed'
  | 'goals'
  | 'assists'
  | 'defenses'
  | 'turnovers'
  | 'pulls'
  | 'plusMinus'
  | 'onFieldDiff';

/** Classement décroissant (ou croissant) sur une stat, les égalités départagées par le nom via `tie`. */
export function rankBy(
  stats: PlayerStats[],
  key: StatKey,
  tie: (a: PlayerStats, b: PlayerStats) => number,
  dir: 'desc' | 'asc' = 'desc',
): PlayerStats[] {
  const sign = dir === 'desc' ? -1 : 1;
  return [...stats].sort((a, b) => sign * (a[key] - b[key]) || tie(a, b));
}

export function matchResult(m: Match): 'victoire' | 'defaite' | 'nul' | null {
  if (m.status !== 'termine') return null;
  let pour = 0;
  let contre = 0;
  for (const p of m.points) {
    if (p.result === 'pour') pour++;
    else if (p.result === 'contre') contre++;
  }
  if (pour === 0 && contre === 0) return null;
  return pour > contre ? 'victoire' : pour < contre ? 'defaite' : 'nul';
}

export interface LineBreakdown {
  points: number;
  pour: number;
  contre: number;
}

export interface TeamStats {
  matches: number;
  wins: number;
  losses: number;
  draws: number;
  pointsFor: number;
  pointsAgainst: number;
  /** Points commencés en attaque / en défense et convertis. */
  holdAttempts: number;
  holds: number;
  breakAttempts: number;
  breaks: number;
  defenses: number;
  throwaways: number;
  drops: number;
  turnovers: number;
  /** Disques perdus par point joué (null s'il n'y a pas de point). */
  turnoversPerPoint: number | null;
  byLine: Record<LineType, LineBreakdown>;
}

export function computeTeamStats(matches: Match[]): TeamStats {
  const t: TeamStats = {
    matches: matches.length,
    wins: 0,
    losses: 0,
    draws: 0,
    pointsFor: 0,
    pointsAgainst: 0,
    holdAttempts: 0,
    holds: 0,
    breakAttempts: 0,
    breaks: 0,
    defenses: 0,
    throwaways: 0,
    drops: 0,
    turnovers: 0,
    turnoversPerPoint: null,
    byLine: {
      attaque: { points: 0, pour: 0, contre: 0 },
      defense: { points: 0, pour: 0, contre: 0 },
      mixte: { points: 0, pour: 0, contre: 0 },
    },
  };
  let played = 0;
  for (const m of matches) {
    const r = matchResult(m);
    if (r === 'victoire') t.wins++;
    else if (r === 'defaite') t.losses++;
    else if (r === 'nul') t.draws++;
    for (const p of m.points) {
      for (const e of p.events) {
        if (e.type === 'defense') t.defenses++;
        else if (e.type === 'lancer_rate') t.throwaways++;
        else if (e.type === 'drop') t.drops++;
      }
      if (p.result === null) continue;
      played++;
      const line = t.byLine[p.lineType];
      line.points++;
      if (p.result === 'pour') {
        t.pointsFor++;
        line.pour++;
      } else {
        t.pointsAgainst++;
        line.contre++;
      }
      if (p.startedOn === 'attaque') {
        t.holdAttempts++;
        if (p.result === 'pour') t.holds++;
      } else {
        t.breakAttempts++;
        if (p.result === 'pour') t.breaks++;
      }
    }
  }
  t.turnovers = t.throwaways + t.drops;
  t.turnoversPerPoint = played > 0 ? Math.round((t.turnovers / played) * 10) / 10 : null;
  return t;
}

export const holdPct = (t: TeamStats): number | null => pct(t.holds, t.holdAttempts);
export const breakPct = (t: TeamStats): number | null => pct(t.breaks, t.breakAttempts);

export interface SeasonRow {
  season: Season;
  stats: PlayerStats;
}

/** Stats d'un joueur saison par saison (saisons sans activité omises). */
export function playerSeasonRows(
  matches: Match[],
  seasons: Season[],
  playerId: string,
  kind: MatchKind | 'all' = 'all',
): SeasonRow[] {
  const rows: SeasonRow[] = [];
  for (const season of seasons) {
    const ms = filterMatches(matches, { seasonId: season.id, kind });
    const stats = computePlayerStats(ms).get(playerId);
    if (stats && (stats.pointsPlayed > 0 || stats.matches > 0)) rows.push({ season, stats });
  }
  return rows;
}
