import type { EventType, LineType, Position, Side } from './types';

export const EVENT_LABELS: Record<EventType, string> = {
  defense: 'Défense (D)',
  lancer_rate: 'Lancer raté',
  drop: 'Drop',
  pull: 'Pull',
};

export const POSITION_LABELS: Record<Position, string> = {
  handler: 'Handler',
  cutter: 'Cutter',
  polyvalent: 'Polyvalent',
};

export const LINE_LABELS: Record<LineType, string> = {
  attaque: 'Attaque',
  defense: 'Défense',
  mixte: 'Mixte',
};

export const SIDE_LABELS: Record<Side, string> = {
  attaque: 'On attaque',
  defense: 'On défend (pull)',
};
