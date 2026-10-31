import {
  STATE_VERSION,
  type AppState,
  type EventType,
  type LineType,
  type Match,
  type MatchKind,
  type MatchStatus,
  type Player,
  type Point,
  type PointEvent,
  type PointResult,
  type Position,
  type Season,
  type Settings,
  type Side,
  type WeatherSettings,
  type GameRules,
  type GameStatus,
  type SheetGoal,
  type SheetTimeout,
  type TeamSide,
  type TimeCapMode,
  type Tournament,
  type TournamentGame,
} from './types';
import { DEFAULT_RULES, cleanTeams } from './tournament';
import { isISODate, seasonNameFor, todayISO, uid } from './util';

export const DEFAULT_WEATHER: WeatherSettings = {
  // La Chevrolière (Loire-Atlantique), près du lac de Grand-Lieu. Modifiable dans les réglages.
  latitude: 46.99,
  longitude: -1.62,
  placeName: 'La Chevrolière',
  windLimitKmh: 25,
  rainLimitMm: 1,
  startHour: 19,
  endHour: 21,
};

export function defaultState(now: Date = new Date()): AppState {
  const season: Season = { id: uid(), name: seasonNameFor(now) };
  return {
    version: STATE_VERSION,
    players: [],
    seasons: [season],
    matches: [],
    tournaments: [],
    settings: {
      currentSeasonId: season.id,
      teamName: 'Mon équipe',
      lineSize: 7,
      weather: { ...DEFAULT_WEATHER },
    },
  };
}

type Rec = Record<string, unknown>;
const isRec = (v: unknown): v is Rec => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown, fallback = ''): string => (typeof v === 'string' ? v : fallback);
const num = (v: unknown, fallback: number): number =>
  typeof v === 'number' && Number.isFinite(v) ? v : fallback;
function oneOf<T extends string>(v: unknown, allowed: readonly T[], fallback: T): T {
  return typeof v === 'string' && (allowed as readonly string[]).includes(v) ? (v as T) : fallback;
}
const strArray = (v: unknown): string[] =>
  Array.isArray(v) ? [...new Set(v.filter((x): x is string => typeof x === 'string'))] : [];

const POSITIONS: readonly Position[] = ['handler', 'cutter', 'polyvalent'];
const EVENT_TYPES: readonly EventType[] = ['defense', 'lancer_rate', 'drop', 'pull'];
const LINE_TYPES: readonly LineType[] = ['attaque', 'defense', 'mixte'];
const SIDES: readonly Side[] = ['attaque', 'defense'];
const KINDS: readonly MatchKind[] = ['match', 'entrainement'];
const STATUSES: readonly MatchStatus[] = ['en_cours', 'termine'];

function normPlayer(raw: unknown): Player | null {
  if (!isRec(raw)) return null;
  const name = str(raw.name).trim();
  if (!name) return null;
  const n = raw.number;
  return {
    id: str(raw.id) || uid(),
    name,
    number: typeof n === 'number' && Number.isInteger(n) && n >= 0 && n <= 999 ? n : null,
    position: oneOf(raw.position, POSITIONS, 'polyvalent'),
    active: raw.active !== false,
  };
}

function normEvent(raw: unknown): PointEvent | null {
  if (!isRec(raw)) return null;
  if (typeof raw.type !== 'string' || !(EVENT_TYPES as readonly string[]).includes(raw.type)) return null;
  const playerId = str(raw.playerId);
  if (!playerId) return null;
  return { id: str(raw.id) || uid(), type: raw.type as EventType, playerId };
}

function normPoint(raw: unknown): Point | null {
  if (!isRec(raw)) return null;
  const lineup = strArray(raw.lineup);
  const result: PointResult | null = raw.result === 'pour' || raw.result === 'contre' ? raw.result : null;
  const scorerId = result === 'pour' && typeof raw.scorerId === 'string' ? raw.scorerId : null;
  const assistId =
    result === 'pour' && scorerId && typeof raw.assistId === 'string' && raw.assistId !== scorerId
      ? raw.assistId
      : null;
  const events = (Array.isArray(raw.events) ? raw.events : [])
    .map(normEvent)
    .filter((e): e is PointEvent => e !== null);
  const startedOn = oneOf(raw.startedOn, SIDES, 'attaque');
  return {
    id: str(raw.id) || uid(),
    lineup,
    lineType: oneOf(raw.lineType, LINE_TYPES, startedOn),
    startedOn,
    events,
    result,
    scorerId,
    assistId,
  };
}

