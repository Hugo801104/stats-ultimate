// Feuille de match d'un tournoi, tenue par la table de marque.
//   • Pendant le match : chrono, « + Point » pour chaque équipe, temps morts (avec compte à rebours),
//     rappel des règles de cap. Chaque action est annulable.
//   • Après le match : la feuille est entièrement modifiable (points, temps, temps morts, durée, notes).

import { getState, update } from '../../store';
import {
  SheetError, addGoalAt, addTimeoutAt, callTimeout, elapsedMs, endTimeout, finishGame, formatClock, parseClock, pauseClock,
  phaseMessage, removeGoal, removeTimeout, reopenGame, rulesSummary, scorePoint, setClock, sheetState, sheetText, sortedGoals, startClock,
  updateGoal, type SheetState,
} from '../../tournament';
import type { TeamSide, Tournament, TournamentGame } from '../../types';
import { confirmDialog, emptyState, errorMessage, field, openModal, toast, vibrate } from '../components';
import { h, icon } from '../dom';
import { gameSheetPdf, pdfFileName } from '../../sheetPdf';
import { sharePdf } from '../files';
import { shareText } from '../files';
import { navigate, requestRender, type View } from '../router';
import { openGameForm } from './tournaments';

/* ---------- Accès et modifications annulables ---------- */

function find(tid: string, gid: string): { t: Tournament; g: TournamentGame } | null {
  const t = getState().tournaments.find((x) => x.id === tid);
  const g = t?.games.find((x) => x.id === gid);
  return t && g ? { t, g } : null;
}

let history: { gid: string; stack: string[] } = { gid: '', stack: [] };

function undoStack(gid: string): string[] {
  if (history.gid !== gid) history = { gid, stack: [] };
  return history.stack;
}

function mutate(tid: string, gid: string, fn: (g: TournamentGame) => void, undoable = true): boolean {
  const before = find(tid, gid);
  if (!before) return false;
  const snapshot = JSON.stringify(before.g);
  try {
    update((s) => {
      const g = s.tournaments.find((x) => x.id === tid)?.games.find((x) => x.id === gid);
      if (!g) throw new SheetError('Match introuvable.');
      fn(g);
    });
  } catch (err) {
    toast(errorMessage(err), { kind: 'error' });
    return false;
  }
  if (undoable) {
    const stack = undoStack(gid);
    stack.push(snapshot);
    if (stack.length > 80) stack.shift();
  }
  return true;
}

function undo(tid: string, gid: string): void {
  const snapshot = undoStack(gid).pop();
  if (!snapshot) return;
  const restored = JSON.parse(snapshot) as TournamentGame;
  update((s) => {
    const t = s.tournaments.find((x) => x.id === tid);
    const i = t?.games.findIndex((x) => x.id === gid) ?? -1;
    if (t && i >= 0) {
      // On garde le chrono tel quel : annuler un point ne doit pas remonter le temps.
      const cur = t.games[i]!;
      t.games[i] = { ...restored, clockMs: cur.clockMs, runningSince: cur.runningSince, status: cur.status === 'termine' ? restored.status : cur.status };
    }
  });
  vibrate(20);
  toast('Dernière action annulée.');
}

/* ---------- Signal sonore (cap, fin de temps mort) ---------- */

let audio: AudioContext | null = null;
function beep(times = 2): void {
  try {
    audio ??= new AudioContext();
    const ctx = audio;
    for (let i = 0; i < times; i++) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = 880;
      osc.connect(gain);
      gain.connect(ctx.destination);
      const t0 = ctx.currentTime + i * 0.35;
      gain.gain.setValueAtTime(0.25, t0);
      gain.gain.exponentialRampToValueAtTime(0.001, t0 + 0.25);
      osc.start(t0);
      osc.stop(t0 + 0.26);
    }
  } catch {
    /* son indisponible */
  }
  try { navigator.vibrate?.([200, 100, 200]); } catch { /* non supporté */ }
}

/* ---------- Écran toujours allumé ---------- */

