// Feuilles de match de tournoi : chrono, score, temps morts et règles de cap.
// Les fonctions qui modifient une rencontre valident AVANT de modifier et lèvent
// une SheetError au message lisible (même principe que match.ts).

import type { GameRules, SheetGoal, TeamSide, TimeCapMode, Tournament, TournamentGame } from './types';
import { uid } from './util';

export class SheetError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SheetError';
  }
}

function fail(message: string): never {
  throw new SheetError(message);
}

export const DEFAULT_RULES: GameRules = {
  durationMin: 45,
  targetPoints: 13,
  pointCap: null,
  timeCap: 'plus1',
  timeoutsPerTeam: 1,
  timeoutSeconds: 75,
};

export const TIME_CAP_LABELS: Record<TimeCapMode, string> = {
  plus1: 'Cap +1',
  fin: 'Arrêt net',
  aucun: 'Sans limite de temps',
};

export const other = (t: TeamSide): TeamSide => (t === 'A' ? 'B' : 'A');

/** Résumé lisible des règles : « Partie en 13 · cap à 15 · 45 min puis cap +1 · 1 TM de 75 s ». */
export function rulesSummary(r: GameRules): string {
  const parts = [`Partie en ${r.targetPoints}`];
  if (r.pointCap !== null && r.pointCap > r.targetPoints) parts.push(`2 pts d’écart, cap à ${r.pointCap}`);
  if (r.timeCap === 'plus1') parts.push(`${r.durationMin} min puis cap +1`);
  else if (r.timeCap === 'fin') parts.push(`${r.durationMin} min, arrêt net`);
  else parts.push('sans limite de temps');
  parts.push(r.timeoutsPerTeam === 0 ? 'pas de temps mort' : `${r.timeoutsPerTeam} TM/équipe de ${r.timeoutSeconds} s`);
  return parts.join(' · ');
}

/** Vérifie la cohérence des règles ; renvoie un message d'erreur ou null. */
export function rulesError(r: GameRules): string | null {
  if (!Number.isInteger(r.targetPoints) || r.targetPoints < 1 || r.targetPoints > 99) return 'Le score cible doit être entre 1 et 99.';
  if (r.pointCap !== null && (!Number.isInteger(r.pointCap) || r.pointCap < r.targetPoints || r.pointCap > 99)) {
    return 'Le plafond de points doit être supérieur ou égal au score cible.';
  }
  if (r.timeCap !== 'aucun' && (!Number.isFinite(r.durationMin) || r.durationMin < 1 || r.durationMin > 300)) return 'Le temps de jeu doit être entre 1 et 300 minutes.';
  if (!Number.isInteger(r.timeoutsPerTeam) || r.timeoutsPerTeam < 0 || r.timeoutsPerTeam > 10) return 'Entre 0 et 10 temps morts par équipe.';
  if (!Number.isFinite(r.timeoutSeconds) || r.timeoutSeconds < 10 || r.timeoutSeconds > 600) return 'Un temps mort dure entre 10 et 600 secondes.';
  return null;
}

/* ---------- Chrono ---------- */

export function elapsedMs(g: TournamentGame, now = Date.now()): number {
  return g.clockMs + (g.runningSince !== null ? Math.max(0, now - g.runningSince) : 0);
}

export function limitMs(r: GameRules): number {
  return r.timeCap === 'aucun' ? Infinity : r.durationMin * 60_000;
}

/** 754000 → « 12:34 » ; au-delà d'une heure « 1:02:03 ». Négatif → « -0:05 ». */
export function formatClock(ms: number): string {
  const neg = ms < 0;
  const total = Math.floor(Math.abs(ms) / 1000);
  const hh = Math.floor(total / 3600);
  const mm = Math.floor((total % 3600) / 60);
  const ss = total % 60;
  const p = (n: number): string => String(n).padStart(2, '0');
  const body = hh > 0 ? `${hh}:${p(mm)}:${p(ss)}` : `${mm}:${p(ss)}`;
  return neg ? `-${body}` : body;
}

/** « 12:34 » ou « 1:02:03 » → millisecondes ; null si illisible. */
export function parseClock(text: string): number | null {
  const m = text.trim().match(/^(?:(\d+):)?(\d{1,3}):(\d{1,2})$/);
  if (!m) return null;
  const [, hh, mm, ss] = m;
  if (Number(ss) >= 60) return null;
  return ((Number(hh ?? 0) * 60 + Number(mm)) * 60 + Number(ss)) * 1000;
}