function normMatch(raw: unknown, seasonIds: Set<string>, fallbackSeason: string, warnings: string[]): Match | null {
  if (!isRec(raw)) return null;
  const date = str(raw.date);
  let seasonId = str(raw.seasonId);
  if (!seasonIds.has(seasonId)) {
    warnings.push('Un match sans saison valide a été rattaché à la première saison.');
    seasonId = fallbackSeason;
  }
  return {
    id: str(raw.id) || uid(),
    seasonId,
    kind: oneOf(raw.kind, KINDS, 'match'),
    date: isISODate(date) ? date : todayISO(),
    opponent: str(raw.opponent).trim(),
    tournament: str(raw.tournament).trim(),
    location: str(raw.location).trim(),
    presentIds: strArray(raw.presentIds),
    status: oneOf(raw.status, STATUSES, 'termine'),
    points: (Array.isArray(raw.points) ? raw.points : [])
      .map(normPoint)
      .filter((p): p is Point => p !== null),
    createdAt: num(raw.createdAt, Date.now()),
  };
}

const TIME_CAPS: readonly TimeCapMode[] = ['plus1', 'fin', 'aucun'];
const GAME_STATUSES: readonly GameStatus[] = ['a_venir', 'en_cours', 'termine'];
const TEAM_SIDES: readonly TeamSide[] = ['A', 'B'];
const int = (v: unknown, fallback: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, Math.round(num(v, fallback))));

export function normRules(raw: unknown, base: GameRules = DEFAULT_RULES): GameRules {
  const r = isRec(raw) ? raw : {};
  const targetPoints = int(r.targetPoints, base.targetPoints, 1, 99);
  const cap = r.pointCap === null ? null : typeof r.pointCap === 'number' ? int(r.pointCap, targetPoints, targetPoints, 99) : base.pointCap;
  return {
    durationMin: int(r.durationMin, base.durationMin, 1, 300),
    targetPoints,
    pointCap: cap !== null && cap > targetPoints ? cap : null,
    timeCap: oneOf(r.timeCap, TIME_CAPS, base.timeCap),
    timeoutsPerTeam: int(r.timeoutsPerTeam, base.timeoutsPerTeam, 0, 10),
    timeoutSeconds: int(r.timeoutSeconds, base.timeoutSeconds, 10, 600),
  };
}

function normMark<T extends SheetGoal | SheetTimeout>(raw: unknown): T | null {
  if (!isRec(raw)) return null;
  if (!(TEAM_SIDES as readonly unknown[]).includes(raw.team)) return null;
  const atMs = num(raw.atMs, -1);
  if (atMs < 0) return null;
  return { id: str(raw.id) || uid(), team: raw.team as TeamSide, atMs } as T;
}

function normGame(raw: unknown, tourRules: GameRules): TournamentGame | null {
  if (!isRec(raw)) return null;
  const teamA = str(raw.teamA).trim();
  const teamB = str(raw.teamB).trim();
  if (!teamA || !teamB) return null;
  const runningSince = typeof raw.runningSince === 'number' && Number.isFinite(raw.runningSince) ? raw.runningSince : null;
  const status = oneOf(raw.status, GAME_STATUSES, 'a_venir');
  const time = str(raw.time);
  const timeoutEndsAt = typeof raw.timeoutEndsAt === 'number' && Number.isFinite(raw.timeoutEndsAt) ? raw.timeoutEndsAt : null;
  return {
    id: str(raw.id) || uid(),
    label: str(raw.label).trim(),
    field: str(raw.field).trim(),
    time: /^\d{2}:\d{2}$/.test(time) ? time : '',
    teamA,
    teamB,
    scorekeeper: str(raw.scorekeeper).trim(),
    rules: normRules(raw.rules, tourRules),
    status,
    clockMs: Math.max(0, num(raw.clockMs, 0)),
    runningSince: status === 'termine' ? null : runningSince,
    goals: (Array.isArray(raw.goals) ? raw.goals : []).map((g) => normMark<SheetGoal>(g)).filter((g): g is SheetGoal => g !== null),
    timeouts: (Array.isArray(raw.timeouts) ? raw.timeouts : []).map((t) => normMark<SheetTimeout>(t)).filter((t): t is SheetTimeout => t !== null),
    timeoutEndsAt: status === 'termine' ? null : timeoutEndsAt,
    notes: str(raw.notes),
    createdAt: num(raw.createdAt, Date.now()),
  };
}