let wakeLock: WakeLockSentinel | null = null;
async function ensureWakeLock(): Promise<void> {
  try {
    if (wakeLock && !wakeLock.released) return;
    wakeLock = (await navigator.wakeLock?.request('screen')) ?? null;
  } catch {
    wakeLock = null;
  }
}

/* ---------- Chrono : mise à jour de l'affichage sans tout redessiner ---------- */

let ticker: number | null = null;
let watched: { tid: string; gid: string; phase: string; timeoutOver: boolean } | null = null;

function tick(): void {
  if (!watched) return;
  const found = find(watched.tid, watched.gid);
  if (!found) return;
  const { g } = found;
  const now = Date.now();
  const s = sheetState(g, now);
  for (const el of document.querySelectorAll<HTMLElement>('[data-clock]')) {
    const kind = el.dataset.clock;
    if (kind === 'elapsed') el.textContent = formatClock(s.elapsedMs);
    else if (kind === 'remaining') el.textContent = Number.isFinite(s.remainingMs) ? formatClock(Math.max(0, s.remainingMs)) : '—';
    else if (kind === 'timeout' && g.timeoutEndsAt !== null) el.textContent = formatClock(Math.max(0, g.timeoutEndsAt - now));
  }
  const timeoutOver = g.timeoutEndsAt !== null && now >= g.timeoutEndsAt;
  if (s.phase !== watched.phase || timeoutOver !== watched.timeoutOver) {
    const wasNormal = watched.phase === 'normal';
    const newlyOver = timeoutOver && !watched.timeoutOver;
    watched.phase = s.phase;
    watched.timeoutOver = timeoutOver;
    if (g.status === 'en_cours' && ((wasNormal && s.phase === 'cap_pending') || newlyOver)) {
      beep(newlyOver ? 2 : 3);
      toast(newlyOver ? 'Fin du temps mort.' : 'Temps de jeu écoulé !', { kind: 'info', group: 'horn' });
    }
    requestRender();
  }
}

function startTicker(tid: string, gid: string): void {
  const found = find(tid, gid);
  if (!watched || watched.gid !== gid) {
    const s = found ? sheetState(found.g) : null;
    watched = { tid, gid, phase: s?.phase ?? 'normal', timeoutOver: !!found?.g.timeoutEndsAt && Date.now() >= found.g.timeoutEndsAt };
  }
  if (ticker === null) ticker = window.setInterval(tick, 250);
}

function stopTicker(): void {
  if (ticker !== null) window.clearInterval(ticker);
  ticker = null;
  watched = null;
  void wakeLock?.release().catch(() => undefined);
  wakeLock = null;
}

/* ---------- Vue ---------- */

export function sheetView(params: Record<string, string>): View {
  const tid = params.tid ?? '';
  const gid = params.gid ?? '';
  const found = find(tid, gid);
  if (!found) {
    return { el: h('div', { class: 'page' }, emptyState('Feuille introuvable', 'Ce match a peut-être été supprimé.', h('a', { class: 'btn btn--primary', href: tid ? `#/tournoi/${tid}` : '#/tournois' }, 'Retour au tournoi'))) };
  }
  const { t, g } = found;
  const s = sheetState(g);
  startTicker(tid, gid);
  if (g.status === 'en_cours') void ensureWakeLock();

  const head = h('header', { class: 'live__head' },
    h('a', { class: 'btn btn--ghost btn--icon', href: `#/tournoi/${t.id}`, 'aria-label': 'Retour au tournoi' }, icon('back')),
    h('div', { class: 'sheet__title' },
      h('b', null, g.label || t.name),
      h('span', { class: 'muted' }, [g.field ? `Terrain ${g.field}` : '', g.scorekeeper ? `Table : ${g.scorekeeper}` : ''].filter(Boolean).join(' · ') || t.name),
    ),
    h('button', { class: 'btn btn--ghost btn--icon', type: 'button', disabled: undoStack(gid).length === 0, 'aria-label': 'Annuler la dernière action', onclick: () => undo(tid, gid) }, icon('undo')),
  );

  const el = h('div', { class: 'live sheet' }, head);
  if (g.status === 'termine') el.append(...editor(t, g, s));
  else el.append(...livePanel(t, g, s));
  return { el, leave: stopTicker };
}