/* ---------- Score et règles de fin ---------- */

export type SheetPhase =
  | 'normal' // temps réglementaire
  | 'cap_pending' // temps écoulé : on finit le point en cours
  | 'cap' // cap actif : nouveau score cible
  | 'over'; // le match est gagné selon les règles

export interface SheetState {
  scoreA: number;
  scoreB: number;
  elapsedMs: number;
  /** Temps restant avant le cap (Infinity si pas de limite). Négatif = dépassé. */
  remainingMs: number;
  phase: SheetPhase;
  /** Score à atteindre pour gagner, compte tenu du cap. */
  target: number;
  /** Équipe qui a gagné selon les règles (null tant que ce n'est pas joué). */
  winner: TeamSide | null;
  timeoutsUsed: Record<TeamSide, number>;
  timeoutsLeft: Record<TeamSide, number>;
}

export function sortedGoals(g: TournamentGame): SheetGoal[] {
  return g.goals.map((x, i) => ({ x, i })).sort((a, b) => a.x.atMs - b.x.atMs || a.i - b.i).map((o) => o.x);
}

/** Gagné selon le score cible et le plafond (2 points d'écart jusqu'au plafond). */
function wonByScore(mine: number, theirs: number, r: GameRules): boolean {
  if (mine < r.targetPoints) return false;
  if (r.pointCap === null || r.pointCap <= r.targetPoints) return true;
  return mine - theirs >= 2 || mine >= r.pointCap;
}

export function sheetState(g: TournamentGame, now = Date.now()): SheetState {
  const r = g.rules;
  const limit = limitMs(r);
  const elapsed = elapsedMs(g, now);
  const score: Record<TeamSide, number> = { A: 0, B: 0 };
  let capTarget: number | null = null;
  let capPassed = false;
  let winner: TeamSide | null = null;

  for (const goal of sortedGoals(g)) {
    score[goal.team]++;
    if (winner) continue; // points saisis après la fin : comptés mais sans effet sur le vainqueur
    const t = goal.team;
    if (capTarget !== null) {
      if (score[t] >= capTarget) winner = t;
      continue;
    }
    if (wonByScore(score[t], score[other(t)], r)) {
      winner = t;
      continue;
    }
    if (!capPassed && goal.atMs >= limit) {
      // Ce point était « le point en cours » au moment du cap.
      capPassed = true;
      const high = Math.max(score.A, score.B);
      if (r.timeCap === 'fin' && score.A !== score.B) {
        winner = score.A > score.B ? 'A' : 'B';
      } else {
        // Cap +1, ou arrêt net sur égalité : point décisif.
        capTarget = high + 1;
      }
    }
  }

  let phase: SheetPhase;
  if (winner) phase = 'over';
  else if (capTarget !== null) phase = 'cap';
  else if (elapsed >= limit) phase = 'cap_pending';
  else phase = 'normal';

  let target = capTarget ?? r.targetPoints;
  if (phase !== 'cap' && r.pointCap !== null && r.pointCap > r.targetPoints) {
    // Avec 2 points d'écart : la cible monte tant que l'écart n'est pas fait.
    const high = Math.max(score.A, score.B);
    const low = Math.min(score.A, score.B);
    if (high >= r.targetPoints - 1) target = Math.min(r.pointCap, Math.max(r.targetPoints, low + 2));
  }

  const used: Record<TeamSide, number> = { A: 0, B: 0 };
  for (const t of g.timeouts) used[t.team]++;

  return {
    scoreA: score.A,
    scoreB: score.B,
    elapsedMs: elapsed,
    remainingMs: limit - elapsed,
    phase,
    target,
    winner,
    timeoutsUsed: used,
    timeoutsLeft: { A: Math.max(0, r.timeoutsPerTeam - used.A), B: Math.max(0, r.timeoutsPerTeam - used.B) },
  };
}

/** Phrase d'état pour la table de marque. */
export function phaseMessage(g: TournamentGame, s: SheetState): string {
  const name = (t: TeamSide): string => (t === 'A' ? g.teamA : g.teamB);
  switch (s.phase) {
    case 'over':
      return `${name(s.winner!)} gagne ${Math.max(s.scoreA, s.scoreB)} – ${Math.min(s.scoreA, s.scoreB)}. Tu peux terminer le match.`;
    case 'cap_pending':
      return g.rules.timeCap === 'fin'
        ? 'Temps écoulé : on termine le point en cours, puis fin du match.'
        : 'Temps écoulé : on termine le point en cours, puis cap +1.';
    case 'cap':
      return `Cap : la première équipe à ${s.target} gagne.`;
    default:
      return s.target !== g.rules.targetPoints
        ? `2 points d’écart : partie en ${s.target} (cap à ${g.rules.pointCap}).`
        : `Partie en ${s.target}.`;
  }
}

