// Mini helper de création de DOM (pas de framework). Les vues sont des fonctions qui retournent un élément.

export type Child = Node | string | number | false | null | undefined | Child[];
export type Props = Record<string, unknown>;

function append(parent: Node, children: Child[]): void {
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue;
    if (Array.isArray(c)) append(parent, c);
    else if (c instanceof Node) parent.appendChild(c);
    else parent.appendChild(document.createTextNode(String(c)));
  }
}

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Props | null = null,
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  let deferredValue: unknown;
  if (props) {
    for (const [k, v] of Object.entries(props)) {
      if (v === undefined || v === null || v === false) continue;
      if (k === 'class') el.className = String(v);
      else if (k === 'style') el.setAttribute('style', String(v));
      else if (k === 'value') deferredValue = v; // après les enfants (utile pour <select>)
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v as EventListener);
      else if (k === 'dataset') Object.assign(el.dataset, v as Record<string, string>);
      else if (k === 'checked' || k === 'disabled' || k === 'selected' || k === 'hidden' || k === 'required' || k === 'multiple') {
        (el as unknown as Record<string, unknown>)[k] = Boolean(v);
      } else if (k.startsWith('aria-') || k.startsWith('data-') || k === 'role' || k === 'for') {
        el.setAttribute(k, String(v));
      } else if (v === true) el.setAttribute(k, '');
      else el.setAttribute(k, String(v));
    }
  }
  append(el, children);
  if (deferredValue !== undefined) (el as unknown as { value: string }).value = String(deferredValue);
  return el;
}

const ICONS: Record<string, string> = {
  matchs: '<path d="M4 6h16M4 12h16M4 18h10"/><circle cx="19" cy="18" r="2"/>',
  effectif: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6"/><circle cx="17.5" cy="9" r="2.5"/><path d="M17.5 14c2.5 0 4 1.7 4 4.5"/>',
  stats: '<path d="M5 20V10M12 20V4M19 20v-7"/>',
  meteo: '<path d="M7 18a4 4 0 0 1-.6-7.9A5.5 5.5 0 0 1 17 9.5a4 4 0 0 1 0 8.5H7z"/>',
  reglages: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"/>',
  undo: '<path d="M9 14 4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/>',
  back: '<path d="m15 18-6-6 6-6"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  share: '<circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="6" r="2.5"/><circle cx="18" cy="18" r="2.5"/><path d="m8.2 10.8 7.6-3.6M8.2 13.2l7.6 3.6"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16v4z"/>',
  check: '<path d="m5 12 5 5 9-10"/>',
  tournoi: '<path d="M8 4h8v5a4 4 0 0 1-8 0V4z"/><path d="M8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4M12 13v4M8 20h8M10 17h4"/>',
  pdf: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M12 11v6M9 14l3 3 3-3"/>',
  play: '<path d="M7 5v14l12-7z"/>',
  pause: '<path d="M8 5v14M16 5v14"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
};

const SVG_NS = 'http://www.w3.org/2000/svg';

/**
 * Construit l'icône élément par élément (sans innerHTML) : compatible avec la protection
 * « Trusted Types » de la politique de sécurité, qui interdit toute insertion de HTML brut.
 */
export function icon(name: keyof typeof ICONS | string, size = 22): HTMLElement {
  const span = document.createElement('span');
  span.className = 'icon';
  span.setAttribute('aria-hidden', 'true');
  const svg = document.createElementNS(SVG_NS, 'svg');
  const attrs: Record<string, string> = {
    viewBox: '0 0 24 24', width: String(size), height: String(size), fill: 'none', stroke: 'currentColor',
    'stroke-width': '2', 'stroke-linecap': 'round', 'stroke-linejoin': 'round',
  };
  for (const [k, v] of Object.entries(attrs)) svg.setAttribute(k, v);
  for (const shape of (ICONS[name] ?? '').matchAll(/<(\w+)([^>]*)\/>/g)) {
    const el = document.createElementNS(SVG_NS, shape[1]!);
    for (const a of (shape[2] ?? '').matchAll(/([\w-]+)="([^"]*)"/g)) el.setAttribute(a[1]!, a[2]!);
    svg.appendChild(el);
  }
  span.appendChild(svg);
  return span;
}

/** Remplace tout le contenu d'un élément (accepte null / false pour les parties conditionnelles). */
export function setChildren(el: HTMLElement, ...children: Child[]): void {
  el.replaceChildren();
  append(el, children);
}
