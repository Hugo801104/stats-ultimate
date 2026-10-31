// filepath: src/dom.ts
// Petit utilitaire de création de DOM : pas de innerHTML, donc pas d'injection via les noms saisis.

export type Child = Node | string | number | null | undefined | false;
type Props = Record<string, unknown>;

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Props = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  let deferredValue: unknown;

  for (const [key, value] of Object.entries(props)) {
    if (value === undefined || value === null || value === false) continue;
    if (key === 'class') {
      el.className = String(value);
    } else if (key.startsWith('on') && typeof value === 'function') {
      el.addEventListener(key.slice(2), value as EventListener);
    } else if (key === 'value') {
      deferredValue = value; // appliqué après les enfants (utile pour <select>)
    } else if (key === 'checked' || key === 'disabled' || key === 'selected') {
      (el as unknown as Record<string, unknown>)[key] = value;
    } else {
      el.setAttribute(key, value === true ? '' : String(value));
    }
  }

  for (const child of children) {
    if (child === null || child === undefined || child === false) continue;
    el.append(child instanceof Node ? child : String(child));
  }

  if (deferredValue !== undefined) (el as unknown as HTMLInputElement).value = String(deferredValue);
  return el;
}

export function button(label: Child, onClick: () => void, className = 'btn', extra: Props = {}): HTMLButtonElement {
  return h('button', { type: 'button', class: className, onclick: onClick, ...extra }, label);
}

export function emptyState(message: Child, ...actions: Child[]): HTMLElement {
  return h('div', { class: 'empty' }, h('p', {}, message), actions.length ? h('div', { class: 'row' }, ...actions) : null);
}