/* ---------- Pendant le match ---------- */

function teamName(g: TournamentGame, team: TeamSide): string {
  return team === 'A' ? g.teamA : g.teamB;
}

function livePanel(t: Tournament, g: TournamentGame, s: SheetState): HTMLElement[] {
  const tid = t.id;
  const gid = g.id;
  const running = g.runningSince !== null;
  const started = g.status === 'en_cours';
  const hasLimit = g.rules.timeCap !== 'aucun';

  const clock = h('section', { class: `clock ${running ? 'is-running' : ''}` },
    h('div', { class: 'clock__main' },
      h('span', { class: 'clock__label' }, 'Temps de jeu'),
      h('span', { class: 'clock__time', 'data-clock': 'elapsed' }, formatClock(s.elapsedMs)),
      hasLimit
        ? h('span', { class: 'clock__sub' }, s.remainingMs > 0 ? ['Reste ', h('b', { 'data-clock': 'remaining' }, formatClock(s.remainingMs)), ` sur ${g.rules.durationMin} min`] : h('b', null, 'Temps écoulé'))
        : h('span', { class: 'clock__sub' }, 'Sans limite de temps'),
    ),
    h('div', { class: 'clock__btns' },
      h('button', {
        class: `btn btn--xl ${running ? '' : 'btn--primary'}`, type: 'button',
        onclick: () => {
          vibrate(20);
          mutate(tid, gid, (x) => (running ? pauseClock(x) : startClock(x)), false);
        },
      }, icon(running ? 'pause' : 'play', 20), running ? ' Pause' : started ? ' Reprendre' : ' Lancer le chrono'),
      started ? h('button', { class: 'btn btn--small btn--ghost', type: 'button', onclick: () => openClockFix(tid, gid) }, 'Corriger le chrono') : null,
    ),
  );

  const banner = started
    ? h('div', { class: `phase phase--${s.phase}`, role: 'status' }, phaseMessage(g, s))
    : h('div', { class: 'phase' }, `${rulesSummary(g.rules)}. Lance le chrono au premier pull.`);

  const timeoutBar = g.timeoutEndsAt !== null
    ? (() => {
      const last = g.timeouts[g.timeouts.length - 1];
      const over = Date.now() >= g.timeoutEndsAt;
      return h('div', { class: `timeout-bar ${over ? 'is-over' : ''}` },
        h('span', null, 'Temps mort ', h('b', null, last ? teamName(g, last.team) : ''), ' · ', over ? h('b', null, 'terminé !') : h('b', { 'data-clock': 'timeout' }, formatClock(g.timeoutEndsAt - Date.now()))),
        h('button', { class: 'btn btn--small', type: 'button', onclick: () => mutate(tid, gid, (x) => endTimeout(x), false) }, 'Reprise du jeu'));
    })()
    : null;

  const teamCol = (team: TeamSide): HTMLElement => {
    const score = team === 'A' ? s.scoreA : s.scoreB;
    const left = s.timeoutsLeft[team];
    const lead = score > (team === 'A' ? s.scoreB : s.scoreA);
    return h('div', { class: `team-col team-col--${team} ${s.winner === team ? 'is-winner' : ''}` },
      h('div', { class: 'team-col__name' }, teamName(g, team)),
      h('div', { class: `team-col__score ${lead ? 'is-lead' : ''}`, 'aria-live': 'polite' }, score),
      h('button', {
        class: 'btn btn--point', type: 'button', disabled: !started,
        'aria-label': `Point pour ${teamName(g, team)}`,
        onclick: () => {
          vibrate(25);
          if (mutate(tid, gid, (x) => { scorePoint(x, team); })) {
            const after = find(tid, gid);
            if (after) {
              const ns = sheetState(after.g);
              toast(`Point ${teamName(g, team)} · ${ns.scoreA} – ${ns.scoreB}`, { kind: 'success', group: 'pt', durationMs: 1800 });
            }
          }
        },
      }, '+ Point'),
      h('button', {
        class: 'btn btn--small btn--block', type: 'button', disabled: !started || left === 0 || g.timeoutEndsAt !== null,
        onclick: async () => {
          const ok = await confirmDialog(`Temps mort pour ${teamName(g, team)} ? (${left} restant${left > 1 ? 's' : ''})`, 'Temps mort');
          if (ok && mutate(tid, gid, (x) => callTimeout(x, team))) vibrate(30);
        },
      }, `Temps mort · ${left}/${g.rules.timeoutsPerTeam}`),
    );
  };

  const board = h('section', { class: 'teams' }, teamCol('A'), h('div', { class: 'teams__sep' }, '–'), teamCol('B'));

  const goals = sortedGoals(g);
  let a = 0;
  let b = 0;
  const rows = goals.map((goal) => {
    if (goal.team === 'A') a++; else b++;
    return { goal, a, b };
  }).reverse().slice(0, 6);
  const recent = rows.length
    ? h('div', { class: 'recent' },
      h('h3', null, 'Derniers points'),
      rows.map(({ goal, a: sa, b: sb }) => h('div', { class: 'recent__row' },
        h('span', { class: 'recent__n' }, formatClock(goal.atMs)),
        h('b', null, `${sa} – ${sb}`),
        h('span', null, teamName(g, goal.team)))))
    : null;

  const end = h('button', {
    class: `btn btn--block ${s.phase === 'over' ? 'btn--primary btn--xl' : 'btn--danger-ghost'}`, type: 'button', disabled: !started,
    onclick: async () => {
      const ok = await confirmDialog(`Terminer le match sur le score de ${g.teamA} ${s.scoreA} – ${s.scoreB} ${g.teamB} ? La feuille restera modifiable.`, 'Terminer');
      if (ok && mutate(tid, gid, (x) => finishGame(x))) toast('Match terminé. Vérifie la feuille avant de la rendre.', { kind: 'success' });
    },
  }, 'Terminer le match');

  const extra = h('div', { class: 'inline-actions' },
    h('button', { class: 'btn btn--small', type: 'button', onclick: () => openGameForm(t, g) }, icon('edit', 16), ' Équipes, table, règles'),
    h('button', { class: 'btn btn--small', type: 'button', onclick: () => void exportSheetPdf(t, g) }, icon('pdf', 16), started ? ' Feuille PDF' : ' Feuille vierge PDF'),
    started ? null : deleteButton(t, g));

  return [clock, banner, timeoutBar, board, recent, h('div', { class: 'stack stack--end' }, end, extra)].filter((x): x is HTMLElement => x !== null);
}

