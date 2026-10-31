// Feuille de match d'un tournoi au format PDF (A4), prête à imprimer, signer ou envoyer.

import { PdfDoc, hex, wrapText, type Rgb } from './pdf';
import { formatClock, rulesSummary, sheetState, sortedGoals, standings } from './tournament';
import type { TeamSide, Tournament, TournamentGame } from './types';
import { formatDateFr } from './util';

const C = {
  brand: hex('#0b6e69'),
  brandSoft: hex('#dcefed'),
  opp: hex('#8a2b46'),
  oppSoft: hex('#f8e3ea'),
  text: hex('#0f1f1e'),
  muted: hex('#566866'),
  border: hex('#c9d8d7'),
  zebra: hex('#f2f6f6'),
  white: [1, 1, 1] as Rgb,
  good: hex('#1b7f45'),
};

const M = 40; // marge
const BOTTOM = 52; // espace réservé au pied de page

const teamColor = (t: TeamSide): Rgb => (t === 'A' ? C.brand : C.opp);
const teamSoft = (t: TeamSide): Rgb => (t === 'A' ? C.brandSoft : C.oppSoft);

/** Bandeau de titre ; renvoie la position y sous le bandeau. */
function header(doc: PdfDoc, t: Tournament, subtitle: string): number {
  const W = doc.width - 2 * M;
  doc.rect(M, M, W, 62, { fill: C.brand });
  doc.text(subtitle.toUpperCase(), M + 16, M + 20, { size: 8.5, bold: true, color: C.brandSoft });
  doc.text(t.name, M + 16, M + 44, { size: 18, bold: true, color: C.white, maxWidth: W * 0.62 });
  doc.text(formatDateFr(t.date), M + W - 16, M + 24, { size: 10, bold: true, color: C.white, align: 'right' });
  if (t.location) doc.text(t.location, M + W - 16, M + 40, { size: 9.5, color: C.brandSoft, align: 'right', maxWidth: W * 0.34 });
  return M + 62;
}

function sectionTitle(doc: PdfDoc, label: string, y: number): number {
  doc.text(label.toUpperCase(), M, y + 10, { size: 9, bold: true, color: C.brand });
  doc.line(M, y + 15, doc.width - M, y + 15, C.border, 0.75);
  return y + 24;
}

