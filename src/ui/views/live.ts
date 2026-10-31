// Saisie en direct : pensée pour une main, sur le bord du terrain.
//   • Choix de la ligne : on touche les joueurs, puis « Lancer le point ».
//   • Un but = 2 touches : le passeur, puis le marqueur.
//   • D / lancer raté / drop = 1 touche sur le bouton du joueur concerné.
//   • Chaque action est annulable (historique des états du match).

import { sortPlayers } from '../../exporters';
import { LINE_LABELS, SIDE_LABELS } from '../../labels';
import {
  MatchError, concede, finishMatch, getOpenPoint, getScore, logEvent, nextStartSide, reopenMatch, scoreGoal, startPoint,
} from '../../match';
import { getState, update } from '../../store';
import type { EventType, LineType, Match, Player, Point, Side } from '../../types';
import { confirmDialog, emptyState, errorMessage, segmented, toast, vibrate } from '../components';
import { h, icon } from '../dom';
import { navigate, requestRender, type View } from '../router';
import { openMatchForm } from './matchForm';

interface LiveUi {
  matchId: string;
  selected: string[];
  lineType: LineType | null;
  startedOn: Side | null;
  armedPull: boolean;
  passerId: string | null;
  history: string[];
}

let ui: LiveUi | null = null;

function liveUi(matchId: string): LiveUi {
  if (!ui || ui.matchId !== matchId) {
    ui = { matchId, selected: [], lineType: null, startedOn: null, armedPull: false, passerId: null, history: [] };
  }
  return ui;
}

/* ---------- Écran toujours allumé pendant la saisie ---------- */

let wakeLock: WakeLockSentinel | null = null;
async function ensureWakeLock(): Promise<void> {
  try {
    if (wakeLock && !wakeLock.released) return;
    wakeLock = (await navigator.wakeLock?.request('screen')) ?? null;
  } catch {
    wakeLock = null; // non supporté ou refusé : sans importance
  }
}
function releaseWakeLock(): void {
  void wakeLock?.release().catch(() => undefined);
  wakeLock = null;
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && ui && window.location.hash.startsWith('#/live/')) void ensureWakeLock();
});

/* ---------- Modifications annulables ---------- */

function mutate(matchId: string, fn: (m: Match) => void, afterUi?: () => void): boolean {
  const u = liveUi(matchId);
  const before = getState().matches.find((m) => m.id === matchId);
  if (!before) return false;
  const snapshot = JSON.stringify(before);
  try {
    update((s) => {
      const m = s.matches.find((x) => x.id === matchId);
      if (!m) throw new MatchError('Match introuvable.');
      fn(m);
    });
  } catch (err) {
    toast(errorMessage(err), { kind: 'error' });
    return false;
  }
  u.history.push(snapshot);
  if (u.history.length > 60) u.history.shift();
  afterUi?.();
  requestRender();
  return true;
}

function undo(matchId: string): void {
  const u = liveUi(matchId);
  const snapshot = u.history.pop();
  if (!snapshot) return;
  const restored = JSON.parse(snapshot) as Match;
  u.passerId = null;
  u.armedPull = false;
  update((s) => {
    const i = s.matches.findIndex((m) => m.id === matchId);
    if (i >= 0) s.matches[i] = restored;
  });
  vibrate(20);
  toast('Dernière action annulée.');
}

/* ---------- Vue ---------- */

export function liveView(params: Record<string, string>): View {
  const st = getState();
  const match = st.matches.find((m) => m.id === params.id);
  if (!match) {
    return {
      el: h('div', { class: 'page' }, emptyState('Match introuvable', 'Ce match a peut-être été supprimé.', h('a', { class: 'btn btn--primary', href: '#/' }, 'Retour aux matchs'))),
    };
  }
  const u = liveUi(match.id);
  if (match.status === 'en_cours') void ensureWakeLock();

  const { pour, contre } = getScore(match);
  const open = getOpenPoint(match);
  const teamName = st.settings.teamName;

  const head = h(
    'header',
    { class: 'live__head' },
    h('a', { class: 'btn btn--ghost btn--icon', href: `#/match/${match.id}`, 'aria-label': 'Détail du match' }, icon('back')),
    h(
      'div',
      { class: 'scoreboard', 'aria-live': 'polite' },
      h('div', { class: 'scoreboard__team' }, h('span', { class: 'scoreboard__name' }, teamName), h('b', { class: 'scoreboard__pts' }, pour)),
      h('span', { class: 'scoreboard__sep' }, '–'),
      h('div', { class: 'scoreboard__team' }, h('b', { class: 'scoreboard__pts' }, contre), h('span', { class: 'scoreboard__name' }, match.opponent || 'Eux')),
    ),
    h(
      'button',
      {
        class: 'btn btn--ghost btn--icon',
        type: 'button',
        disabled: u.history.length === 0,
        'aria-label': 'Annuler la dernière action',
        onclick: () => undo(match.id),
      },
      icon('undo'),
    ),
  );

  const el = h('div', { class: 'live' }, head);
  if (match.status === 'termine') el.appendChild(finishedPanel(match));
  else if (open) el.appendChild(pointPanel(match, open, st.players, u));
  else el.appendChild(linePicker(match, st.players, st.settings.lineSize, u));

  return { el, leave: releaseWakeLock };
}

