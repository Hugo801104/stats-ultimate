import { describe, expect, it } from 'vitest';
import { PdfDoc, fitText, textWidth, wrapText } from './pdf';
import { gameSheetPdf, pdfFileName, tournamentPdf } from './sheetPdf';
import { DEFAULT_RULES, callTimeout, finishGame, newGame, newTournament, startClock } from './tournament';
import type { TeamSide, TournamentGame } from './types';

const latin1 = (bytes: Uint8Array): string => Array.from(bytes, (b) => String.fromCharCode(b)).join('');

function sampleGame(points: number): TournamentGame {
  const g = newGame({ label: 'Poule A – match 3', field: '2', time: '10:30', teamA: 'Les Albatros', teamB: 'Disc Jockeys', scorekeeper: 'Les Frisés', rules: { ...DEFAULT_RULES, pointCap: 15 } });
  startClock(g, 0);
  for (let i = 0; i < points; i++) g.goals.push({ id: `g${i}`, team: (i % 3 === 2 ? 'B' : 'A') as TeamSide, atMs: (i + 1) * 95_000 });
  callTimeout(g, 'B', 600_000);
  g.notes = 'Très bon esprit du jeu. Appel « faute » discuté au point 7, résolu à l’amiable.';
  finishGame(g, 40 * 60_000);
  return g;
}

describe('générateur PDF', () => {
  it('produit un PDF valide avec une table xref cohérente', () => {
    const doc = new PdfDoc('Test');
    doc.text('Équipe à l’œuvre – « déjà »', 40, 40);
    doc.addPage();
    doc.rect(10, 10, 50, 50, { fill: [1, 0, 0] });
    const s = latin1(doc.toBytes());
    expect(s.startsWith('%PDF-1.4')).toBe(true);
    expect(s.trimEnd().endsWith('%%EOF')).toBe(true);
    expect(s).toContain('/Count 2');
    // Chaque entrée de la table xref pointe bien sur « N 0 obj ».
    const xrefAt = Number(s.match(/startxref\n(\d+)/)![1]);
    const entries = s.slice(xrefAt).split('\n').filter((l) => / n $/.test(l));
    entries.forEach((line, i) => expect(s.slice(Number(line.slice(0, 10)))).toMatch(new RegExp(`^${i + 1} 0 obj`)));
  });
  it('encode les accents en WinAnsi', () => {
    const doc = new PdfDoc();
    doc.text('é – œ ’', 0, 0);
    const s = latin1(doc.toBytes());
    expect(s).toContain('(\xe9 \x96 \x9c \x92)');
  });
  it('mesure, tronque et coupe le texte', () => {
    expect(textWidth('AAA', 10)).toBeCloseTo(20.01);
    expect(textWidth('é', 10)).toBe(textWidth('e', 10));
    expect(fitText('Un nom d’équipe beaucoup trop long', 10, false, 60)).toMatch(/…$/);
    expect(wrapText('un deux trois quatre cinq', 10, false, 40).length).toBeGreaterThan(1);
  });
});

describe('feuille de match PDF', () => {
  it('feuille simple sur une page', () => {
    const t = newTournament('Tournoi de la Toussaint', '2026-10-31', 'La Chevrolière', ['Les Albatros', 'Disc Jockeys', 'Les Frisés'], DEFAULT_RULES);
    const g = sampleGame(19);
    const s = latin1(gameSheetPdf(t, g));
    expect(s).toContain('/Count 1');
    expect(s).toContain('(Disc Jockeys)');
  });
  it('beaucoup de points : la feuille continue sur une 2e page', () => {
    const t = newTournament('T', '2026-10-31', '', [], DEFAULT_RULES);
    const s = latin1(gameSheetPdf(t, sampleGame(70)));
    expect(s).toContain('/Count 2');
  });
  it('PDF du tournoi : récapitulatif + une feuille par match', () => {
    const t = newTournament('Tournoi de la Toussaint', '2026-10-31', 'La Chevrolière', [], DEFAULT_RULES);
    t.games.push(sampleGame(12), sampleGame(20));
    const bytes = tournamentPdf(t, t.games);
    expect(latin1(bytes)).toContain('/Count 3');
  });
  it('nom de fichier sans accents ni espaces', () => {
    expect(pdfFileName('feuille', 'Les Albatros', 'Disc Jockeys à Nantes')).toBe('feuille-les-albatros-disc-jockeys-a-nantes.pdf');
  });
});