/** Ajoute une ou plusieurs pages pour une feuille de match. */
function drawGame(doc: PdfDoc, t: Tournament, g: TournamentGame): void {
  const W = doc.width - 2 * M;
  const s = sheetState(g);
  const name = (team: TeamSide): string => (team === 'A' ? g.teamA : g.teamB);
  const winner: TeamSide | null = s.scoreA === s.scoreB ? null : s.scoreA > s.scoreB ? 'A' : 'B';

  doc.addPage();
  let y = header(doc, t, 'Feuille de match') + 14;

  /* Infos du match */
  const infos: [string, string][] = [
    ['Match', g.label || '—'],
    ['Terrain', g.field || '—'],
    ['Heure', g.time || '—'],
    ['Table de marque', g.scorekeeper || '—'],
  ];
  const widths = [0.32, 0.16, 0.14, 0.38].map((f) => f * W);
  let x = M;
  infos.forEach(([label, value], i) => {
    const w = widths[i]!;
    doc.rect(x, y, w - 6, 38, { stroke: C.border });
    doc.text(label.toUpperCase(), x + 9, y + 13, { size: 7, bold: true, color: C.muted });
    doc.text(value, x + 9, y + 29, { size: 10.5, bold: true, color: C.text, maxWidth: w - 24 });
    x += w;
  });
  y += 52;

  /* Score */
  const boxH = 92;
  doc.rect(M, y, W, boxH, { fill: C.zebra });
  doc.rect(M, y, 5, boxH, { fill: C.brand });
  doc.rect(M + W - 5, y, 5, boxH, { fill: C.opp });
  const colW = W * 0.36;
  for (const team of ['A', 'B'] as TeamSide[]) {
    const cx = team === 'A' ? M + colW / 2 + 8 : M + W - colW / 2 - 8;
    doc.text(name(team), cx, y + 36, { size: 14, bold: true, color: teamColor(team), align: 'center', maxWidth: colW - 16 });
    doc.text(team === 'A' ? 'ÉQUIPE A' : 'ÉQUIPE B', cx, y + 52, { size: 7.5, bold: true, color: C.muted, align: 'center' });
    if (winner === team && g.status === 'termine') {
      const label = 'VAINQUEUR';
      doc.rect(cx - 33, y + 60, 66, 15, { fill: C.good });
      doc.text(label, cx, y + 71, { size: 7.5, bold: true, color: C.white, align: 'center' });
    }
  }
  const mid = M + W / 2;
  doc.text(String(s.scoreA), mid - 22, y + 56, { size: 40, bold: true, color: C.text, align: 'right' });
  doc.text('–', mid, y + 52, { size: 26, color: C.muted, align: 'center' });
  doc.text(String(s.scoreB), mid + 22, y + 56, { size: 40, bold: true, color: C.text });
  const status = g.status === 'termine' ? (winner ? `Victoire de ${name(winner)}` : 'Match nul') : g.status === 'en_cours' ? 'Match en cours' : 'Match à venir';
  doc.text(`${status} · durée ${formatClock(s.elapsedMs)}`, mid, y + 80, { size: 8.5, color: C.muted, align: 'center', maxWidth: W * 0.3 });
  y += boxH + 10;
  doc.text(`Règles : ${rulesSummary(g.rules)}`, M, y + 8, { size: 8.5, color: C.muted, maxWidth: W });
  y += 22;

  /* Déroulé des points : deux colonnes de tableau, puis pages suivantes si besoin */
  y = sectionTitle(doc, `Déroulé des points (${g.goals.length})`, y);
  const goals = sortedGoals(g);
  const rows: { n: number; atMs: number; team: TeamSide; a: number; b: number }[] = [];
  let a = 0;
  let b = 0;
  goals.forEach((goal, i) => {
    if (goal.team === 'A') a++; else b++;
    rows.push({ n: i + 1, atMs: goal.atMs, team: goal.team, a, b });
  });

  const gap = 16;
  const tw = (W - gap) / 2;
  const cols = { n: 24, time: 46, team: (tw - 24 - 46 - 50) / 2, score: 50 };
  const rowH = 15;
  const tableHeader = (tx: number, ty: number): void => {
    doc.rect(tx, ty, tw, 17, { fill: C.text });
    const hy = ty + 11.5;
    doc.text('N°', tx + 6, hy, { size: 7.5, bold: true, color: C.white });
    doc.text('TEMPS', tx + cols.n + 4, hy, { size: 7.5, bold: true, color: C.white });
    doc.text(g.teamA, tx + cols.n + cols.time + cols.team / 2, hy, { size: 7.5, bold: true, color: C.white, align: 'center', maxWidth: cols.team - 6 });
    doc.text(g.teamB, tx + cols.n + cols.time + cols.team * 1.5, hy, { size: 7.5, bold: true, color: C.white, align: 'center', maxWidth: cols.team - 6 });
    doc.text('SCORE', tx + tw - 6, hy, { size: 7.5, bold: true, color: C.white, align: 'right' });
  };
  const drawRow = (r: (typeof rows)[number], tx: number, ty: number, zebra: boolean): void => {
    if (zebra) doc.rect(tx, ty, tw, rowH, { fill: C.zebra });
    const by = ty + 10.5;
    doc.text(String(r.n), tx + 6, by, { size: 8, color: C.muted });
    doc.text(formatClock(r.atMs), tx + cols.n + 4, by, { size: 8.5, color: C.text });
    const cellX = tx + cols.n + cols.time + (r.team === 'A' ? 0 : cols.team);
    doc.rect(cellX + 8, ty + 2, cols.team - 16, rowH - 4, { fill: teamColor(r.team) });
    doc.text(String(r.team === 'A' ? r.a : r.b), cellX + cols.team / 2, by, { size: 8.5, bold: true, color: C.white, align: 'center' });
    doc.text(`${r.a} – ${r.b}`, tx + tw - 6, by, { size: 9, bold: true, color: C.text, align: 'right' });
  };

  if (rows.length === 0) {
    doc.text('Aucun point saisi.', M, y + 10, { size: 9.5, color: C.muted });
    y += 22;
  } else {
    let i = 0;
    while (i < rows.length) {
      const top = y;
      const perCol = Math.max(1, Math.floor((doc.height - BOTTOM - 10 - top - 17) / rowH));
      const remaining = rows.length - i;
      // Peu de points : une colonne. Sinon deux colonnes, équilibrées si tout tient sur la page.
      const takes = remaining <= 12 && remaining <= perCol ? [remaining]
        : remaining <= 2 * perCol ? [Math.ceil(remaining / 2), Math.floor(remaining / 2)]
          : [perCol, perCol];
      let colEnd = top;
      for (const [col, take] of takes.entries()) {
        if (take === 0) continue;
        const tx = M + col * (tw + gap);
        tableHeader(tx, top);
        rows.slice(i, i + take).forEach((r, k) => drawRow(r, tx, top + 17 + k * rowH, k % 2 === 1));
        doc.rect(tx, top, tw, 17 + take * rowH, { stroke: C.border });
        colEnd = Math.max(colEnd, top + 17 + take * rowH);
        i += take;
      }
      y = colEnd + 14;
      if (i < rows.length) {
        doc.addPage();
        y = header(doc, t, `Feuille de match (suite) · ${g.teamA} – ${g.teamB}`) + 16;
      }
    }
  }

  /* Bas de feuille : temps morts, notes, signatures */
  const notes = g.notes.trim() ? wrapText(g.notes.trim(), 9, false, W - 20) : [];
  const toRows = Math.ceil(g.timeouts.length / 3);
  const bottomH = 24 + 18 + toRows * 14 + (notes.length ? 24 + notes.length * 12 + 10 : 0) + 24 + 70;
  if (y + bottomH > doc.height - BOTTOM) {
    doc.addPage();
    y = header(doc, t, `Feuille de match (suite) · ${g.teamA} – ${g.teamB}`) + 16;
  }

  y = sectionTitle(doc, 'Temps morts', y);
  const quota = g.rules.timeoutsPerTeam;
  doc.text(`${g.teamA} : ${s.timeoutsUsed.A}/${quota}`, M, y + 8, { size: 9.5, bold: true, color: C.brand, maxWidth: W / 2 - 10 });
  doc.text(`${g.teamB} : ${s.timeoutsUsed.B}/${quota}`, M + W / 2, y + 8, { size: 9.5, bold: true, color: C.opp, maxWidth: W / 2 - 10 });
  y += 18;
  if (g.timeouts.length === 0) {
    doc.text('Aucun temps mort.', M, y + 8, { size: 9, color: C.muted });
    y += 14;
  } else {
    g.timeouts.forEach((to, k) => {
      const tx = M + (k % 3) * (W / 3);
      const ty = y + Math.floor(k / 3) * 14;
      doc.rect(tx, ty + 1, 8, 8, { fill: teamColor(to.team) });
      doc.text(`${formatClock(to.atMs)}  ${name(to.team)}`, tx + 13, ty + 8.5, { size: 9, color: C.text, maxWidth: W / 3 - 20 });
    });
    y += toRows * 14;
  }
  y += 10;

  if (notes.length) {
    y = sectionTitle(doc, 'Notes', y);
    doc.rect(M, y - 4, W, notes.length * 12 + 10, { fill: C.zebra });
    notes.forEach((line, k) => doc.text(line, M + 10, y + 7 + k * 12, { size: 9, color: C.text }));
    y += notes.length * 12 + 16;
  }

  y = sectionTitle(doc, 'Signatures', y);
  const sigs: [string, Rgb, Rgb][] = [
    [`Capitaine ${g.teamA}`, C.brand, teamSoft('A')],
    [`Capitaine ${g.teamB}`, C.opp, teamSoft('B')],
    [`Table de marque${g.scorekeeper ? ` · ${g.scorekeeper}` : ''}`, C.text, C.zebra],
  ];
  const sw = (W - 2 * 10) / 3;
  sigs.forEach(([label, col], k) => {
    const sx = M + k * (sw + 10);
    doc.rect(sx, y, sw, 60, { stroke: C.border });
    doc.rect(sx, y, sw, 3, { fill: col });
    doc.text(label, sx + 8, y + 16, { size: 8, bold: true, color: col, maxWidth: sw - 16 });
  });
}