/* ---------- Création ---------- */

export function newTournament(name: string, date: string, location: string, teams: string[], rules: GameRules): Tournament {
  return { id: uid(), name, date, location, teams: cleanTeams(teams), rules: { ...rules }, games: [], createdAt: Date.now() };
}

export function cleanTeams(teams: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of teams) {
    const t = raw.trim().replace(/\s+/g, ' ');
    const key = t.toLocaleLowerCase('fr');
    if (t && !seen.has(key)) {
      seen.add(key);
      out.push(t);
    }
  }
  return out;
}

export interface GameDraft {
  label: string;
  field: string;
  time: string;
  teamA: string;
  teamB: string;
  scorekeeper: string;
  rules: GameRules;
}

export function validateGame(d: GameDraft): string | null {
  const a = d.teamA.trim();
  const b = d.teamB.trim();
  if (!a || !b) return 'Indique les deux équipes.';
  if (a.toLocaleLowerCase('fr') === b.toLocaleLowerCase('fr')) return 'Les deux équipes doivent être différentes.';
  if (d.time && !/^\d{2}:\d{2}$/.test(d.time)) return 'Heure invalide.';
  return rulesError(d.rules);
}

export function newGame(d: GameDraft): TournamentGame {
  const err = validateGame(d);
  if (err) fail(err);
  return {
    id: uid(),
    label: d.label.trim(),
    field: d.field.trim(),
    time: d.time,
    teamA: d.teamA.trim(),
    teamB: d.teamB.trim(),
    scorekeeper: d.scorekeeper.trim(),
    rules: { ...d.rules },
    status: 'a_venir',
    clockMs: 0,
    runningSince: null,
    goals: [],
    timeouts: [],
    timeoutEndsAt: null,
    notes: '',
    createdAt: Date.now(),
  };
}

/* ---------- Pendant le match ---------- */

export function startClock(g: TournamentGame, now = Date.now()): void {
  if (g.status === 'termine') fail('Le match est terminé : rouvre la feuille pour relancer le chrono.');
  if (g.runningSince !== null) return;
  g.status = 'en_cours';
  g.runningSince = now;
}

export function pauseClock(g: TournamentGame, now = Date.now()): void {
  if (g.runningSince === null) return;
  g.clockMs = elapsedMs(g, now);
  g.runningSince = null;
}

/** Remet le chrono à une valeur précise (correction pendant le match). */
export function setClock(g: TournamentGame, ms: number, now = Date.now()): void {
  if (!Number.isFinite(ms) || ms < 0) fail('Temps invalide.');
  g.clockMs = ms;
  if (g.runningSince !== null) g.runningSince = now;
}

export function scorePoint(g: TournamentGame, team: TeamSide, now = Date.now()): SheetGoal {
  if (g.status === 'termine') fail('Le match est terminé : rouvre la feuille pour ajouter un point.');
  if (g.status === 'a_venir') fail('Lance le chrono pour démarrer le match.');
  const goal: SheetGoal = { id: uid(), team, atMs: Math.round(elapsedMs(g, now)) };
  g.goals.push(goal);
  g.timeoutEndsAt = null;
  return goal;
}

export function callTimeout(g: TournamentGame, team: TeamSide, now = Date.now()): void {
  if (g.status !== 'en_cours') fail('Le temps mort se pose pendant le match.');
  const left = sheetState(g, now).timeoutsLeft[team];
  if (left <= 0) fail(`${team === 'A' ? g.teamA : g.teamB} n’a plus de temps mort.`);
  g.timeouts.push({ id: uid(), team, atMs: Math.round(elapsedMs(g, now)) });
  g.timeoutEndsAt = now + g.rules.timeoutSeconds * 1000;
}

export function endTimeout(g: TournamentGame): void {
  g.timeoutEndsAt = null;
}

export function finishGame(g: TournamentGame, now = Date.now()): void {
  pauseClock(g, now);
  g.timeoutEndsAt = null;
  g.status = 'termine';
}

