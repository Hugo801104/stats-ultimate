// Mini générateur PDF, sans dépendance et utilisable hors-ligne.
// Polices standard Helvetica / Helvetica-Bold (encodage WinAnsi : accents français OK),
// rectangles, traits et texte. Coordonnées en points (1/72 pouce), origine EN HAUT à gauche.

export const A4 = { width: 595.28, height: 841.89 };

export type Rgb = [number, number, number];

/** « #0b6e69 » → [r, g, b] entre 0 et 1. */
export function hex(color: string): Rgb {
  const m = color.replace('#', '');
  return [0, 2, 4].map((i) => parseInt(m.slice(i, i + 2), 16) / 255) as Rgb;
}

/* ---------- Largeurs des caractères (métriques AFM Adobe, pour 1000 unités) ---------- */

// Caractères 32 à 126.
const REGULAR = [
  278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556,
  278, 278, 584, 584, 584, 556, 1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778, 667, 778, 722, 667,
  611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556, 333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833,
  556, 556, 556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584,
];
const BOLD = [
  278, 333, 474, 556, 556, 889, 722, 238, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556,
  333, 333, 584, 584, 584, 611, 975, 722, 722, 722, 722, 667, 611, 778, 722, 278, 556, 722, 611, 833, 722, 778, 667, 778, 722, 667,
  611, 722, 667, 944, 667, 667, 611, 333, 278, 333, 584, 556, 333, 556, 611, 556, 611, 556, 333, 611, 611, 278, 278, 556, 278, 889,
  611, 611, 611, 611, 389, 556, 333, 611, 556, 778, 556, 556, 500, 389, 280, 389, 584,
];
const SPECIAL_WIDTH: Record<string, [number, number]> = {
  '–': [556, 556], '—': [1000, 1000], '’': [222, 278], '‘': [222, 278], '“': [333, 500], '”': [333, 500],
  '«': [556, 556], '»': [556, 556], 'œ': [944, 944], 'Œ': [1000, 1000], '·': [278, 278], '…': [1000, 1000],
  '€': [556, 556], '•': [350, 350], '°': [400, 400], 'ß': [611, 611], 'æ': [889, 889], 'Æ': [1000, 1000],
};

// Caractères hors Latin-1 présents dans l'encodage WinAnsi.
const WIN_ANSI: Record<string, number> = {
  '€': 0x80, '‚': 0x82, '„': 0x84, '…': 0x85, 'Œ': 0x8c, '‘': 0x91, '’': 0x92, '“': 0x93, '”': 0x94, '•': 0x95,
  '–': 0x96, '—': 0x97, '™': 0x99, 'œ': 0x9c, 'Ÿ': 0x9f,
};

/** Normalise un texte pour les polices standard (espaces fines → espaces, caractères inconnus → ?). */
function encodeChar(ch: string): string {
  if (ch === ' ' || ch === ' ' || ch === ' ') return ' ';
  if (ch === '−') return '-';
  const code = ch.charCodeAt(0);
  if (WIN_ANSI[ch] !== undefined) return String.fromCharCode(WIN_ANSI[ch]);
  if (code >= 32 && code <= 126) return ch;
  if (code >= 0xa0 && code <= 0xff) return ch;
  return '?';
}

function charWidth(ch: string, bold: boolean): number {
  if (ch === ' ' || ch === ' ' || ch === ' ') return 278;
  const special = SPECIAL_WIDTH[ch];
  if (special) return bold ? special[1] : special[0];
  let code = ch.charCodeAt(0);
  if (code > 126) {
    // Lettres accentuées : même largeur que la lettre de base.
    const base = ch.normalize('NFD')[0] ?? '?';
    code = base.charCodeAt(0);
  }
  const table = bold ? BOLD : REGULAR;
  return table[code - 32] ?? 556;
}

export function textWidth(text: string, size: number, bold = false): number {
  let w = 0;
  for (const ch of text) w += charWidth(ch, bold);
  return (w * size) / 1000;
}

/** Raccourcit avec « … » pour tenir dans maxWidth. */
export function fitText(text: string, size: number, bold: boolean, maxWidth: number): string {
  if (textWidth(text, size, bold) <= maxWidth) return text;
  const chars = [...text];
  while (chars.length > 0 && textWidth(`${chars.join('')}…`, size, bold) > maxWidth) chars.pop();
  return `${chars.join('').replace(/[\s·,–-]+$/, '')}…`;
}

/** Découpe un texte en lignes de largeur maximale (respecte les retours à la ligne). */
export function wrapText(text: string, size: number, bold: boolean, maxWidth: number): string[] {
  const lines: string[] = [];
  for (const para of text.split(/\r?\n/)) {
    let line = '';
    for (const word of para.split(/\s+/).filter(Boolean)) {
      const candidate = line ? `${line} ${word}` : word;
      if (textWidth(candidate, size, bold) <= maxWidth || !line) line = candidate;
      else {
        lines.push(line);
        line = word;
      }
    }
    lines.push(line);
  }
  return lines;
}