function footers(doc: PdfDoc, label: string): void {
  const stamp = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date());
  const total = doc.pageCount;
  for (let p = 0; p < total; p++) {
    doc.onPage(p);
    const fy = doc.height - 28;
    doc.line(M, fy - 10, doc.width - M, fy - 10, C.border, 0.5);
    doc.text(`${label} · édité le ${stamp} avec Stats Ultimate`, M, fy, { size: 7.5, color: C.muted, maxWidth: doc.width - 2 * M - 60 });
    doc.text(`${p + 1} / ${total}`, doc.width - M, fy, { size: 7.5, bold: true, color: C.muted, align: 'right' });
  }
  doc.onPage(null);
}

/** PDF d'une feuille de match. */
export function gameSheetPdf(t: Tournament, g: TournamentGame): Uint8Array {
  const doc = new PdfDoc(`Feuille de match · ${g.teamA} – ${g.teamB}`);
  drawGame(doc, t, g);
  footers(doc, `${t.name} · ${g.teamA} – ${g.teamB}`);
  return doc.toBytes();
}

/** PDF de tout le tournoi : bilan des équipes, puis une feuille par match. */
export function tournamentPdf(t: Tournament, games: TournamentGame[]): Uint8Array {
  const doc = new PdfDoc(`Feuilles de match · ${t.name}`);
  const W = doc.width - 2 * M;
  doc.addPage();
  let y = header(doc, t, 'Récapitulatif du tournoi') + 18;

  y = sectionTitle(doc, `Matchs (${games.length})`, y);
  const statusLabel = { a_venir: 'À venir', en_cours: 'En cours', termine: 'Terminé' } as const;
  games.forEach((g, k) => {
    if (y > doc.height - BOTTOM - 30) {
      doc.addPage();
      y = header(doc, t, 'Récapitulatif du tournoi (suite)') + 18;
    }
    const s = sheetState(g);
    if (k % 2 === 1) doc.rect(M, y - 2, W, 18, { fill: C.zebra });
    const by = y + 10;
    doc.text([g.time, g.label, g.field ? `T${g.field}` : ''].filter(Boolean).join(' · ') || `Match ${k + 1}`, M + 6, by, { size: 8.5, color: C.muted, maxWidth: W * 0.24 });
    const mx = M + W * 0.54;
    doc.text(g.teamA, mx - 30, by, { size: 9.5, bold: s.scoreA > s.scoreB, color: C.text, align: 'right', maxWidth: W * 0.22 });
    doc.text(`${s.scoreA} – ${s.scoreB}`, mx, by, { size: 10, bold: true, color: C.text, align: 'center' });
    doc.text(g.teamB, mx + 30, by, { size: 9.5, bold: s.scoreB > s.scoreA, color: C.text, maxWidth: W * 0.22 });
    doc.text(statusLabel[g.status], M + W - 6, by, { size: 8.5, color: g.status === 'termine' ? C.good : C.muted, align: 'right' });
    y += 18;
  });

  const table = standings(t).filter((r) => r.played > 0);
  if (table.length) {
    y += 14;
    if (y + 40 + table.length * 18 > doc.height - BOTTOM) {
      doc.addPage();
      y = header(doc, t, 'Récapitulatif du tournoi (suite)') + 18;
    }
    y = sectionTitle(doc, 'Bilan des équipes (matchs terminés)', y);
    const heads: [string, number][] = [['J', 0.5], ['V', 0.58], ['D', 0.66], ['N', 0.74], ['Pts +', 0.83], ['Pts −', 0.91], ['Diff', 1]];
    doc.rect(M, y, W, 17, { fill: C.text });
    doc.text('ÉQUIPE', M + 6, y + 11.5, { size: 7.5, bold: true, color: C.white });
    for (const [label, f] of heads) doc.text(label.toUpperCase(), M + W * f - 6, y + 11.5, { size: 7.5, bold: true, color: C.white, align: 'right' });
    y += 17;
    table.forEach((r, k) => {
      if (k % 2 === 1) doc.rect(M, y, W, 17, { fill: C.zebra });
      const diff = r.pointsFor - r.pointsAgainst;
      const vals = [r.played, r.won, r.lost, r.drawn, r.pointsFor, r.pointsAgainst];
      doc.text(`${k + 1}. ${r.team}`, M + 6, y + 11.5, { size: 9.5, bold: k === 0, color: C.text, maxWidth: W * 0.42 });
      vals.forEach((v, i) => doc.text(String(v), M + W * heads[i]![1] - 6, y + 11.5, { size: 9.5, color: C.text, align: 'right' }));
      doc.text(diff > 0 ? `+${diff}` : String(diff), M + W - 6, y + 11.5, { size: 9.5, bold: true, color: diff > 0 ? C.good : diff < 0 ? C.opp : C.muted, align: 'right' });
      y += 17;
    });
  }

  for (const g of games) drawGame(doc, t, g);
  footers(doc, t.name);
  return doc.toBytes();
}

/** Nom de fichier lisible : « feuille-plouf-disc-jockeys.pdf ». */
export function pdfFileName(...parts: string[]): string {
  const slug = parts.join(' ')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
    .slice(0, 80);
  return `${slug || 'feuille'}.pdf`;
}
