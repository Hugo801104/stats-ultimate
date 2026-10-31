// Données d'exemple (joueurs fictifs) pour explorer l'analyse sans saisir de match.

import { defaultState } from './schema';
import { getScore, nextStartSide } from './match';
import type { AppState, EventType, Match, Player, Point, Position } from './types';
import { uid } from './util';

/** Générateur pseudo-aléatoire déterministe (mulberry32). */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const NAMES: [string, Position][] = [
  ['Léa', 'handler'], ['Tom', 'cutter'], ['Inès', 'cutter'], ['Hugo', 'handler'], ['Manon', 'polyvalent'],
  ['Yanis', 'cutter'], ['Camille', 'handler'], ['Louis', 'cutter'], ['Chloé', 'polyvalent'], ['Nathan', 'cutter'],
  ['Jade', 'handler'], ['Maël', 'cutter'], ['Zoé', 'polyvalent'], ['Sacha', 'cutter'],
];

export function generateDemo(now: Date = new Date()): AppState {
  const state = defaultState(now);
  const rand = rng(2026);
  const pick = <T>(arr: T[]): T => arr[Math.floor(rand() * arr.length)]!;

  const players: Player[] = NAMES.map(([name, position], i) => ({
    id: uid(), name, number: i + 3, position, active: true,
  }));
  state.players = players;

  const previous = { id: uid(), name: `${Number(state.seasons[0]!.name.slice(0, 4)) - 1}-${state.seasons[0]!.name.slice(0, 4)}` };
  state.seasons = [previous, ...state.seasons];
  const current = state.seasons[1]!;
  state.settings.currentSeasonId = current.id;

  const opponents = ['Nantes Frisbee', 'Les Sharks', 'Vertou Ultimate', 'Rezé Disc', 'Saint-Nazaire UC', 'Angers Flying'];
  const tournaments = ['', 'Tournoi du Lac', 'Open de Loire', ''];

  const makeMatch = (seasonId: string, date: string, i: number, kind: Match['kind']): Match => {
    const m: Match = {
      id: uid(), seasonId, kind, date,
      opponent: kind === 'match' ? opponents[i % opponents.length]! : 'Équipe B',
      tournament: kind === 'match' ? tournaments[i % tournaments.length]! : '',
      location: kind === 'match' ? 'Nantes' : 'La Chevrolière',
      presentIds: players.map((p) => p.id), status: 'termine', points: [], createdAt: Date.parse(`${date}T12:00:00`),
    };
    const target = 11;
    while (getScore(m).pour < target && getScore(m).contre < target) {
      const startedOn = nextStartSide(m);
      const shuffled = [...players].sort(() => rand() - 0.5).slice(0, 7);
      const lineup = shuffled.map((p) => p.id);
      const pointWon = rand() < (startedOn === 'attaque' ? 0.62 : 0.4);
      const events: Point['events'] = [];
      if (startedOn === 'defense') events.push({ id: uid(), type: 'pull', playerId: pick(lineup) });
      const nEvents = Math.floor(rand() * 4);
      for (let k = 0; k < nEvents; k++) {
        const type: EventType = pick(['defense', 'defense', 'lancer_rate', 'drop']);
        events.push({ id: uid(), type, playerId: pick(lineup) });
      }
      const scorerId = pointWon ? pick(lineup) : null;
      const assistId = pointWon ? pick(lineup.filter((id) => id !== scorerId)) : null;
      m.points.push({
        id: uid(), lineup, lineType: startedOn, startedOn, events,
        result: pointWon ? 'pour' : 'contre', scorerId, assistId,
      });
    }
    return m;
  };

  const dateFor = (year: number, month: number, day: number): string =>
    `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  const y = Number(current.name.slice(0, 4));
  state.matches = [
    makeMatch(previous.id, dateFor(y - 1, 10, 12), 0, 'match'),
    makeMatch(previous.id, dateFor(y - 1, 11, 9), 1, 'match'),
    makeMatch(previous.id, dateFor(y - 1, 11, 16), 0, 'entrainement'),
    makeMatch(previous.id, dateFor(y, 3, 22), 2, 'match'),
    makeMatch(current.id, dateFor(y, 9, 21), 3, 'match'),
    makeMatch(current.id, dateFor(y, 9, 28), 0, 'entrainement'),
    makeMatch(current.id, dateFor(y, 10, 12), 4, 'match'),
    makeMatch(current.id, dateFor(y, 10, 19), 5, 'match'),
  ];
  return state;
}
