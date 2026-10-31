// Modèle de données de Stats Ultimate.
// Tout est sérialisable en JSON (stockage local + export de sauvegarde).

export type Position = 'handler' | 'cutter' | 'polyvalent';

export interface Player {
  id: string;
  name: string;
  number: number | null;
  position: Position;
  /** false = archivé (reste dans l'historique, n'apparaît plus dans les choix). */
  active: boolean;
}

export interface Season {
  id: string;
  name: string;
}

/** Événements « 1 touche » pendant un point. Les buts / passes D sont portés par le point. */
export type EventType = 'defense' | 'lancer_rate' | 'drop' | 'pull';

export interface PointEvent {
  id: string;
  type: EventType;
  playerId: string;
}

/** Côté sur lequel l'équipe commence le point. */
export type Side = 'attaque' | 'defense';
/** Nature de la ligne alignée (attaque, défense, ou ligne mixte). */
export type LineType = 'attaque' | 'defense' | 'mixte';
export type PointResult = 'pour' | 'contre';

export interface Point {
  id: string;
  lineup: string[];
  lineType: LineType;
  startedOn: Side;
  events: PointEvent[];
  /** null = point en cours. */
  result: PointResult | null;
  scorerId: string | null;
  assistId: string | null;
}

export type MatchKind = 'match' | 'entrainement';
export type MatchStatus = 'en_cours' | 'termine';

export interface Match {
  id: string;
  seasonId: string;
  kind: MatchKind;
  /** Format AAAA-MM-JJ. */
  date: string;
  opponent: string;
  tournament: string;
  location: string;
  /** Joueurs présents (proposés dans le choix de ligne). */
  presentIds: string[];
  status: MatchStatus;
  points: Point[];
  createdAt: number;
}

export interface WeatherSettings {
  latitude: number;
  longitude: number;
  placeName: string;
  /** Vent soutenu au-delà duquel l'entraînement est « non jouable » (km/h). */
  windLimitKmh: number;
  /** Cumul de pluie sur le créneau au-delà duquel c'est « non jouable » (mm). */
  rainLimitMm: number;
  startHour: number;
  endHour: number;
}

export interface Settings {
  currentSeasonId: string;
  teamName: string;
  lineSize: number;
  weather: WeatherSettings;
}

/* ---------- Tournois (feuilles de match, sans joueurs) ---------- */

/**
 * Que se passe-t-il quand le temps de jeu est écoulé (« time cap ») :
 *  - plus1 : on finit le point en cours, puis on joue jusqu'au meilleur score + 1 ;
 *  - fin   : on finit le point en cours et le match s'arrête (point décisif si égalité) ;
 *  - aucun : pas de limite de temps, seul le score compte.
 */
export type TimeCapMode = 'plus1' | 'fin' | 'aucun';

export interface GameRules {
  /** Temps de jeu en minutes (ignoré si timeCap = 'aucun'). */
  durationMin: number;
  /** Partie en N points. */
  targetPoints: number;
  /**
   * Plafond de points (« cap à N ») : à partir du score cible il faut 2 points d'écart,
   * jusqu'à ce plafond. null = le premier au score cible gagne.
   */
  pointCap: number | null;
  timeCap: TimeCapMode;
  /** Temps morts autorisés par équipe et par match. */
  timeoutsPerTeam: number;
  /** Durée d'un temps mort (secondes). */
  timeoutSeconds: number;
}

export type TeamSide = 'A' | 'B';

export interface SheetGoal {
  id: string;
  team: TeamSide;
  /** Temps de jeu (ms) au moment du point. */
  atMs: number;
}

export interface SheetTimeout {
  id: string;
  team: TeamSide;
  atMs: number;
}

export type GameStatus = 'a_venir' | 'en_cours' | 'termine';

export interface TournamentGame {
  id: string;
  /** Ex. « Poule A – match 3 », « Finale ». */
  label: string;
  field: string;
  /** Heure prévue (HH:MM), optionnelle. */
  time: string;
  teamA: string;
  teamB: string;
  /** Équipe qui tient la table de marque. */
  scorekeeper: string;
  rules: GameRules;
  status: GameStatus;
  /** Chrono : temps cumulé + instant de reprise (null = arrêté). */
  clockMs: number;
  runningSince: number | null;
  goals: SheetGoal[];
  timeouts: SheetTimeout[];
  /** Fin du temps mort en cours (horodatage), pour le compte à rebours. */
  timeoutEndsAt: number | null;
  notes: string;
  createdAt: number;
}

export interface Tournament {
  id: string;
  name: string;
  /** Format AAAA-MM-JJ. */
  date: string;
  location: string;
  /** Équipes engagées (pour les choix rapides). */
  teams: string[];
  /** Règles par défaut des matchs du tournoi (modifiables match par match). */
  rules: GameRules;
  games: TournamentGame[];
  createdAt: number;
}

export interface AppState {
  version: number;
  players: Player[];
  seasons: Season[];
  matches: Match[];
  tournaments: Tournament[];
  settings: Settings;
}

export const STATE_VERSION = 1;
export const MAX_LINE_SIZE = 14;
