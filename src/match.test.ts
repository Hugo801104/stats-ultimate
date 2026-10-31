import { describe, expect, it } from 'vitest';
import {
  MatchError,
  concede,
  deletePoint,
  finishMatch,
  getOpenPoint,
  getScore,
  logEvent,
  nextStartSide,
  pointLines,
  removeEvent,
  replacePoint,
  reopenMatch,
  scoreGoal,
  startPoint,
} from './match';
import type { Match } from './types';

const IDS = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];

function newMatch(): Match {
  return {
    id: 'm1', seasonId: 's1', kind: 'match', date: '2026-10-31', opponent: 'X', tournament: '', location: '',
    presentIds: IDS, status: 'en_cours', points: [], createdAt: 0,
  };
}

describe('saisie d’un point', () => {
  it('un but = marqueur + passeur, le score évolue', () => {
    const m = newMatch();
    startPoint(m, IDS, 'attaque', 'attaque');
    scoreGoal(m, 'b', 'a');
    expect(getScore(m)).toEqual({ pour: 1, contre: 0 });
    expect(m.points[0]).toMatchObject({ result: 'pour', scorerId: 'b', assistId: 'a' });
    expect(getOpenPoint(m)).toBeUndefined();
  });

  it('accepte un but sans passeur', () => {
    const m = newMatch();
    startPoint(m, IDS, 'defense', 'defense');
    scoreGoal(m, 'c', null);
    expect(m.points[0]!.assistId).toBeNull();
  });

  it('refuse passeur = marqueur ou joueur hors ligne, sans rien modifier', () => {
    const m = newMatch();
    startPoint(m, IDS, 'attaque', 'attaque');
    expect(() => scoreGoal(m, 'a', 'a')).toThrow(MatchError);
    expect(() => scoreGoal(m, 'zz', null)).toThrow(MatchError);
    expect(() => scoreGoal(m, 'a', 'zz')).toThrow(MatchError);
    expect(m.points[0]!.result).toBeNull();
  });

  it('point adverse', () => {
    const m = newMatch();
    startPoint(m, IDS, 'attaque', 'attaque');
    concede(m);
    expect(getScore(m)).toEqual({ pour: 0, contre: 1 });
  });

  it('un seul point ouvert à la fois, ligne non vide', () => {
    const m = newMatch();
    expect(() => startPoint(m, [], 'attaque', 'attaque')).toThrow(/au moins un joueur/);
    startPoint(m, IDS, 'attaque', 'attaque');
    expect(() => startPoint(m, IDS, 'attaque', 'attaque')).toThrow(/déjà en cours/);
  });

  it('événements D / lancer raté / drop / pull, joueur dans la ligne uniquement', () => {
    const m = newMatch();
    startPoint(m, ['a', 'b'], 'defense', 'defense');
    logEvent(m, 'pull', 'a');
    logEvent(m, 'defense', 'b');
    logEvent(m, 'lancer_rate', 'a');
    logEvent(m, 'drop', 'b');
    expect(m.points[0]!.events.map((e) => e.type)).toEqual(['pull', 'defense', 'lancer_rate', 'drop']);
    expect(() => logEvent(m, 'defense', 'c')).toThrow(MatchError);
    expect(() => logEvent(m, 'pull', 'b')).toThrow(/déjà/);
  });

  it('l’équipe qui marque tire ensuite : on défend après un but, on attaque après un point encaissé', () => {
    const m = newMatch();
    expect(nextStartSide(m)).toBe('attaque');
    startPoint(m, IDS, 'attaque', 'attaque');
    scoreGoal(m, 'a', 'b');
    expect(nextStartSide(m)).toBe('defense');
    startPoint(m, IDS, 'defense', 'defense');
    concede(m);
    expect(nextStartSide(m)).toBe('attaque');
  });
});

describe('corrections', () => {
  function played(): Match {
    const m = newMatch();
    startPoint(m, IDS, 'attaque', 'attaque');
    logEvent(m, 'defense', 'a');
    scoreGoal(m, 'b', 'a');
    startPoint(m, IDS, 'defense', 'defense');
    concede(m);
    return m;
  }

  it('corrige marqueur et passeur', () => {
    const m = played();
    const p = m.points[0]!;
    replacePoint(m, p.id, { ...p, scorerId: 'c', assistId: 'd', result: 'pour' });
    expect(m.points[0]).toMatchObject({ scorerId: 'c', assistId: 'd' });
  });

  it('transforme un but en point encaissé : marqueur et passeur effacés', () => {
    const m = played();
    const p = m.points[0]!;
    replacePoint(m, p.id, { ...p, result: 'contre' });
    expect(m.points[0]).toMatchObject({ result: 'contre', scorerId: null, assistId: null });
    expect(getScore(m)).toEqual({ pour: 0, contre: 2 });
  });

  it('refuse un marqueur hors ligne ou absent', () => {
    const m = played();
    const p = m.points[0]!;
    expect(() => replacePoint(m, p.id, { ...p, scorerId: 'zz' })).toThrow(MatchError);
    expect(() => replacePoint(m, p.id, { ...p, scorerId: null })).toThrow(/marqueur/);
  });

  it('refuse un point « en cours » au milieu du match', () => {
    const m = played();
    const p = m.points[0]!;
    expect(() => replacePoint(m, p.id, { ...p, result: null })).toThrow(/dernier point/);
  });

  it('retirer un joueur de la ligne qui a un événement est refusé', () => {
    const m = played();
    const p = m.points[0]!;
    expect(() => replacePoint(m, p.id, { ...p, lineup: IDS.filter((x) => x !== 'a') })).toThrow(MatchError);
  });

  it('supprime un événement et un point', () => {
    const m = played();
    const p = m.points[0]!;
    removeEvent(m, p.id, p.events[0]!.id);
    expect(m.points[0]!.events).toHaveLength(0);
    deletePoint(m, p.id);
    expect(m.points).toHaveLength(1);
    expect(() => deletePoint(m, 'nope')).toThrow(MatchError);
  });

  it('score cumulé point par point', () => {
    const m = played();
    expect(pointLines(m).map((l) => [l.pour, l.contre])).toEqual([[1, 0], [1, 1]]);
  });
});

describe('fin de match', () => {
  it('supprime le point vide en cours, garde celui qui a des événements', () => {
    const a = newMatch();
    startPoint(a, IDS, 'attaque', 'attaque');
    finishMatch(a);
    expect(a.points).toHaveLength(0);
    expect(a.status).toBe('termine');

    const b = newMatch();
    startPoint(b, IDS, 'attaque', 'attaque');
    logEvent(b, 'drop', 'a');
    finishMatch(b);
    expect(b.points).toHaveLength(1);
  });

  it('refuse d’ajouter un point à un match terminé, puis permet de le reprendre', () => {
    const m = newMatch();
    finishMatch(m);
    expect(() => startPoint(m, IDS, 'attaque', 'attaque')).toThrow(/terminé/);
    reopenMatch(m);
    expect(() => startPoint(m, IDS, 'attaque', 'attaque')).not.toThrow();
  });
});
