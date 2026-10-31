import { describe, expect, it } from 'vitest';
import { generateDemo } from './demo';
import { concede, finishMatch, logEvent, scoreGoal, startPoint } from './match';
import {
  breakPct,
  computePlayerStats,
  computeTeamStats,
  filterMatches,
  holdPct,
  playerSeasonRows,
  rankBy,
} from './stats';
import type { Match } from './types';

function match(id = 'm', seasonId = 's1', kind: Match['kind'] = 'match'): Match {
  return {
    id, seasonId, kind, date: '2026-10-31', opponent: 'X', tournament: '', location: '', presentIds: [],
    status: 'en_cours', points: [], createdAt: 0,
  };
}

/** Scénario : point 1 (attaque) but b<-a avec une D de c et un drop de a ; point 2 (défense) encaissé, lancer raté de b. */
function scenario(): Match {
  const m = match();
  startPoint(m, ['a', 'b', 'c'], 'attaque', 'attaque');
  logEvent(m, 'defense', 'c');
  logEvent(m, 'drop', 'a');
  scoreGoal(m, 'b', 'a');
  startPoint(m, ['b', 'c', 'd'], 'defense', 'defense');
  logEvent(m, 'pull', 'd');
  logEvent(m, 'lancer_rate', 'b');
  concede(m);
  finishMatch(m);
  return m;
}

describe('stats par joueur', () => {
  const stats = computePlayerStats([scenario()]);

  it('compte buts, passes D, défenses, pertes, pulls', () => {
    expect(stats.get('b')).toMatchObject({ goals: 1, assists: 0, throwaways: 1, drops: 0, turnovers: 1 });
    expect(stats.get('a')).toMatchObject({ goals: 0, assists: 1, drops: 1, turnovers: 1 });
    expect(stats.get('c')).toMatchObject({ defenses: 1 });
    expect(stats.get('d')).toMatchObject({ pulls: 1 });
  });

  it('plus-minus = buts + passes D + défenses − disques perdus', () => {
    expect(stats.get('b')!.plusMinus).toBe(1 - 1); // 1 but, 1 lancer raté
    expect(stats.get('a')!.plusMinus).toBe(1 - 1); // 1 passe D, 1 drop
    expect(stats.get('c')!.plusMinus).toBe(1);
    expect(stats.get('d')!.plusMinus).toBe(0);
  });

  it('points joués et différence de l’équipe avec le joueur sur le terrain', () => {
    expect(stats.get('a')).toMatchObject({ pointsPlayed: 1, onFieldDiff: 1 });
    expect(stats.get('b')).toMatchObject({ pointsPlayed: 2, teamPointsFor: 1, teamPointsAgainst: 1, onFieldDiff: 0 });
    expect(stats.get('d')).toMatchObject({ pointsPlayed: 1, onFieldDiff: -1 });
    expect(stats.get('b')!.matches).toBe(1);
  });

  it('un point en cours ne compte pas dans les points joués mais ses événements sont comptés', () => {
    const m = match();
    startPoint(m, ['a'], 'attaque', 'attaque');
    logEvent(m, 'defense', 'a');
    const s = computePlayerStats([m]).get('a')!;
    expect(s.pointsPlayed).toBe(0);
    expect(s.defenses).toBe(1);
  });

  it('classement avec départage', () => {
    const list = [...stats.values()];
    const ranked = rankBy(list, 'turnovers', (x, y) => x.playerId.localeCompare(y.playerId));
    expect(ranked.slice(0, 2).map((s) => s.playerId)).toEqual(['a', 'b']);
    const asc = rankBy(list, 'turnovers', (x, y) => x.playerId.localeCompare(y.playerId), 'asc');
    expect(asc[asc.length - 1]!.turnovers).toBe(1);
  });
});

describe('stats d’équipe', () => {
  it('score, hold / break, pertes, répartition par ligne', () => {
    const t = computeTeamStats([scenario()]);
    expect(t).toMatchObject({ matches: 1, losses: 0, wins: 0, draws: 1, pointsFor: 1, pointsAgainst: 1 });
    expect(t).toMatchObject({ holdAttempts: 1, holds: 1, breakAttempts: 1, breaks: 0 });
    expect(holdPct(t)).toBe(100);
    expect(breakPct(t)).toBe(0);
    expect(t).toMatchObject({ defenses: 1, throwaways: 1, drops: 1, turnovers: 2, turnoversPerPoint: 1 });
    expect(t.byLine.attaque).toEqual({ points: 1, pour: 1, contre: 0 });
    expect(t.byLine.defense).toEqual({ points: 1, pour: 0, contre: 1 });
  });

  it('pourcentages nuls sans point', () => {
    const t = computeTeamStats([]);
    expect(holdPct(t)).toBeNull();
    expect(t.turnoversPerPoint).toBeNull();
  });
});

describe('filtres et saisons', () => {
  it('filtre par saison et type', () => {
    const a = match('a', 's1', 'match');
    const b = match('b', 's2', 'entrainement');
    expect(filterMatches([a, b], { seasonId: 's1', kind: 'all' })).toEqual([a]);
    expect(filterMatches([a, b], { seasonId: 'all', kind: 'entrainement' })).toEqual([b]);
    expect(filterMatches([a, b], { seasonId: 'all', kind: 'all' })).toHaveLength(2);
  });

  it('comparaison saison par saison sur les données de démo', () => {
    const demo = generateDemo(new Date(2026, 9, 31));
    expect(demo.seasons).toHaveLength(2);
    const player = demo.players[0]!;
    const rows = playerSeasonRows(demo.matches, demo.seasons, player.id);
    expect(rows.length).toBe(2);
    const total = computePlayerStats(demo.matches).get(player.id)!;
    expect(rows.reduce((a, r) => a + r.stats.goals, 0)).toBe(total.goals);
  });
});