/* ---------- Match terminé ---------- */

function finishedPanel(match: Match): HTMLElement {
  return h(
    'div',
    { class: 'panel' },
    h('h2', null, 'Match terminé'),
    h('p', null, 'Les points restent corrigeables depuis le détail du match.'),
    h(
      'div',
      { class: 'stack' },
      h('a', { class: 'btn btn--primary btn--block', href: `#/match/${match.id}` }, 'Voir le détail et les stats'),
      h('button', { class: 'btn btn--block', type: 'button', onclick: () => mutate(match.id, (m) => reopenMatch(m)) }, 'Reprendre la saisie'),
    ),
  );
}

/* ---------- Choix de la ligne ---------- */

function linePicker(match: Match, allPlayers: Player[], lineSize: number, u: LiveUi): HTMLElement {
  const present = new Set(match.presentIds);
  let pool = sortPlayers(allPlayers.filter((p) => present.has(p.id)));
  if (pool.length === 0) pool = sortPlayers(allPlayers.filter((p) => p.active));
  const poolIds = new Set(pool.map((p) => p.id));
  u.selected = u.selected.filter((id) => poolIds.has(id));

  const startedOn: Side = u.startedOn ?? nextStartSide(match);
  const lineType: LineType = u.lineType ?? startedOn;
  const n = u.selected.length;
  const previous = match.points[match.points.length - 1];
  const number = match.points.length + 1;

  const toggle = (id: string): void => {
    vibrate(8);
    u.selected = u.selected.includes(id) ? u.selected.filter((x) => x !== id) : [...u.selected, id];
    requestRender();
  };

  const grid = h(
    'div',
    { class: 'picker' },
    pool.map((p) => {
      const on = u.selected.includes(p.id);
      return h(
        'button',
        { type: 'button', class: `pick ${on ? 'is-on' : ''}`, 'aria-pressed': on ? 'true' : 'false', onclick: () => toggle(p.id) },
        p.number !== null ? h('span', { class: 'pick__num' }, p.number) : null,
        h('span', { class: 'pick__name' }, p.name),
      );
    }),
  );

  const start = h(
    'button',
    {
      class: 'btn btn--primary btn--xl btn--block',
      type: 'button',
      disabled: n === 0,
      onclick: () => {
        const ok = mutate(
          match.id,
          (m) => startPoint(m, u.selected, lineType, startedOn),
          () => { u.passerId = null; u.armedPull = false; },
        );
        if (ok) vibrate(20);
      },
    },
    n === 0 ? 'Choisis les joueurs' : `Lancer le point (${n}/${lineSize})`,
  );

  return h(
    'div',
    { class: 'panel' },
    h('div', { class: 'panel__head' }, h('h2', null, `Point n°${number}`), h('span', { class: `count ${n === lineSize ? 'count--ok' : n > lineSize ? 'count--warn' : ''}` }, `${n}/${lineSize}`)),
    h(
      'div',
      { class: 'options' },
      segmented<Side>('Départ du point', [{ value: 'attaque', label: SIDE_LABELS.attaque }, { value: 'defense', label: SIDE_LABELS.defense }], startedOn, (v) => {
        u.startedOn = v;
        requestRender();
      }),
      segmented<LineType>(
        'Type de ligne',
        (['attaque', 'defense', 'mixte'] as LineType[]).map((v) => ({ value: v, label: LINE_LABELS[v] })),
        lineType,
        (v) => { u.lineType = v; requestRender(); },
      ),
    ),
    pool.length === 0
      ? emptyState('Aucun joueur', 'Ajoute des joueurs dans l’effectif.', h('a', { class: 'btn', href: '#/effectif' }, 'Effectif'))
      : grid,
    h(
      'div',
      { class: 'inline-actions' },
      previous
        ? h('button', { class: 'btn btn--small', type: 'button', onclick: () => { u.selected = previous.lineup.filter((id) => poolIds.has(id)); requestRender(); } }, 'Même ligne que le point précédent')
        : null,
      h('button', { class: 'btn btn--small', type: 'button', disabled: n === 0, onclick: () => { u.selected = []; requestRender(); } }, 'Vider'),
      h('button', { class: 'btn btn--small', type: 'button', onclick: () => openMatchForm(match) }, 'Présents'),
    ),
    start,
    recentPoints(match, allPlayers),
    h(
      'div',
      { class: 'stack stack--end' },
      h('button', { class: 'btn btn--danger-ghost btn--block', type: 'button', onclick: () => void endMatch(match) }, 'Terminer le match'),
    ),
  );
}

