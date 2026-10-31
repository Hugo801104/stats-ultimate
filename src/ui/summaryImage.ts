// Image du résumé de match (canvas 1080×1350), à partager sur le groupe de discussion.

import type { MatchSummary, RankedName } from '../exporters';

const W = 1080;
const H = 1350;

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(' ');
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    const test = cur ? `${cur} ${w}` : w;
    if (ctx.measureText(test).width > maxWidth && cur) {
      lines.push(cur);
      cur = w;
    } else cur = test;
  }
  if (cur) lines.push(cur);
  return lines;
}

export async function renderSummaryImage(s: MatchSummary): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error("Impossible de créer l'image sur cet appareil.");
  const font = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

  const grad = ctx.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, '#0b6e69');
  grad.addColorStop(1, '#063c3a');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  // Disque décoratif
  ctx.save();
  ctx.globalAlpha = 0.08;
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.ellipse(W - 120, 140, 260, 130, -0.35, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  ctx.fillStyle = '#fff';
  ctx.textAlign = 'center';
  ctx.font = `600 40px ${font}`;
  ctx.globalAlpha = 0.85;
  ctx.fillText(s.outcome.toUpperCase(), W / 2, 130);
  ctx.globalAlpha = 1;

  ctx.font = `800 220px ${font}`;
  ctx.fillText(`${s.pour} – ${s.contre}`, W / 2, 360);

  ctx.font = `700 54px ${font}`;
  ctx.fillText(`${s.teamName}  vs  ${s.opponent}`.slice(0, 40), W / 2, 450);

  ctx.font = `400 32px ${font}`;
  ctx.globalAlpha = 0.8;
  const metaLines = wrapText(ctx, s.meta, W - 160).slice(0, 2);
  metaLines.forEach((l, i) => ctx.fillText(l, W / 2, 505 + i * 42));
  ctx.globalAlpha = 1;

  ctx.textAlign = 'left';
  let y = 640;
  const section = (title: string, items: RankedName[]): void => {
    if (items.length === 0) return;
    ctx.font = `700 34px ${font}`;
    ctx.fillStyle = '#7ee0d6';
    ctx.fillText(title.toUpperCase(), 90, y);
    y += 50;
    ctx.fillStyle = '#fff';
    ctx.font = `500 42px ${font}`;
    const line = items.map((i) => `${i.name} ${i.count}`).join('   ·   ');
    for (const l of wrapText(ctx, line, W - 180).slice(0, 2)) {
      ctx.fillText(l, 90, y);
      y += 56;
    }
    y += 34;
  };
  section('Buts', s.scorers);
  section('Passes décisives', s.assisters);
  section('Défenses', s.defenders);

  ctx.font = `700 34px ${font}`;
  ctx.fillStyle = '#7ee0d6';
  ctx.fillText('DISQUES PERDUS', 90, y);
  y += 50;
  ctx.fillStyle = '#fff';
  ctx.font = `500 42px ${font}`;
  ctx.fillText(`${s.turnovers.total}  (${s.turnovers.throwaways} lancers · ${s.turnovers.drops} drops)`, 90, y);

  ctx.textAlign = 'center';
  ctx.font = `600 30px ${font}`;
  ctx.globalAlpha = 0.6;
  ctx.fillText('Stats Ultimate · Les Plouf', W / 2, H - 50);

  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Création de l'image impossible."))), 'image/png');
  });
}
