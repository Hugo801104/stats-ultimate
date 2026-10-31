// filepath: src/views/roster.ts
import * as actions from '../actions';
import { button, emptyState, h } from '../dom';
import { byNumberThenName } from '../format';
import { getData, refresh } from '../store';
import type { Player, Position } from '../types';

const POSITIONS: { key: Position; label: string }[] = [
  { key: 'handler', label: 'Handler' },
  { key: 'cutter', label: 'Cutter' },
  { key: 'mixte', label: 'Mixte' },
];

const positionLabel = (p: Position): string => POSITIONS.find((x) => x.key === p)?.label ?? p;

let editingId: string | null = null;

export function rosterView(): HTMLElement {
  const data = getData();
  const editing = editingId ? data.players.find((p) => p.id === editingId) : undefined;
  if (editingId && !editing) editingId = null;

  const players = [...data.players].sort((a, b) => Number(b.active) - Number(a.active) || byNumberThenName(a, b));

  return h(
    'section',
    { class: 'page' },
    h('header', { class: 'page-head' }, h('h1', {}, 'Effectif')),
    playerForm(editing),
    players.length === 0
      ? emptyState('Aucun joueur. Ajoute ton effectif pour pouvoir saisir un match.')
      : h('ul', { class: 'list' }, ...players.map(playerRow)),
  );
}

function playerForm(editing: Player | undefined): HTMLElement {
  const name = h('input', { id: 'p-name', type: 'text', required: true, maxlength: 40, placeholder: 'Prénom ou surnom', value: editing?.name ?? '' });
  const number = h('input', { id: 'p-number', type: 'number', min: 0, max: 99, inputmode: 'numeric', placeholder: 'N°', value: editing?.number ?? '' });
  const error = h('p', { class: 'error', role: 'alert' });
  const checks = POSITIONS.map((p) =>
    h('label', { class: 'check' }, h('input', { type: 'checkbox', name: 'pos', value: p.key, checked: editing?.positions.includes(p.key) ?? false }), p.label),
  );

  const submit = (e: Event): void => {
    e.preventDefault();
    const trimmed = name.value.trim();
    if (!trimmed) {
      error.textContent = 'Le nom est obligatoire.';
      return;
    }
    let num: number | null = null;
    if (number.value !== '') {
      num = Number(number.value);
      if (!Number.isInteger(num) || num < 0 || num > 99) {
        error.textContent = 'Le numéro doit être un entier entre 0 et 99.';
        return;
      }
    }
    const clash = getData().players.find((p) => p.active && p.number === num && p.id !== editingId);
    if (num !== null && clash) {
      error.textContent = `Le numéro ${num} est déjà pris par ${clash.name}.`;
      return;
    }
    const positions = Array.from(document.querySelectorAll<HTMLInputElement>('input[name="pos"]:checked')).map((i) => i.value as Position);
    const input = { name: trimmed, number: num, positions };
    if (editingId) actions.updatePlayer(editingId, input);
    else actions.addPlayer(input);
    editingId = null;
    refresh();
  };

  return h(
    'form',
    { class: 'form inline-form', onsubmit: submit },
    h('h2', {}, editing ? `Modifier ${editing.name}` : 'Ajouter un joueur'),
    h('div', { class: 'row wrap' }, h('div', { class: 'field grow' }, h('label', { for: 'p-name' }, 'Nom'), name), h('div', { class: 'field num' }, h('label', { for: 'p-number' }, 'N°'), number)),
    h('fieldset', { class: 'positions' }, h('legend', {}, 'Postes habituels'), ...checks),
    error,
    h(
      'div',
      { class: 'row' },
      h('button', { type: 'submit', class: 'btn primary' }, editing ? 'Enregistrer' : 'Ajouter'),
      editing ? button('Annuler', () => { editingId = null; refresh(); }) : null,
    ),
  );
}

function playerRow(p: Player): HTMLElement {
  const used = actions.isPlayerUsed(getData(), p.id);
  return h(
    'li',
    { class: p.active ? '' : 'archived' },
    h(
      'div',
      { class: 'row-link static' },
      h(
        'span',
        { class: 'row-main' },
        h('strong', {}, p.number === null ? p.name : `#${p.number} ${p.name}`),
        h('small', {}, [p.positions.map(positionLabel).join(', ') || 'Poste non renseigné', p.active ? '' : 'Archivé'].filter(Boolean).join(' · ')),
      ),
      h(
        'span',
        { class: 'row-actions' },
        button('Modifier', () => { editingId = p.id; refresh(); window.scrollTo({ top: 0 }); }, 'btn small'),
        button(p.active ? 'Archiver' : 'Réactiver', () => actions.setPlayerActive(p.id, !p.active), 'btn small'),
        button(
          'Supprimer',
          () => {
            if (window.confirm(`Supprimer ${p.name} définitivement ?`)) actions.deletePlayer(p.id);
          },
          'btn small danger',
          { disabled: used, title: used ? 'Ce joueur a des stats : archive-le plutôt.' : 'Supprimer' },
        ),
      ),
    ),
  );
}