async function exportSheetPdf(t: Tournament, g: TournamentGame): Promise<void> {
  try {
    const r = await sharePdf(gameSheetPdf(t, g), pdfFileName('feuille', g.teamA, g.teamB), `Feuille de match · ${g.teamA} – ${g.teamB}`);
    toast(r === 'shared' ? 'Feuille PDF prête.' : 'Feuille PDF téléchargée.', { kind: 'success' });
  } catch (err) {
    toast(`PDF impossible : ${errorMessage(err)}`, { kind: 'error' });
  }
}

function deleteButton(t: Tournament, g: TournamentGame): HTMLElement {
  return h('button', { class: 'btn btn--small btn--danger-ghost', type: 'button', onclick: async () => {
    const ok = await confirmDialog(`Supprimer la feuille ${g.teamA} – ${g.teamB} ? C’est définitif.`, 'Supprimer', true);
    if (!ok) return;
    update((st) => { const tour = st.tournaments.find((x) => x.id === t.id); if (tour) tour.games = tour.games.filter((x) => x.id !== g.id); });
    navigate(`/tournoi/${t.id}`);
    toast('Match supprimé.');
  } }, 'Supprimer ce match');
}

function openClockFix(tid: string, gid: string): void {
  const found = find(tid, gid);
  if (!found) return;
  const input = h('input', { type: 'text', inputmode: 'numeric', value: formatClock(elapsedMs(found.g)), placeholder: 'mm:ss' });
  const error = h('p', { class: 'form-error', role: 'alert', hidden: true });
  const form = h('form', { class: 'form' },
    field('Temps de jeu', input, 'Format minutes:secondes, ex. 23:15.'),
    error,
    h('div', { class: 'modal__actions' }, h('button', { class: 'btn btn--primary', type: 'submit' }, 'Appliquer')));
  const modal = openModal('Corriger le chrono', form);
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const ms = parseClock(input.value);
    if (ms === null) { error.textContent = 'Format attendu : mm:ss'; error.hidden = false; return; }
    if (mutate(tid, gid, (x) => setClock(x, ms))) modal.close();
  });
}

