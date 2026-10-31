// filepath: src/storage.ts
import { uid } from './id';
import type { AppData, Match, Player, Season } from './types';

const KEY = 'plouf-stats:v1';
const CORRUPT_KEY = 'plouf-stats:v1:corrupt';

/** Nom de saison pour une date : la saison commence en septembre. */
export function seasonNameFor(date: Date): string {
  const start = date.getMonth() >= 8 ? date.getFullYear() : date.getFullYear() - 1;
  return `${start}-${start + 1}`;
}

export function createEmptyData(now: Date = new Date()): AppData {
  const season: Season = { id: uid(), name: seasonNameFor(now) };
  return { version: 1, players: [], seasons: [season], matches: [], currentSeasonId: season.id };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requireRecords(value: unknown, label: string): Record<string, unknown>[] {
  if (!Array.isArray(value)) throw new Error(`Le champ « ${label} » est absent ou invalide.`);
  for (const item of value) {
    if (!isRecord(item) || typeof item.id !== 'string') {
      throw new Error(`Un élément de « ${label} » est invalide.`);
    }
  }
  return value as Record<string, unknown>[];
}

/** Valide un objet inconnu (fichier importé ou stockage) et le renvoie typé. */
export function parseData(raw: unknown): AppData {
  if (!isRecord(raw) || raw.version !== 1) {
    throw new Error('Format de fichier non reconnu (version 1 attendue).');
  }
  const players = requireRecords(raw.players, 'players') as unknown as Player[];
  const seasons = requireRecords(raw.seasons, 'seasons') as unknown as Season[];
  const matches = requireRecords(raw.matches, 'matches') as unknown as Match[];
  for (const m of matches) {
    if (!Array.isArray(m.points)) throw new Error('Un match ne contient pas de liste de points.');
    if (m.current === undefined) m.current = null;
  }
  if (seasons.length === 0) {
    seasons.push({ id: uid(), name: seasonNameFor(new Date()) });
  }
  const requested = typeof raw.currentSeasonId === 'string' ? raw.currentSeasonId : '';
  const currentSeasonId = seasons.some((s) => s.id === requested) ? requested : (seasons[0] as Season).id;
  return { version: 1, players, seasons, matches, currentSeasonId };
}

export function serializeData(data: AppData): string {
  return JSON.stringify(data, null, 2);
}

export function loadData(): AppData {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(KEY);
    if (!raw) return createEmptyData();
    return parseData(JSON.parse(raw));
  } catch {
    // Données illisibles : on les met de côté plutôt que de les écraser.
    try {
      if (raw) localStorage.setItem(CORRUPT_KEY, raw);
    } catch {
      /* stockage indisponible */
    }
    return createEmptyData();
  }
}

/** Renvoie false si l'écriture échoue (quota dépassé, navigation privée…). */
export function saveData(data: AppData): boolean {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}
