import { sortPlayers } from '../../exporters';
import { POSITION_LABELS } from '../../labels';
import { computePlayerStats, filterMatches } from '../../stats';
import { getState, update } from '../../store';
import type { AppState, Player, Position } from '../../types';
import { normalizeName, uid } from '../../util';
import { confirmDialog, emptyState, errorMessage, field, openModal, pageHeader, positionBadge, toast } from '../components';
import { h, icon } from '../dom';
import type { View } from '../router';

const POSITIONS = Object.keys(POSITION_LABELS) as Position[];

export function rosterView(): View {
  const st = getState();
  const season = st.seasons.find((s) => s.id === st.settings.currentSeasonId);
  const stats = computePlayerStats(filterMatches(st.matches, { seasonId: st.settings.currentSeasonId, kind: 'all' }));
  const active = sortPlayers(st.players.filter((p) => p.active));
  const archived = sortPlayers(st.players.filter((p) => !p.active));

  const row = (p: Player): HTMLElement => {
    const s = stats.get(p.id);
    return h(
      'button',
      { class: 'card player-row', type: 'button', onclick: () => openPlayerForm(p) },
      h('span', { class: 'player-row__num' }, p.number ?? '·'),
      h('span', { class: 'player-row__main' },
        h('span', { class: 'player-row__name' }, p.name),
        h('span', { class: 'player-row__sub' }, s && s.pointsPlayed > 0 ? `${s.pointsPlayed} pts · ${s.goals} B · ${s.assists} PD · ${s.defenses} D` : 'Pas encore de stats cette saison'),
      ),
      positionBadge(p),
    );
  };

  const el = h(
    'div',
    { class: 'page' },
    pageHeader('Effectif',
      h('button', { class: 'btn', type: 'button', onclick: openBulkAdd }, 'Ajout rapide'),
      h('button', { class: 'btn btn--primary', type: 'button', onclick: () => openPlayerForm() }, icon('plus', 18), ' Joueur'),
    ),
    season ? h('p', { class: 'muted' }, `Stats de la saison ${season.name}`) : null,
  );

  if (active.length === 0) {
    el.appendChild(emptyState('Aucun joueur', 'Ajoute ton premier joueur, ou colle toute la liste d’un coup avec « Ajout rapide ».', h('button', { class: 'btn btn--primary', type: 'button', onclick: openBulkAdd }, 'Ajout rapide')));
  } else {
    el.appendChild(h('div', { class: 'list' }, active.map(row)));
  }
  if (archived.length) {
    el.appendChild(h('details', { class: 'archived' }, h('summary', null, `Archivés (${archived.length})`), h('div', { class: 'list' }, archived.map(row))));
  }
  return { el };
}

/** Joueur déjà présent avec ce numéro (hors joueur édité). */
function numberTakenBy(st: AppState, number: number | null, exceptId?: string): Player | undefined {
  if (number === null) return undefined;
  return st.players.find((p) => p.active && p.id !== exceptId && p.number === number);
}

function isUsed(st: AppState, id: string): boolean {
  return st.matches.some((m) => m.presentIds.includes(id) || m.points.some((p) => p.lineup.includes(id)));
}

function openPlayerForm(existing?: Player): void {
  const draft = {
    name: existing?.name ?? '',
    number: existing?.number !== null && existing?.number !== undefined ? String(existing.number) : '',
    position: existing?.position ?? ('polyvalent' as Position),
    active: existing?.active ?? true,
  };
  const error = h('p', { class: 'form-error', role: 'alert', hidden: true });
  const name = h('input', { type: 'text', value: draft.name, autocomplete: 'off', maxlength: 40, oninput: (e: Event) => { draft.name = (e.target as HTMLInputElement).value; } });
  const number = h('input', { type: 'number', inputmode: 'numeric', min: 0, max: 999, value: draft.number, oninput: (e: Event) => { draft.number = (e.target as HTMLInputElement).value; } });
  const position = h('select', { value: draft.position, onchange: (e: Event) => { draft.position = (e.target as HTMLSelectElement).value as Position; } },
    POSITIONS.map((p) => h('option', { value: p }, POSITION_LABELS[p])));
  const activeBox = h('input', { type: 'checkbox', checked: draft.active, onchange: (e: Event) => { draft.active = (e.target as HTMLInputElement).checked; } });

  const form = h('form', { class: 'form', novalidate: true },
    field('Nom', name),
    h('div', { class: 'grid-2' }, field('Numéro', number), field('Poste habituel', position)),
    existing ? h('label', { class: 'check' }, activeBox, ' Joueur actif (décocher pour archiver)') : null,
    error,
    h('div', { class: 'modal__actions modal__actions--wrap' },
      existing ? h('button', { type: 'button', class: 'btn btn--danger-ghost', onclick: () => void removePlayer(existing, modal.close) }, 'Supprimer') : null,
      h('button', { type: 'submit', class: 'btn btn--primary' }, existing ? 'Enregistrer' : 'Ajouter'),
    ),
  );
  const modal = openModal(existing ? 'Modifier le joueur' : 'Nouveau joueur', form);

  form.addEventListener('submit', (ev) => {
    ev.preventDefault();
    const fail = (m: string): void => { error.textContent = m; error.hidden = false; };
    const trimmed = draft.name.trim();
    if (!trimmed) return fail('Le nom est obligatoire.');
    let num: number | null = null;
    if (draft.number.trim() !== '') {
      num = Number(draft.number);
      if (!Number.isInteger(num) || num < 0 || num > 999) return fail('Le numéro doit être un entier entre 0 et 999.');
    }
    const st = getState();
    const dupName = st.players.find((p) => p.id !== existing?.id && normalizeName(p.name) === normalizeName(trimmed));
    if (dupName) return fail(`« ${dupName.name} » existe déjà dans l’effectif.`);
    const taken = draft.active ? numberTakenBy(st, num, existing?.id) : undefined;
    if (taken) return fail(`Le n°${num} est déjà porté par ${taken.name}.`);
    try {
      update((s) => {
        if (existing) {
          const p = s.players.find((x) => x.id === existing.id);
          if (!p) throw new Error('Joueur introuvable.');
          Object.assign(p, { name: trimmed, number: num, position: draft.position, active: draft.active });
        } else {
          s.players.push({ id: uid(), name: trimmed, number: num, position: draft.position, active: true });
        }
      });
      modal.close();
      toast(existing ? 'Joueur mis à jour.' : `${trimmed} ajouté.`, { kind: 'success' });
    } catch (err) {
      fail(errorMessage(err));
    }
  });
}