const n = (v: number): string => (Math.round(v * 100) / 100).toString();
const color = ([r, g, b]: Rgb): string => `${n(r)} ${n(g)} ${n(b)}`;
function pdfString(text: string): string {
  let out = '';
  for (const ch of text) out += encodeChar(ch);
  return `(${out.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)')})`;
}

export interface TextOptions {
  size?: number;
  bold?: boolean;
  color?: Rgb;
  align?: 'left' | 'center' | 'right';
  /** Tronque avec « … » au-delà de cette largeur. */
  maxWidth?: number;
}

export interface RectOptions {
  fill?: Rgb;
  stroke?: Rgb;
  lineWidth?: number;
}

export class PdfDoc {
  readonly width: number;
  readonly height: number;
  private pages: string[][] = [];
  private title: string;

  constructor(title = 'Document', size = A4) {
    this.title = title;
    this.width = size.width;
    this.height = size.height;
  }

  get pageCount(): number {
    return this.pages.length;
  }

  addPage(): void {
    this.pages.push([]);
  }

  /** Revient sur une page déjà créée (ex. numéros de page à la fin). */
  private target: number | null = null;
  onPage(index: number | null): void {
    this.target = index;
  }

  private get ops(): string[] {
    if (this.pages.length === 0) this.addPage();
    return this.pages[this.target ?? this.pages.length - 1]!;
  }

  rect(x: number, y: number, w: number, h: number, o: RectOptions): void {
    const ops = this.ops;
    const parts = ['q'];
    if (o.fill) parts.push(`${color(o.fill)} rg`);
    if (o.stroke) parts.push(`${color(o.stroke)} RG ${n(o.lineWidth ?? 0.75)} w`);
    parts.push(`${n(x)} ${n(this.height - y - h)} ${n(w)} ${n(h)} re`);
    parts.push(o.fill && o.stroke ? 'B' : o.fill ? 'f' : 'S', 'Q');
    ops.push(parts.join(' '));
  }

  line(x1: number, y1: number, x2: number, y2: number, stroke: Rgb, lineWidth = 0.75): void {
    this.ops.push(`q ${color(stroke)} RG ${n(lineWidth)} w ${n(x1)} ${n(this.height - y1)} m ${n(x2)} ${n(this.height - y2)} l S Q`);
  }

  /** `y` = ligne de base du texte. */
  text(text: string, x: number, y: number, o: TextOptions = {}): void {
    const size = o.size ?? 10;
    const bold = o.bold ?? false;
    const t = o.maxWidth !== undefined ? fitText(text, size, bold, o.maxWidth) : text;
    const w = textWidth(t, size, bold);
    const left = o.align === 'center' ? x - w / 2 : o.align === 'right' ? x - w : x;
    this.ops.push(`BT /${bold ? 'F2' : 'F1'} ${n(size)} Tf ${color(o.color ?? [0, 0, 0])} rg ${n(left)} ${n(this.height - y)} Td ${pdfString(t)} Tj ET`);
  }

  /** Fichier PDF complet (octets). */
  toBytes(): Uint8Array {
    if (this.pages.length === 0) this.addPage();
    const objects: string[] = [];
    const add = (body: string): number => objects.push(body);

    add('<< /Type /Catalog /Pages 2 0 R >>'); // 1
    add(''); // 2 : liste des pages, remplie plus bas
    add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>'); // 3
    add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>'); // 4
    const info = add(`<< /Title ${pdfString(this.title)} /Producer (Stats Ultimate) >>`);
    const kids: number[] = [];
    for (const ops of this.pages) {
      const content = ops.join('\n');
      const contentId = add(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
      kids.push(add(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${n(this.width)} ${n(this.height)}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contentId} 0 R >>`));
    }
    objects[1] = `<< /Type /Pages /Kids [${kids.map((k) => `${k} 0 R`).join(' ')}] /Count ${kids.length} >>`;

    // Chaque caractère vaut un octet (texte déjà encodé en WinAnsi) : longueur = position.
    let out = '%PDF-1.4\n%\xe2\xe3\xcf\xd3\n';
    const offsets: number[] = [];
    objects.forEach((body, i) => {
      offsets.push(out.length);
      out += `${i + 1} 0 obj\n${body}\nendobj\n`;
    });
    const xref = out.length;
    out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
    for (const off of offsets) out += `${String(off).padStart(10, '0')} 00000 n \n`;
    out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R /Info ${info} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;

    const bytes = new Uint8Array(out.length);
    for (let i = 0; i < out.length; i++) bytes[i] = out.charCodeAt(i) & 0xff;
    return bytes;
  }
}
