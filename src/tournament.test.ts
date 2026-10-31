import { describe, expect, it } from 'vitest';
import { normalizeState } from './schema';
import {
  DEFAULT_RULES, SheetError, callTimeout, finishGame, formatClock, newGame, newTournament, parseClock, pauseClock, scorePoint,
  sheetState, standings, startClock, validateGame,
} from './tournament';
import type { GameRules, TeamSide, TournamentGame } from './types';

const MIN = 60_000;

function game(rules: Partial<GameRules> = {}): TournamentGame {
  return newGame({ label: '', field: '', time: '', teamA: 'Albatros', teamB: 'Disc Jockeys', scorekeeper: 'Les Frisés', rules: { ...DEFAULT_RULES, ...rules } });
}

/** Ajoute des points à des minutes données : [['A', 3], ['B', 5]…]. */
function play(g: TournamentGame, goals: [TeamSide, number][]): TournamentGame {
  for (const [team, min] of goals) g.goals.push({ id: `${team}${min}${g.goals.length}`, team, atMs: min * MIN });
  g.status = 'en_cours';
  return g;
}

const series = (team: TeamSide, n: number, fromMin = 1): [TeamSide, number][] =>
  Array.from({ length: n }, (_, i) => [team, fromMin + i] as [TeamSide, number]);

describe('chrono', () => {
  it('cumule le temps entre lancer et pause', () => {
    const g = game();
    startClock(g, 1000);
    pauseClock(g, 61_000);
    startClock(g, 100_000);
    expect(sheetState(g, 130_000).elapsedMs).toBe(90_000);
    expect(g.status).toBe('en_cours');
  });
  it('formate et relit mm:ss', () => {
    expect(formatClock(754_000)).toBe('12:34');
    expect(formatClock(3_723_000)).toBe('1:02:03');
    expect(parseClock('12:34')).toBe(754_000);
    expect(parseClock('1:02:03')).toBe(3_723_000);
    expect(parseClock('12:75')).toBeNull();
    expect(parseClock('abc')).toBeNull();
  });
  it('refuse un point avant le lancement du chrono', () => {
    expect(() => scorePoint(game(), 'A')).toThrow(SheetError);
  });
});

describe('fin de match au score', () => {
  it('le premier au score cible gagne', () => {
    const g = play(game({ targetPoints: 5, timeCap: 'aucun' }), [...series('A', 4), ...series('B', 4, 10), ['A', 20]]);
    const s = sheetState(g);
    expect([s.scoreA, s.scoreB]).toEqual([5, 4]);
    expect(s.winner).toBe('A');
    expect(s.phase).toBe('over');
  });
  it('2 points d’écart jusqu’au plafond', () => {
    const rules = { targetPoints: 5, pointCap: 7, timeCap: 'aucun' as const };
    const g = play(game(rules), [...series('A', 4), ...series('B', 4, 10), ['A', 20]]);
    let s = sheetState(g);
    expect(s.winner).toBeNull(); // 5-4 : pas encore 2 points d'écart
    expect(s.target).toBe(6);
    play(g, [['B', 21], ['A', 22], ['B', 23]]); // 6-6
    s = sheetState(g);
    expect(s.target).toBe(7);
    play(g, [['A', 24]]); // 7-6 : le plafond est atteint
    expect(sheetState(g).winner).toBe('A');
  });
});

describe('cap au temps', () => {
  it('temps écoulé : on attend la fin du point en cours', () => {
    const g = play(game({ durationMin: 30, targetPoints: 13 }), [...series('A', 6), ...series('B', 5, 10)]);
    g.clockMs = 31 * MIN;
    expect(sheetState(g).phase).toBe('cap_pending');
  });
  it('cap +1 : meilleur score + 1 après le point en cours', () => {
    const g = play(game({ durationMin: 30, targetPoints: 13, timeCap: 'plus1' }), [...series('A', 6), ...series('B', 5, 10), ['B', 31]]);
    let s = sheetState(g);
    expect([s.scoreA, s.scoreB]).toEqual([6, 6]);
    expect(s.phase).toBe('cap');
    expect(s.target).toBe(7);
    play(g, [['A', 33]]);
    s = sheetState(g);
    expect(s.winner).toBe('A');
  });
  it('arrêt net : fin après le point en cours si pas d’égalité', () => {
    const g = play(game({ durationMin: 30, timeCap: 'fin' }), [...series('A', 6), ...series('B', 4, 10), ['B', 31]]);
    const s = sheetState(g);
    expect(s.winner).toBe('A');
    expect([s.scoreA, s.scoreB]).toEqual([6, 5]);
  });
  it('arrêt net sur égalité : point décisif', () => {
    const g = play(game({ durationMin: 30, timeCap: 'fin' }), [...series('A', 6), ...series('B', 5, 10), ['B', 31]]);
    expect(sheetState(g).phase).toBe('cap');
    play(g, [['B', 32]]);
    expect(sheetState(g).winner).toBe('B');
  });
  it('sans limite de temps : jamais de cap', () => {
    const g = play(game({ timeCap: 'aucun' }), series('A', 3));
    g.clockMs = 500 * MIN;
    expect(sheetState(g).phase).toBe('normal');
  });
});

describe('temps morts', () => {
  it('décompte par équipe et refus au-delà du quota', () => {
    const g = game({ timeoutsPerTeam: 1, timeoutSeconds: 70 });
    startClock(g, 0);
    callTimeout(g, 'A', 10_000);
    expect(g.timeoutEndsAt).toBe(80_000);
    expect(sheetState(g, 10_000).timeoutsLeft).toEqual({ A: 0, B: 1 });
    expect(() => callTimeout(g, 'A', 20_000)).toThrow(/plus de temps mort/);
    callTimeout(g, 'B', 20_000);
  });
});

describe('tournoi', () => {
  it('valide les équipes d’un match', () => {
    const d = { label: '', field: '', time: '', teamA: 'X', teamB: ' x ', scorekeeper: '', rules: DEFAULT_RULES };
    expect(validateGame(d)).toMatch(/différentes/);
    expect(validateGame({ ...d, teamB: '' })).toMatch(/deux équipes/);
  });
  it('bilan sur les matchs terminés', () => {
    const t = newTournament('Toussaint', '2026-10-31', '', ['Albatros', 'Disc Jockeys'], DEFAULT_RULES);
    const g1 = play(game(), [...series('A', 3), ['B', 9]]);
    finishGame(g1);
    const g2 = play(game(), [['B', 2]]); // en cours : ignoré
    t.games.push(g1, g2);
    const [first, second] = standings(t);
    expect(first).toMatchObject({ team: 'Albatros', won: 1, pointsFor: 3, pointsAgainst: 1 });
    expect(second).toMatchObject({ team: 'Disc Jockeys', lost: 1 });
  });
  it('les tournois survivent à la sauvegarde / restauration', () => {
    const t = newTournament('Toussaint', '2026-10-31', 'Nantes', ['A', 'B'], DEFAULT_RULES);
    const g = play(game({ pointCap: 15 }), series('A', 2));
    callTimeout(g, 'B');
    t.games.push(g);
    const { state } = normalizeState({ players: [], seasons: [], matches: [], tournaments: [t] });
    expect(state.tournaments[0]).toEqual(t);
    // Ancienne sauvegarde sans tournois : liste vide.
    expect(normalizeState({ players: [] }).state.tournaments).toEqual([]);
  });
});