async function removePlayer(p: Player, closeModal: () => void): Promise<void> {
  const st = getState();
  if (isUsed(st, p.id)) {
    const ok = await confirmDialog(`${p.name} a joué des matchs : on ne peut pas le supprimer sans fausser les stats. L’archiver à la place ?`, 'Archiver');
    if (!ok) return;
    update((s) => { const x = s.players.find((y) => y.id === p.id); if (x) x.active = false; });
    closeModal();
    toast(`${p.name} archivé.`);
    return;
  }
  const ok = await confirmDialog(`Supprimer ${p.name} de l’effectif ?`, 'Supprimer', true);
  if (!ok) return;
  update((s) => { s.players = s.players.filter((x) => x.id !== p.id); });
  closeModal();
  toast(`${p.name} supprimé.`);
}

/** Une ligne par joueur : « 7 Léa » ou « Léa » (avec poste facultatif « Léa, handler »). */
export function parseBulkLines(text: string): { name: string; number: number | null; position: Position }[] {
  const out: { name: string; number: number | null; position: Position }[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const m = /^(\d{1,3})\s*[-.:)]?\s+(.+)$/.exec(line);
    let number: number | null = null;
    let rest = line;
    if (m) {
      number = Number(m[1]);
      rest = m[2]!;
    }
    let position: Position = 'polyvalent';
    const parts = rest.split(/\s*[,;]\s*/);
    if (parts.length > 1) {
      const last = normalizeName(parts[parts.length - 1]!);
      const found = POSITIONS.find((p) => normalizeName(POSITION_LABELS[p]) === last || p === last);
      if (found) {
        position = found;
        parts.pop();
      }
    }
    const name = parts.join(' ').trim();
    if (name) out.push({ name, number, position });
  }
  return out;
}

export function addPlayersBulk(entries: { name: string; number: number | null; position: Position }[]): { added: number; skipped: string[] } {
  let added = 0;
  const skipped: string[] = [];
  update((s) => {
    for (const e of entries) {
      const dup = s.players.some((p) => normalizeName(p.name) === normalizeName(e.name));
      const taken = numberTakenBy(s, e.number);
      if (dup) { skipped.push(`${e.name} (déjà présent)`); continue; }
      s.players.push({ id: uid(), name: e.name, number: taken ? null : e.number, position: e.position, active: true });
      if (taken) skipped.push(`n°${e.number} de ${e.name} (pris par ${taken.name}) : ajouté sans numéro`);
      added++;
    }
  });
  return { added, skipped };
}

function openBulkAdd(): void {
  const area = h('textarea', { rows: 10, placeholder: '7 Léa\n12 Tom, cutter\nInès', 'aria-label': 'Liste des joueurs' });
  const info = h('p', { class: 'hint' }, 'Une ligne par joueur : numéro (facultatif), nom, puis poste facultatif après une virgule (handler, cutter, polyvalent).');
  const error = h('p', { class: 'form-error', role: 'alert', hidden: true });
  const form = h('form', { class: 'form' }, field('Joueurs', area), info, error,
    h('div', { class: 'modal__actions' }, h('button', { class: 'btn btn--primary', type: 'submit' }, 'Ajouter')));
  const modal = openModal('Ajout rapide', form);
  form.addEventListener('submit', (ev) => {
    ev.preventDefault();
    const entries = parseBulkLines(area.value);
    if (entries.length === 0) { error.textContent = 'Écris au moins un nom.'; error.hidden = false; return; }
    const { added, skipped } = addPlayersBulk(entries);
    modal.close();
    toast(`${added} joueur${added > 1 ? 's' : ''} ajouté${added > 1 ? 's' : ''}.${skipped.length ? ` ${skipped.length} remarque(s) : ${skipped.join(' ; ')}` : ''}`, { kind: skipped.length ? 'info' : 'success', durationMs: skipped.length ? 8000 : 3500 });
  });
}