/* ---------- Après le match : édition de la feuille ---------- */

function timeInput(ms: number, onValid: (ms: number) => void, label: string): HTMLInputElement {
  return h('input', {
    type: 'text', inputmode: 'numeric', class: 'time-input', value: formatClock(ms), 'aria-label': label,
    onchange: (e: Event) => {
      const el = e.target as HTMLInputElement;
      const v = parseClock(el.value);
      if (v === null) { toast('Temps attendu au format mm:ss.', { kind: 'error' }); el.value = formatClock(ms); return; }
      onValid(v);
    },
  });
}

function teamSelect(g: TournamentGame, value: TeamSide, onChange: (t: TeamSide) => void, label: string): HTMLSelectElement {
  return h('select', { value, 'aria-label': label, onchange: (e: Event) => onChange((e.target as HTMLSelectElement).value as TeamSide) },
    h('option', { value: 'A' }, g.teamA), h('option', { value: 'B' }, g.teamB));
}

function editor(t: Tournament, g: TournamentGame, s: SheetState): HTMLElement[] {
  const tid = t.id;
  const gid = g.id;
  const edit = (fn: (x: TournamentGame) => void): void => { mutate(tid, gid, fn); };
  const winner = s.scoreA === s.scoreB ? null : s.scoreA > s.scoreB ? 'A' : 'B';

  const hero = h('section', { class: 'card sheet-hero' },
    h('div', { class: 'sheet-hero__score' },
      h('span', { class: winner === 'A' ? 'is-win' : '' }, g.teamA),
      h('b', null, `${s.scoreA} – ${s.scoreB}`),
      h('span', { class: winner === 'B' ? 'is-win' : '' }, g.teamB)),
    h('p', { class: 'center muted' }, winner ? `Victoire de ${teamName(g, winner)}` : 'Match nul', ` · durée ${formatClock(s.elapsedMs)}`),
    h('p', { class: 'center hint' }, rulesSummary(g.rules)),
    h('div', { class: 'inline-actions sheet-hero__actions' },
      h('button', { class: 'btn btn--small', type: 'button', onclick: () => openGameForm(t, g) }, icon('edit', 16), ' Équipes, table, règles'),
      h('button', { class: 'btn btn--small', type: 'button', onclick: async () => {
        const r = await shareText(`Feuille de match · ${g.teamA} – ${g.teamB}`, sheetText(t, g));
        if (r === 'copied') toast('Feuille copiée dans le presse-papiers.', { kind: 'success' });
        else if (r === 'failed') toast('Partage impossible sur cet appareil.', { kind: 'error' });
      } }, icon('share', 16), ' Texte'),
      h('button', { class: 'btn btn--small btn--primary', type: 'button', onclick: () => void exportSheetPdf(t, g) }, icon('pdf', 16), ' Feuille PDF'),
      h('button', { class: 'btn btn--small', type: 'button', onclick: () => { mutate(tid, gid, (x) => reopenGame(x)); } }, 'Reprendre la saisie'),
    ),
  );

  /* Points */
  let a = 0;
  let b = 0;
  const goalRows = sortedGoals(g).map((goal, i) => {
    if (goal.team === 'A') a++; else b++;
    return h('tr', null,
      h('td', { class: 'num muted' }, i + 1),
      h('td', null, timeInput(goal.atMs, (ms) => edit((x) => updateGoal(x, goal.id, { atMs: ms })), `Temps du point ${i + 1}`)),
      h('td', null, teamSelect(g, goal.team, (team) => edit((x) => updateGoal(x, goal.id, { team })), `Équipe du point ${i + 1}`)),
      h('td', { class: 'num' }, h('b', null, `${a} – ${b}`)),
      h('td', { class: 'num' }, h('button', { class: 'btn btn--ghost btn--icon', type: 'button', 'aria-label': `Supprimer le point ${i + 1}`, onclick: () => edit((x) => removeGoal(x, goal.id)) }, icon('trash', 18))),
    );
  });

  const addRow = (kind: 'goal' | 'timeout'): HTMLElement => {
    let team: TeamSide = 'A';
    let ms = kind === 'goal' ? (sortedGoals(g).at(-1)?.atMs ?? 0) : 0;
    const timeEl = timeInput(ms, (v) => { ms = v; }, 'Temps');
    return h('div', { class: 'sheet-add' },
      teamSelect(g, team, (v) => { team = v; }, 'Équipe'),
      timeEl,
      h('button', { class: 'btn btn--small', type: 'button', onclick: () => {
        const v = parseClock(timeEl.value);
        if (v === null) { toast('Temps attendu au format mm:ss.', { kind: 'error' }); return; }
        edit((x) => (kind === 'goal' ? addGoalAt(x, team, v) : addTimeoutAt(x, team, v)));
      } }, icon('plus', 16), kind === 'goal' ? ' Ajouter un point' : ' Ajouter un temps mort'));
  };

  const goalsSection = h('section', { class: 'card stack' },
    h('h2', null, `Points (${g.goals.length})`),
    goalRows.length
      ? h('div', { class: 'table-wrap' }, h('table', { class: 'table sheet-table' },
        h('thead', null, h('tr', null, h('th', { class: 'num' }, '#'), h('th', null, 'Temps'), h('th', null, 'Équipe'), h('th', { class: 'num' }, 'Score'), h('th'))),
        h('tbody', null, goalRows)))
      : h('p', { class: 'hint' }, 'Aucun point saisi.'),
    addRow('goal'),
  );

  /* Temps morts */
  const toSection = h('section', { class: 'card stack' },
    h('h2', null, `Temps morts (${g.timeouts.length})`),
    h('p', { class: 'hint' }, `${g.teamA} : ${s.timeoutsUsed.A}/${g.rules.timeoutsPerTeam} · ${g.teamB} : ${s.timeoutsUsed.B}/${g.rules.timeoutsPerTeam}`),
    g.timeouts.length
      ? h('ul', { class: 'plain-list' }, g.timeouts.map((to, i) => h('li', null,
        h('span', { class: 'inline-actions' },
          timeInput(to.atMs, (ms) => edit((x) => { const y = x.timeouts.find((z) => z.id === to.id); if (y) y.atMs = ms; }), `Temps du temps mort ${i + 1}`),
          teamSelect(g, to.team, (team) => edit((x) => { const y = x.timeouts.find((z) => z.id === to.id); if (y) y.team = team; }), `Équipe du temps mort ${i + 1}`)),
        h('button', { class: 'btn btn--ghost btn--icon', type: 'button', 'aria-label': `Supprimer le temps mort ${i + 1}`, onclick: () => edit((x) => removeTimeout(x, to.id)) }, icon('trash', 18)))))
      : null,
    addRow('timeout'),
  );

  /* Durée + notes */
  const misc = h('section', { class: 'card stack' },
    h('h2', null, 'Durée et remarques'),
    field('Durée totale jouée', timeInput(s.elapsedMs, (ms) => edit((x) => { x.clockMs = ms; }), 'Durée totale')),
    field('Notes (esprit du jeu, incidents…)', h('textarea', { rows: 3, onchange: (e: Event) => { const v = (e.target as HTMLTextAreaElement).value; edit((x) => { x.notes = v; }); } }, g.notes)),
  );

  return [hero, goalsSection, toSection, misc, h('div', { class: 'stack stack--end' }, deleteButton(t, g))];
}