function normTournament(raw: unknown): Tournament | null {
  if (!isRec(raw)) return null;
  const name = str(raw.name).trim();
  if (!name) return null;
  const date = str(raw.date);
  const rules = normRules(raw.rules);
  return {
    id: str(raw.id) || uid(),
    name,
    date: isISODate(date) ? date : todayISO(),
    location: str(raw.location).trim(),
    teams: cleanTeams(Array.isArray(raw.teams) ? raw.teams.filter((t): t is string => typeof t === 'string') : []),
    rules,
    games: (Array.isArray(raw.games) ? raw.games : []).map((g) => normGame(g, rules)).filter((g): g is TournamentGame => g !== null),
    createdAt: num(raw.createdAt, Date.now()),
  };
}

function normWeather(raw: unknown): WeatherSettings {
  const r = isRec(raw) ? raw : {};
  const d = DEFAULT_WEATHER;
  const lat = num(r.latitude, d.latitude);
  const lon = num(r.longitude, d.longitude);
  const startHour = Math.min(23, Math.max(0, Math.round(num(r.startHour, d.startHour))));
  const endHour = Math.min(24, Math.max(startHour + 1, Math.round(num(r.endHour, d.endHour))));
  return {
    latitude: lat >= -90 && lat <= 90 ? lat : d.latitude,
    longitude: lon >= -180 && lon <= 180 ? lon : d.longitude,
    placeName: str(r.placeName, d.placeName).trim() || d.placeName,
    windLimitKmh: Math.min(120, Math.max(5, num(r.windLimitKmh, d.windLimitKmh))),
    rainLimitMm: Math.min(50, Math.max(0, num(r.rainLimitMm, d.rainLimitMm))),
    startHour,
    endHour,
  };
}

/**
 * Valide et nettoie un état (stockage local ou fichier importé).
 * Lève une erreur si la donnée n'est pas du tout exploitable ; sinon corrige et signale.
 */
export function normalizeState(raw: unknown): { state: AppState; warnings: string[] } {
  if (!isRec(raw)) throw new Error('Format de données invalide.');
  const warnings: string[] = [];
  const base = defaultState();

  const players = (Array.isArray(raw.players) ? raw.players : [])
    .map(normPlayer)
    .filter((p): p is Player => p !== null);

  let seasons = (Array.isArray(raw.seasons) ? raw.seasons : [])
    .map((s): Season | null => {
      if (!isRec(s)) return null;
      const name = str(s.name).trim();
      return name ? { id: str(s.id) || uid(), name } : null;
    })
    .filter((s): s is Season => s !== null);
  if (seasons.length === 0) seasons = base.seasons;
  const seasonIds = new Set(seasons.map((s) => s.id));
  const firstSeason = seasons[0]!.id;

  const matches = (Array.isArray(raw.matches) ? raw.matches : [])
    .map((m) => normMatch(m, seasonIds, firstSeason, warnings))
    .filter((m): m is Match => m !== null);

  const tournaments = (Array.isArray(raw.tournaments) ? raw.tournaments : [])
    .map(normTournament)
    .filter((t): t is Tournament => t !== null);

  const s = isRec(raw.settings) ? raw.settings : {};
  const currentSeasonId = seasonIds.has(str(s.currentSeasonId)) ? str(s.currentSeasonId) : firstSeason;
  const settings: Settings = {
    currentSeasonId,
    teamName: str(s.teamName, base.settings.teamName).trim() || base.settings.teamName,
    lineSize: Math.min(14, Math.max(1, Math.round(num(s.lineSize, 7)))),
    weather: normWeather(s.weather),
  };

  return {
    state: { version: STATE_VERSION, players, seasons, matches, tournaments, settings },
    warnings: [...new Set(warnings)],
  };
}
