// filepath: src/actions.ts
// Logique métier : toutes les modifications des données passent par ici.
import { uid } from './id';
import { getData, update } from './store';
import type { AppData, EventType, Match, Player, PointResult, Position } from './types';

export const LINE_SIZE = 7;

export interface PlayerInput {
  name: string;
  number: number | null;
  positions: Position[];
}

export interface MatchInput {
  seasonId: string;
  date: string;
  opponent: string;
  tournament: string;
  location: string;
}

// ---------- Effectif ----------

export function addPlayer(input: PlayerInput): void {
  update((d) => {
    d.players.push({ id: uid(), name: input.name.trim(), number: input.number, positions: input.positions, active: true });
  });
}

export function updatePlayer(id: string, input: PlayerInput): void {
  update((d) => {
    const p = d.players.find((x) => x.id === id);
    if (!p) return;
    p.name = input.name.trim();
    p.number = input.number;
    p.positions = input.positions;
  });
}

export function setPlayerActive(id: string, active: boolean): void {
  update((d) => {
    const p = d.players.find((x) => x.id === id);
    if (p) p.active = active;
  });
}

export function isPlayerUsed(data: AppData, playerId: string): boolean {
  return data.matches.some(
    (m) =>
      (m.current?.lineIds.includes(playerId) ?? false) ||
      (m.current?.events.some((e) => e.playerId === playerId) ?? false) ||
      m.points.some(
        (p) =>
          p.lineIds.includes(playerId) ||
          p.scorerId === playerId ||
          p.assisterId === playerId ||
          p.events.some((e) => e.playerId === playerId),
      ),
  );
}

/** Supprime un joueur jamais utilisé ; sinon renvoie false (il faut l'archiver). */
export function deletePlayer(id: string): boolean {
  if (isPlayerUsed(getData(), id)) return false;
  update((d) => {
    d.players = d.players.filter((p) => p.id !== id);
  });
  return true;
}

// ---------- Saisons ----------

export function addSeason(name: string): string {
  const trimmed = name.trim();
  const existing = getData().seasons.find((s) => s.name.toLowerCase() === trimmed.toLowerCase());
  const id = existing?.id ?? uid();
  update((d) => {
    if (!existing) d.seasons.push({ id, name: trimmed });
    d.currentSeasonId = id;
  });
  return id;
}

export function setCurrentSeason(id: string): void {
  update((d) => {
    if (d.seasons.some((s) => s.id === id)) d.currentSeasonId = id;
  });
}

// ---------- Matchs ----------

export function createMatch(input: MatchInput): string {
  const id = uid();
  update((d) => {
    d.matches.push({
      id,
      seasonId: input.seasonId,
      date: input.date,
      opponent: input.opponent.trim(),
      tournament: input.tournament.trim(),
      location: input.location.trim(),
      points: [],
      current: null,
      finished: false,
    });
  });
  return id;
}

export function deleteMatch(id: string): void {
  update((d) => {
    d.matches = d.matches.filter((m) => m.id !== id);
  });
}

function withMatch(matchId: string, fn: (match: Match, draft: AppData) => void): void {
  update((d) => {
    const match = d.matches.find((m) => m.id === matchId);
    if (match) fn(match, d);
  });
}

export function setFinished(matchId: string, finished: boolean): void {
  withMatch(matchId, (m) => {
    m.finished = finished;
  });
}

// ---------- Saisie d'un match ----------

/** Définit (ou modifie) la ligne du point en cours ; les événements déjà saisis sont conservés. */
export function setLine(matchId: string, playerIds: string[]): void {
  withMatch(matchId, (m) => {
    const lineIds = [...new Set(playerIds)].slice(0, LINE_SIZE);
    m.current = { lineIds, events: m.current?.events ?? [] };
  });
}

export function addEvent(matchId: string, type: EventType, playerId: string): void {
  withMatch(matchId, (m) => {
    if (!m.current || !m.current.lineIds.includes(playerId)) return;
    m.current.events.push({ id: uid(), type, playerId });
  });
}

export function finishPoint(matchId: string, result: PointResult, scorerId: string | null, assisterId: string | null): void {
  withMatch(matchId, (m) => {
    if (!m.current) return;
    const ours = result === 'us';
    const scorer = ours ? scorerId : null;
    m.points.push({
      id: uid(),
      lineIds: m.current.lineIds,
      result,
      scorerId: scorer,
      assisterId: ours && scorer !== null && assisterId !== scorer ? assisterId : null,
      events: m.current.events,
    });
    m.current = null;
  });
}

/** Libellé du prochain « annuler », ou null s'il n'y a rien à annuler. */
export function undoLabel(match: Match): string | null {
  if (match.current && match.current.events.length > 0) return 'Annuler le dernier événement';
  if (match.points.length > 0) return 'Annuler le dernier point';
  return null;
}

export function undoLast(matchId: string): void {
  withMatch(matchId, (m) => {
    if (m.current && m.current.events.length > 0) {
      m.current.events.pop();
      return;
    }
    const last = m.points.pop();
    if (last) m.current = { lineIds: last.lineIds, events: last.events };
  });
}

export function deletePoint(matchId: string, pointId: string): void {
  withMatch(matchId, (m) => {
    m.points = m.points.filter((p) => p.id !== pointId);
  });
}

export type { Player };