async function endMatch(match: Match): Promise<void> {
  const { pour, contre } = getScore(match);
  const ok = await confirmDialog(`Terminer le match sur le score de ${pour} – ${contre} ?`, 'Terminer');
  if (!ok) return;
  if (mutate(match.id, (m) => finishMatch(m))) navigate(`/match/${match.id}`);
}

function recentPoints(match: Match, players: Player[]): HTMLElement | null {
  const done = match.points.filter((p) => p.result !== null).slice(-3).reverse();
  if (done.length === 0) return null;
  const name = (id: string | null): string => players.find((p) => p.id === id)?.name ?? '?';
  return h(
    'div',
    { class: 'recent' },
    h('h3', null, 'Derniers points'),
    done.map((p) => {
      const idx = match.points.indexOf(p) + 1;
      return h(
        'div',
        { class: 'recent__row' },
        h('span', { class: 'recent__n' }, `n°${idx}`),
        p.result === 'pour'
          ? h('span', null, `But : ${name(p.scorerId)}`, p.assistId ? ` ← ${name(p.assistId)}` : ' (sans passeur)')
          : h('span', { class: 'muted' }, 'Point encaissé'),
      );
    }),
  );
}

/* ---------- Point en cours ---------- */

function pointPanel(match: Match, point: Point, players: Player[], u: LiveUi): HTMLElement {
  const lineup = sortPlayers(point.lineup.map((id) => players.find((p) => p.id === id)).filter((p): p is Player => !!p));
  const nameOf = (id: string): string => players.find((p) => p.id === id)?.name ?? '?';
  const number = match.points.length;
  const hasPull = point.events.some((e) => e.type === 'pull');
  if (u.passerId && !point.lineup.includes(u.passerId)) u.passerId = null;

  const quick = (type: EventType, id: string, label: string): void => {
    vibrate(12);
    if (mutate(match.id, (m) => logEvent(m, type, id))) toast(`${label} · ${nameOf(id)}`, { durationMs: 1400, group: 'ev' });
  };

  const tapPlayer = (id: string): void => {
    vibrate(10);
    if (u.armedPull) {
      mutate(match.id, (m) => logEvent(m, 'pull', id), () => { u.armedPull = false; });
      return;
    }
    if (u.passerId === null) {
      u.passerId = id;
      requestRender();
      return;
    }
    if (u.passerId === id) {
      u.passerId = null;
      requestRender();
      return;
    }
    const passer = u.passerId;
    mutate(match.id, (m) => scoreGoal(m, id, passer), () => { u.passerId = null; });
    toast(`But de ${nameOf(id)} (passe de ${nameOf(passer)})`, { kind: 'success', group: 'ev' });
  };

  let banner: HTMLElement;
  if (u.armedPull) {
    banner = h(
      'div',
      { class: 'hintbar hintbar--pull' },
      h('span', { class: 'hintbar__text' }, 'Pull : touche le joueur qui lance'),
      h('button', { class: 'btn btn--small', type: 'button', 'aria-label': 'Annuler le pull', onclick: () => { u.armedPull = false; requestRender(); } }, '✕'),
    );
  } else if (u.passerId) {
    const passer = u.passerId;
    banner = h(
      'div',
      { class: 'hintbar hintbar--goal' },
      h('span', { class: 'hintbar__text' }, h('b', null, nameOf(passer)), ' → touche le marqueur'),
      h(
        'span',
        { class: 'hintbar__btns' },
        h('button', { class: 'btn btn--small', type: 'button', onclick: () => { mutate(match.id, (m) => scoreGoal(m, passer, null), () => { u.passerId = null; }); toast(`But de ${nameOf(passer)} (sans passeur)`, { kind: 'success', group: 'ev' }); } }, 'Sans passeur'),
        h('button', { class: 'btn btn--small', type: 'button', 'aria-label': 'Annuler le passeur', onclick: () => { u.passerId = null; requestRender(); } }, '✕'),
      ),
    );
  } else {
    banner = h('div', { class: 'hintbar' }, h('span', { class: 'hintbar__text' }, 'But : touche le ', h('b', null, 'passeur'), ', puis le ', h('b', null, 'marqueur')));
  }

  const counts = (id: string): Record<EventType, number> => {
    const c: Record<EventType, number> = { defense: 0, lancer_rate: 0, drop: 0, pull: 0 };
    for (const e of point.events) if (e.playerId === id) c[e.type]++;
    return c;
  };

  const tiles = lineup.map((p) => {
    const c = counts(p.id);
    const isPasser = u.passerId === p.id;
    return h(
      'div',
      { class: `tile ${isPasser ? 'is-passer' : ''}` },
      h(
        'button',
        { type: 'button', class: 'tile__main', 'aria-pressed': isPasser ? 'true' : 'false', onclick: () => tapPlayer(p.id) },
        p.number !== null ? h('span', { class: 'tile__num' }, p.number) : null,
        h('span', { class: 'tile__name' }, p.name),
      ),
      h(
        'div',
        { class: 'tile__actions' },
        quickButton('D', 'Défense', c.defense, 'ev-d', () => quick('defense', p.id, 'Défense'), p.name),
        quickButton('✗', 'Lancer raté', c.lancer_rate, 'ev-t', () => quick('lancer_rate', p.id, 'Lancer raté'), p.name),
        quickButton('⊘', 'Drop', c.drop, 'ev-t', () => quick('drop', p.id, 'Drop'), p.name),
      ),
    );
  });

  const log = point.events.length
    ? h(
        'div',
        { class: 'eventlog' },
        point.events.map((e) =>
          h('span', { class: `evchip evchip--${e.type}` }, `${e.type === 'defense' ? 'D' : e.type === 'lancer_rate' ? 'Lancer raté' : e.type === 'drop' ? 'Drop' : 'Pull'} · ${nameOf(e.playerId)}`),
        ),
      )
    : null;

  return h(
    'div',
    { class: 'panel' },
    h(
      'div',
      { class: 'panel__head' },
      h('h2', null, `Point n°${number}`),
      h('span', { class: 'badge' }, `${SIDE_LABELS[point.startedOn]} · ${LINE_LABELS[point.lineType]}`),
    ),
    banner,
    h(
      'div',
      { class: 'controls' },
      point.startedOn === 'defense' && !hasPull
        ? h('button', { class: `btn ${u.armedPull ? 'btn--primary' : ''}`, type: 'button', onclick: () => { u.armedPull = !u.armedPull; u.passerId = null; requestRender(); } }, 'Pull')
        : null,
      h(
        'button',
        { class: 'btn btn--opp', type: 'button', onclick: () => { vibrate(25); mutate(match.id, (m) => concede(m), () => { u.passerId = null; u.armedPull = false; }); } },
        'But adverse',
      ),
    ),
    h('div', { class: 'tiles' }, tiles),
    log,
    h(
      'div',
      { class: 'stack stack--end' },
      h(
        'button',
        {
          class: 'btn btn--ghost btn--block',
          type: 'button',
          onclick: async () => {
            const ok = await confirmDialog('Abandonner ce point sans résultat ? Les événements saisis sur ce point seront supprimés.', 'Abandonner le point', true);
            if (!ok) return;
            mutate(match.id, (m) => { m.points.pop(); }, () => { u.passerId = null; u.armedPull = false; });
          },
        },
        'Abandonner ce point',
      ),
    ),
  );
}

function quickButton(symbol: string, label: string, count: number, cls: string, onClick: () => void, playerName: string): HTMLElement {
  return h(
    'button',
    { type: 'button', class: `qbtn ${cls} ${count ? 'has-count' : ''}`, 'aria-label': `${label} de ${playerName}`, title: label, onclick: onClick },
    symbol,
    count ? h('span', { class: 'qbtn__count' }, count) : null,
  );
}