export function reopenGame(g: TournamentGame): void {
  if (g.status !== 'termine') return;
  g.status = 'en_cours';
}

/* ---------- Édition de la feuille ---------- */

export function updateGoal(g: TournamentGame, id: string, patch: Partial<Pick<SheetGoal, 'team' | 'atMs'>>): void {
  const goal = g.goals.find((x) => x.id === id);
  if (!goal) fail('Point introuvable.');
  if (patch.atMs !== undefined && (!Number.isFinite(patch.atMs) || patch.atMs < 0)) fail('Temps invalide.');
  Object.assign(goal, patch);
}

export function removeGoal(g: TournamentGame, id: string): void {
  const i = g.goals.findIndex((x) => x.id === id);
  if (i < 0) fail('Point introuvable.');
  g.goals.splice(i, 1);
}

export function addGoalAt(g: TournamentGame, team: TeamSide, atMs: number): void {
  if (!Number.isFinite(atMs) || atMs < 0) fail('Temps invalide.');
  g.goals.push({ id: uid(), team, atMs: Math.round(atMs) });
}

export function addTimeoutAt(g: TournamentGame, team: TeamSide, atMs: number): void {
  if (!Number.isFinite(atMs) || atMs < 0) fail('Temps invalide.');
  g.timeouts.push({ id: uid(), team, atMs: Math.round(atMs) });
  g.timeouts.sort((a, b) => a.atMs - b.atMs);
}

export function removeTimeout(g: TournamentGame, id: string): void {
  const i = g.timeouts.findIndex((x) => x.id === id);
  if (i < 0) fail('Temps mort introuvable.');
  g.timeouts.splice(i, 1);
}

/* ---------- Bilan du tournoi ---------- */

export interface TeamStanding {
  team: string;
  played: number;
  won: number;
  lost: number;
  drawn: number;
  pointsFor: number;
  pointsAgainst: number;
}

/** Bilan par équipe sur les matchs terminés. */
export function standings(t: Tournament): TeamStanding[] {
  const map = new Map<string, TeamStanding>();
  const row = (team: string): TeamStanding => {
    let s = map.get(team);
    if (!s) {
      s = { team, played: 0, won: 0, lost: 0, drawn: 0, pointsFor: 0, pointsAgainst: 0 };
      map.set(team, s);
    }
    return s;
  };
  for (const team of t.teams) row(team);
  for (const g of t.games) {
    if (g.status !== 'termine') continue;
    const s = sheetState(g);
    const a = row(g.teamA);
    const b = row(g.teamB);
    a.played++; b.played++;
    a.pointsFor += s.scoreA; a.pointsAgainst += s.scoreB;
    b.pointsFor += s.scoreB; b.pointsAgainst += s.scoreA;
    if (s.scoreA > s.scoreB) { a.won++; b.lost++; } else if (s.scoreB > s.scoreA) { b.won++; a.lost++; } else { a.drawn++; b.drawn++; }
  }
  return [...map.values()].sort(
    (x, y) => y.won - x.won || (y.pointsFor - y.pointsAgainst) - (x.pointsFor - x.pointsAgainst) || y.pointsFor - x.pointsFor || x.team.localeCompare(y.team, 'fr'),
  );
}

/** Feuille de match en texte (partage / impression). */
export function sheetText(t: Tournament, g: TournamentGame): string {
  const s = sheetState(g);
  const lines = [
    `${t.name}${g.label ? ` · ${g.label}` : ''}`,
    `${g.teamA} ${s.scoreA} – ${s.scoreB} ${g.teamB}`,
    ...(g.scorekeeper ? [`Table de marque : ${g.scorekeeper}`] : []),
    `Règles : ${rulesSummary(g.rules)}`,
    `Durée jouée : ${formatClock(s.elapsedMs)}`,
    '',
  ];
  let a = 0;
  let b = 0;
  for (const goal of sortedGoals(g)) {
    if (goal.team === 'A') a++; else b++;
    lines.push(`${formatClock(goal.atMs).padStart(6)}  ${a}-${b}  ${goal.team === 'A' ? g.teamA : g.teamB}`);
  }
  if (g.timeouts.length) {
    lines.push('', 'Temps morts :');
    for (const to of g.timeouts) lines.push(`${formatClock(to.atMs).padStart(6)}  ${to.team === 'A' ? g.teamA : g.teamB}`);
  }
  if (g.notes.trim()) lines.push('', `Notes : ${g.notes.trim()}`);
  return lines.join('\n');
}
