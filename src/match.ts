// Logique de saisie d'un match. Fonctions qui MODIFIENT le match passé en argument
// (utilisées dans store.update sur une copie). Chaque fonction valide AVANT de modifier,
// et lève une MatchError au message lisible en cas de saisie incohérente.

import {
  MAX_LINE_SIZE,
  type EventType,
  type LineType,
  type Match,
  type Point,
  type PointEvent,
  type PointResult,
  type Side,
} from './types';
import { uid } from './util';

export class MatchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MatchError';
  }
}

function fail(message: string): never {
  throw new MatchError(message);
}

export function getOpenPoint(m: Match): Point | undefined {
  const last = m.points[m.points.length - 1];
  return last && last.result === null ? last : undefined;
}

export function getScore(m: Match): { pour: number; contre: number } {
  let pour = 0;
  let contre = 0;
  for (const p of m.points) {
    if (p.result === 'pour') pour++;
    else if (p.result === 'contre') contre++;
  }
  return { pour, contre };
}

/** L'équipe qui marque tire (pull) le point suivant : on défend après un but marqué. */
export function nextStartSide(m: Match): Side {
  for (let i = m.points.length - 1; i >= 0; i--) {
    const r = m.points[i]!.result;
    if (r === 'pour') return 'defense';
    if (r === 'contre') return 'attaque';
  }
  return 'attaque';
}

export function startPoint(m: Match, lineup: string[], lineType: LineType, startedOn: Side): Point {
  if (m.status !== 'en_cours') fail('Le match est terminé : reprends-le pour ajouter des points.');
  if (getOpenPoint(m)) fail('Un point est déjà en cours.');
  const unique = [...new Set(lineup)];
  if (unique.length === 0) fail('Choisis au moins un joueur pour la ligne.');
  if (unique.length > MAX_LINE_SIZE) fail(`Une ligne ne peut pas dépasser ${MAX_LINE_SIZE} joueurs.`);
  const point: Point = {
    id: uid(),
    lineup: unique,
    lineType,
    startedOn,
    events: [],
    result: null,
    scorerId: null,
    assistId: null,
  };
  m.points.push(point);
  return point;
}

function requireOpen(m: Match): Point {
  const p = getOpenPoint(m);
  if (!p) fail('Aucun point en cours.');
  return p;
}

export function logEvent(m: Match, type: EventType, playerId: string): PointEvent {
  const p = requireOpen(m);
  if (!p.lineup.includes(playerId)) fail("Ce joueur n'est pas dans la ligne du point.");
  if (type === 'pull' && p.events.some((e) => e.type === 'pull')) fail('Le pull est déjà enregistré pour ce point.');
  const event: PointEvent = { id: uid(), type, playerId };
  p.events.push(event);
  return event;
}

export function scoreGoal(m: Match, scorerId: string, assistId: string | null): void {
  const p = requireOpen(m);
  if (!p.lineup.includes(scorerId)) fail("Le marqueur n'est pas dans la ligne du point.");
  if (assistId !== null) {
    if (assistId === scorerId) fail('Le passeur et le marqueur doivent être deux joueurs différents.');
    if (!p.lineup.includes(assistId)) fail("Le passeur n'est pas dans la ligne du point.");
  }
  p.result = 'pour';
  p.scorerId = scorerId;
  p.assistId = assistId;
}

export function concede(m: Match): void {
  const p = requireOpen(m);
  p.result = 'contre';
  p.scorerId = null;
  p.assistId = null;
}

export function removeEvent(m: Match, pointId: string, eventId: string): void {
  const p = m.points.find((x) => x.id === pointId);
  if (!p) fail('Point introuvable.');
  const idx = p.events.findIndex((e) => e.id === eventId);
  if (idx < 0) fail('Événement introuvable.');
  p.events.splice(idx, 1);
}

export function deletePoint(m: Match, pointId: string): void {
  const idx = m.points.findIndex((x) => x.id === pointId);
  if (idx < 0) fail('Point introuvable.');
  m.points.splice(idx, 1);
}

export interface PointDraft {
  lineup: string[];
  lineType: LineType;
  startedOn: Side;
  result: PointResult | null;
  scorerId: string | null;
  assistId: string | null;
  events: PointEvent[];
}

/** Correction complète d'un point (ligne, résultat, marqueur, passeur, événements). */
export function replacePoint(m: Match, pointId: string, draft: PointDraft): void {
  const idx = m.points.findIndex((x) => x.id === pointId);
  if (idx < 0) fail('Point introuvable.');
  const lineup = [...new Set(draft.lineup)];
  if (lineup.length === 0) fail('La ligne doit contenir au moins un joueur.');
  if (lineup.length > MAX_LINE_SIZE) fail(`Une ligne ne peut pas dépasser ${MAX_LINE_SIZE} joueurs.`);

  if (draft.result === null && idx !== m.points.length - 1) {
    fail('Seul le dernier point peut être « en cours ».');
  }
  let scorerId: string | null = null;
  let assistId: string | null = null;
  if (draft.result === 'pour') {
    if (!draft.scorerId) fail('Choisis le marqueur du point.');
    if (!lineup.includes(draft.scorerId)) fail("Le marqueur n'est pas dans la ligne.");
    scorerId = draft.scorerId;
    if (draft.assistId) {
      if (draft.assistId === scorerId) fail('Le passeur et le marqueur doivent être différents.');
      if (!lineup.includes(draft.assistId)) fail("Le passeur n'est pas dans la ligne.");
      assistId = draft.assistId;
    }
  }
  for (const e of draft.events) {
    if (!lineup.includes(e.playerId)) fail("Un événement concerne un joueur qui n'est pas dans la ligne.");
  }
  if (draft.events.filter((e) => e.type === 'pull').length > 1) fail('Un seul pull par point.');

  m.points[idx] = {
    id: pointId,
    lineup,
    lineType: draft.lineType,
    startedOn: draft.startedOn,
    events: draft.events.map((e) => ({ ...e })),
    result: draft.result,
    scorerId,
    assistId,
  };
}

/** Termine le match. Un point en cours sans aucun événement est supprimé. */
export function finishMatch(m: Match): void {
  const open = getOpenPoint(m);
  if (open && open.events.length === 0) m.points.pop();
  m.status = 'termine';
}

export function reopenMatch(m: Match): void {
  m.status = 'en_cours';
}

export interface PointLine {
  index: number;
  point: Point;
  /** Score après ce point. */
  pour: number;
  contre: number;
}

export function pointLines(m: Match): PointLine[] {
  let pour = 0;
  let contre = 0;
  return m.points.map((point, index) => {
    if (point.result === 'pour') pour++;
    else if (point.result === 'contre') contre++;
    return { index, point, pour, contre };
  });
}
