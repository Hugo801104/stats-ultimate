import { POSITION_LABELS } from '../labels';
import type { Player } from '../types';
import { h, type Child } from './dom';

/* ---------- Toasts ---------- */

let toastHost: HTMLElement | null = null;

export interface ToastOptions {
  kind?: 'info' | 'error' | 'success';
  actionLabel?: string;
  onAction?: () => void;
  durationMs?: number;
  /** Un nouveau toast remplace les précédents du même groupe (évite l'empilement pendant la saisie). */
  group?: string;
}

export function toast(message: string, opts: ToastOptions = {}): void {
  if (!toastHost) {
    toastHost = h('div', { class: 'toasts', role: 'status', 'aria-live': 'polite' });
    document.body.appendChild(toastHost);
  }
  const host = toastHost;
  if (opts.group) host.querySelectorAll(`[data-group="${opts.group}"]`).forEach((n) => n.remove());
  const el = h('div', { class: `toast toast--${opts.kind ?? 'info'}`, 'data-group': opts.group }, h('span', null, message));
  const remove = (): void => el.remove();
  el.addEventListener('click', remove);
  if (opts.actionLabel && opts.onAction) {
    const onAction = opts.onAction;
    el.appendChild(
      h('button', { class: 'toast__action', type: 'button', onclick: () => { onAction(); remove(); } }, opts.actionLabel),
    );
  }
  host.appendChild(el);
  while (host.children.length > 3) host.firstElementChild?.remove();
  window.setTimeout(remove, opts.durationMs ?? (opts.kind === 'error' ? 5000 : 3500));
}

/* ---------- Modales ---------- */

export interface ModalHandle {
  close: () => void;
  body: HTMLElement;
}

export function openModal(title: string, content: Child, opts: { wide?: boolean; onClose?: () => void } = {}): ModalHandle {
  const previouslyFocused = document.activeElement as HTMLElement | null;
  const body = h('div', { class: 'modal__body' }, content);
  const titleId = `modal-title-${Math.random().toString(36).slice(2, 8)}`;
  const closeBtn = h('button', { class: 'btn btn--ghost modal__close', type: 'button', 'aria-label': 'Fermer' }, '✕');
  const dialog = h(
    'div',
    { class: `modal ${opts.wide ? 'modal--wide' : ''}`, role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': titleId },
    h('div', { class: 'modal__head' }, h('h2', { id: titleId }, title), closeBtn),
    body,
  );
  const overlay = h('div', { class: 'overlay' }, dialog);
  let closed = false;
  const close = (): void => {
    if (closed) return;
    closed = true;
    document.removeEventListener('keydown', onKey);
    overlay.remove();
    document.body.classList.toggle('no-scroll', document.querySelectorAll('.overlay').length > 0);
    previouslyFocused?.focus?.();
    opts.onClose?.();
  };
  const onKey = (e: KeyboardEvent): void => {
    if (e.key === 'Escape' && overlay === [...document.querySelectorAll('.overlay')].pop()) close();
  };
  closeBtn.addEventListener('click', close);
  overlay.addEventListener('mousedown', (e) => {
    if (e.target === overlay) close();
  });
  document.addEventListener('keydown', onKey);
  document.body.appendChild(overlay);
  document.body.classList.add('no-scroll');
  const first = dialog.querySelector<HTMLElement>('input:not([type=checkbox]), select, textarea');
  (first ?? closeBtn).focus({ preventScroll: true });
  return { close, body };
}

export function confirmDialog(message: string, confirmLabel = 'Confirmer', danger = false): Promise<boolean> {
  return new Promise((resolve) => {
    let answered = false;
    const answer = (v: boolean, close: () => void): void => {
      answered = true;
      close();
      resolve(v);
    };
    const holder: { close: () => void } = { close: () => undefined };
    const content = h(
      'div',
      null,
      h('p', { class: 'modal__text' }, message),
      h(
        'div',
        { class: 'modal__actions' },
        h('button', { class: 'btn', type: 'button', onclick: () => answer(false, holder.close) }, 'Annuler'),
        h('button', { class: `btn ${danger ? 'btn--danger' : 'btn--primary'}`, type: 'button', onclick: () => answer(true, holder.close) }, confirmLabel),
      ),
    );
    const modal = openModal('Confirmation', content, { onClose: () => { if (!answered) resolve(false); } });
    holder.close = modal.close;
  });
}

/* ---------- Petits composants ---------- */

export function playerLabel(p: Player): string {
  return p.number !== null ? `#${p.number} ${p.name}` : p.name;
}

export function positionBadge(p: Player): HTMLElement {
  return h('span', { class: `badge badge--${p.position}` }, POSITION_LABELS[p.position]);
}

export function field(label: string, control: HTMLElement, hint?: string): HTMLElement {
  const id = `f-${Math.random().toString(36).slice(2, 8)}`;
  control.id = id;
  return h(
    'div',
    { class: 'field' },
    h('label', { for: id }, label),
    control,
    hint ? h('small', { class: 'hint' }, hint) : null,
  );
}

export interface SegmentOption<T extends string> {
  value: T;
  label: string;
}

/** Choix exclusif sous forme de boutons segmentés accessibles. */
export function segmented<T extends string>(
  label: string,
  options: SegmentOption<T>[],
  current: T,
  onChange: (v: T) => void,
): HTMLElement {
  return h(
    'div',
    { class: 'segmented', role: 'radiogroup', 'aria-label': label },
    options.map((o) =>
      h(
        'button',
        {
          type: 'button',
          class: `segmented__btn ${o.value === current ? 'is-active' : ''}`,
          role: 'radio',
          'aria-checked': o.value === current ? 'true' : 'false',
          onclick: () => onChange(o.value),
        },
        o.label,
      ),
    ),
  );
}

export function emptyState(title: string, text: string, action?: HTMLElement): HTMLElement {
  return h('div', { class: 'empty' }, h('h3', null, title), h('p', null, text), action ?? null);
}

export function pageHeader(title: string, ...actions: Child[]): HTMLElement {
  return h('header', { class: 'page-head' }, h('h1', null, title), h('div', { class: 'page-head__actions' }, actions));
}

export function vibrate(ms = 12): void {
  try {
    navigator.vibrate?.(ms);
  } catch {
    /* non supporté */
  }
}

export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : 'Une erreur est survenue.';
}
