import { buildMatchSummary, playerName, sortPlayers, summaryText } from '../../exporters';
import { EVENT_LABELS, LINE_LABELS } from '../../labels';
import {
  deletePoint, getScore, pointLines, replacePoint, reopenMatch, type PointDraft,
} from '../../match';
import { computePlayerStats, matchResult } from '../../stats';
import { getState, update } from '../../store';
import type { EventType, LineType, Match, Player, PointEvent, PointResult, Side } from '../../types';
import { formatDateFr, signed, uid } from '../../util';
import { confirmDialog, emptyState, errorMessage, field, openModal, playerLabel, segmented, toast } from '../components';
import { h, icon, setChildren } from '../dom';
import { shareFile, shareText } from '../files';
import { navigate, type View } from '../router';
import { renderSummaryImage } from '../summaryImage';
import { openMatchForm } from './matchForm';

export function matchDetailView(params: Record<string, string>): View {
  const st = getState();
  const match = st.matches.find((m) => m.id === params.id);
  if (!match) {
    return { el: h('div', { class: 'page' }, emptyState('Match introuvable', 'Il a peut-être été supprimé.', h('a', { class: 'btn btn--primary', href: '#/' }, 'Retour aux matchs'))) };
  }
  const season = st.seasons.find((s) => s.id === match.seasonId);
  const { pour, contre } = getScore(match);
  const result = matchResult(match);
  const live = match.status === 'en_cours';

  const stats = [...computePlayerStats([match]).values()]
    .filter((s) => s.pointsPlayed > 0 || s.turnovers + s.defenses + s.pulls > 0)
    .sort((a, b) => b.plusMinus - a.plusMinus || b.goals - a.goals);

  const el = h(
    'div',
    { class: 'page' },
    h(
      'header',
      { class: 'page-head' },
      h('a', { class: 'btn btn--ghost btn--icon', href: '#/', 'aria-label': 'Retour aux matchs' }, icon('back')),
      h('div', { class: 'page-head__title' },
        h('h1', null, `vs ${match.opponent || 'Entraînement'}`),
        h('p', { class: 'muted' }, [formatDateFr(match.date), match.kind === 'entrainement' ? 'Entraînement' : '', match.tournament, match.location, season ? `Saison ${season.name}` : ''].filter(Boolean).join(' · ')),
      ),
      h('button', { class: 'btn btn--ghost btn--icon', type: 'button', 'aria-label': 'Modifier les infos du match', onclick: () => openMatchForm(match) }, icon('edit')),
    ),
    h(
      'section',
      { class: 'hero' },
      h('div', { class: `hero__score ${result ? `score--${result}` : ''}` }, `${pour} – ${contre}`),
      live ? h('span', { class: 'badge badge--live' }, 'En cours') : result ? h('span', { class: `badge badge--${result}` }, result === 'victoire' ? 'Victoire' : result === 'defaite' ? 'Défaite' : 'Match nul') : null,
    ),
    h(
      'div',
      { class: 'inline-actions' },
      live
        ? h('a', { class: 'btn btn--primary', href: `#/live/${match.id}` }, 'Reprendre la saisie')
        : h('button', { class: 'btn', type: 'button', onclick: () => { update((s) => { const m = s.matches.find((x) => x.id === match.id); if (m) reopenMatch(m); }); navigate(`/live/${match.id}`); } }, 'Reprendre la saisie'),
      h('button', { class: 'btn', type: 'button', onclick: () => openSummary(match) }, icon('share', 18), ' Résumé à partager'),
      h('button', { class: 'btn btn--danger-ghost', type: 'button', onclick: () => void removeMatch(match) }, 'Supprimer'),
    ),
  );

  /* Stats du match */
  el.appendChild(h('h2', { class: 'section-title' }, 'Stats du match'));
  if (stats.length === 0) {
    el.appendChild(h('p', { class: 'muted' }, 'Aucun point saisi pour le moment.'));
  } else {
    el.appendChild(
      h(
        'div',
        { class: 'table-wrap' },
        h(
          'table',
          { class: 'table' },
          h('thead', null, h('tr', null, ['Joueur', 'Pts', 'B', 'PD', 'D', 'Pertes', '+/-'].map((t, i) => h('th', { class: i ? 'num' : '', title: HEAD_TITLES[t] ?? '' }, t)))),
          h(
            'tbody',
            null,
            stats.map((s) =>
              h('tr', null,
                h('td', null, h('a', { href: `#/joueur/${s.playerId}` }, playerName(st.players, s.playerId))),
                h('td', { class: 'num' }, s.pointsPlayed), h('td', { class: 'num' }, s.goals), h('td', { class: 'num' }, s.assists),
                h('td', { class: 'num' }, s.defenses), h('td', { class: 'num' }, s.turnovers),
                h('td', { class: `num ${s.plusMinus > 0 ? 'pos' : s.plusMinus < 0 ? 'neg' : ''}` }, signed(s.plusMinus)),
              )),
          ),
        ),
      ),
    );
  }

  /* Déroulé point par point */
  el.appendChild(h('h2', { class: 'section-title' }, 'Déroulé point par point'));
  const lines = pointLines(match);
  if (lines.length === 0) el.appendChild(h('p', { class: 'muted' }, 'Pas encore de point.'));
  else {
    el.appendChild(
      h(
        'ol',
        { class: 'timeline' },
        [...lines].reverse().map((l) => {
          const p = l.point;
          const open = p.result === null;
          return h(
            'li',
            { class: `tl ${p.result ? `tl--${p.result}` : 'tl--open'}` },
            h('div', { class: 'tl__score' }, open ? '…' : `${l.pour}–${l.contre}`),
            h(
              'div',
              { class: 'tl__body' },
              h('div', { class: 'tl__title' },
                h('b', null, `Point ${l.index + 1}`), ' · ',
                p.result === 'pour' ? `But de ${playerName(st.players, p.scorerId)}${p.assistId ? ` (passe de ${playerName(st.players, p.assistId)})` : ' (sans passeur)'}` : p.result === 'contre' ? 'Point encaissé' : 'Point en cours'),
              h('div', { class: 'tl__meta' }, `${p.startedOn === 'attaque' ? 'Attaque' : 'Défense'} · ligne ${LINE_LABELS[p.lineType].toLowerCase()} · ${p.lineup.map((id) => playerName(st.players, id)).join(', ')}`),
              p.events.length ? h('div', { class: 'eventlog' }, p.events.map((e) => h('span', { class: `evchip evchip--${e.type}` }, `${shortEvent(e.type)} · ${playerName(st.players, e.playerId)}`))) : null,
            ),
            h('button', { class: 'btn btn--small', type: 'button', onclick: () => openPointEditor(match.id, p.id) }, 'Corriger'),
          );
        }),
      ),
    );
  }
  return { el };
}

const HEAD_TITLES: Record<string, string> = {
  Pts: 'Points joués', B: 'Buts', PD: 'Passes décisives', D: 'Défenses', Pertes: 'Disques perdus (lancers ratés + drops)',
  '+/-': 'Buts + passes D + défenses − disques perdus',
};

function shortEvent(t: EventType): string {
  return t === 'defense' ? 'D' : t === 'lancer_rate' ? 'Lancer raté' : t === 'drop' ? 'Drop' : 'Pull';
}

async function removeMatch(match: Match): Promise<void> {
  const ok = await confirmDialog(`Supprimer définitivement le match contre ${match.opponent || 'cet adversaire'} et ses ${match.points.length} points ?`, 'Supprimer', true);
  if (!ok) return;
  update((s) => { s.matches = s.matches.filter((m) => m.id !== match.id); });
  toast('Match supprimé.');
  navigate('/');
}

/* ---------- Résumé partageable ---------- */

function openSummary(match: Match): void {
  const st = getState();
  const season = st.seasons.find((s) => s.id === match.seasonId);
  const summary = buildMatchSummary(match, st.players, st.settings.teamName, season);
  const text = summaryText(summary);
  const preview = h('div', { class: 'summary-preview', 'aria-live': 'polite' }, h('p', { class: 'muted' }, 'Création de l’image…'));
  let imageBlob: Blob | null = null;
  let imageUrl: string | null = null;

  const content = h(
    'div',
    null,
    preview,
    h('textarea', { class: 'summary-text', readonly: true, rows: 9, 'aria-label': 'Résumé en texte' }, text),
    h(
      'div',
      { class: 'modal__actions modal__actions--wrap' },
      h('button', { class: 'btn btn--primary', type: 'button', onclick: async () => {
        const r = await shareText(summary.title, text);
        toast(r === 'copied' ? 'Texte copié dans le presse-papiers.' : r === 'failed' ? 'Copie impossible : sélectionne le texte à la main.' : 'Résumé partagé.', { kind: r === 'failed' ? 'error' : 'success' });
      } }, 'Partager le texte'),
      h('button', { class: 'btn', type: 'button', onclick: async () => {
        if (!imageBlob) return toast('Image pas encore prête.', { kind: 'error' });
        const file = new File([imageBlob], `resume-${match.date}.png`, { type: 'image/png' });
        const r = await shareFile(file, summary.title);
        toast(r === 'shared' ? 'Image partagée.' : 'Image téléchargée.', { kind: 'success' });
      } }, 'Partager l’image'),
    ),
  );
  const modal = openModal('Résumé du match', content, {
    onClose: () => { if (imageUrl) URL.revokeObjectURL(imageUrl); },
  });
  renderSummaryImage(summary).then(
    (blob) => {
      imageBlob = blob;
      imageUrl = URL.createObjectURL(blob);
      if (document.body.contains(modal.body)) preview.replaceChildren(h('img', { src: imageUrl, alt: `Résumé : ${summary.title}`, class: 'summary-img' }));
    },
    (err) => preview.replaceChildren(h('p', { class: 'form-error' }, errorMessage(err))),
  );
}

/* ---------- Correction d'un point ---------- */

export function openPointEditor(matchId: string, pointId: string): void {
  const st = getState();
  const match = st.matches.find((m) => m.id === matchId);
  const point = match?.points.find((p) => p.id === pointId);
  if (!match || !point) return;
  const isLast = match.points[match.points.length - 1]?.id === pointId;

  const draft: PointDraft = {
    lineup: [...point.lineup],
    lineType: point.lineType,
    startedOn: point.startedOn,
    result: point.result,
    scorerId: point.scorerId,
    assistId: point.assistId,
    events: point.events.map((e) => ({ ...e })),
  };
  // Joueurs proposables : présents du match + ceux déjà dans la ligne (même archivés).
  const candidates: Player[] = sortPlayers(
    st.players.filter((p) => p.active || point.lineup.includes(p.id) || match.presentIds.includes(p.id)),
  );
  let newEvent: { type: EventType; playerId: string } = { type: 'defense', playerId: '' };

  const body = h('div', { class: 'form' });
  const error = h('p', { class: 'form-error', role: 'alert', hidden: true });

  const selectOf = (value: string, options: { value: string; label: string }[], onChange: (v: string) => void, label: string): HTMLElement =>
    h('select', { value, 'aria-label': label, onchange: (e: Event) => onChange((e.target as HTMLSelectElement).value) },
      options.map((o) => h('option', { value: o.value }, o.label)));

  const inLineup = (): Player[] => candidates.filter((p) => draft.lineup.includes(p.id));

  const render = (): void => {
    const lineupPlayers = inLineup();
    if (newEvent.playerId === '' || !draft.lineup.includes(newEvent.playerId)) newEvent.playerId = lineupPlayers[0]?.id ?? '';
    setChildren(
      body,
      segmented<'pour' | 'contre' | 'en_cours'>(
        'Résultat',
        [{ value: 'pour', label: 'But pour nous' }, { value: 'contre', label: 'Point encaissé' }, ...(isLast ? [{ value: 'en_cours' as const, label: 'En cours' }] : [])],
        draft.result ?? 'en_cours',
        (v) => { draft.result = v === 'en_cours' ? null : (v as PointResult); render(); },
      ),
      draft.result === 'pour'
        ? h('div', { class: 'grid-2' },
            field('Marqueur', selectOf(draft.scorerId ?? '', [{ value: '', label: '— choisir —' }, ...lineupPlayers.map((p) => ({ value: p.id, label: playerLabel(p) }))], (v) => { draft.scorerId = v || null; }, 'Marqueur')),
            field('Passeur', selectOf(draft.assistId ?? '', [{ value: '', label: 'Sans passeur' }, ...lineupPlayers.map((p) => ({ value: p.id, label: playerLabel(p) }))], (v) => { draft.assistId = v || null; }, 'Passeur')),
          )
        : null,
      h('div', { class: 'grid-2' },
        h('div', null, h('label', { class: 'label' }, 'Départ'), segmented<Side>('Départ', [{ value: 'attaque', label: 'Attaque' }, { value: 'defense', label: 'Défense' }], draft.startedOn, (v) => { draft.startedOn = v; render(); })),
        h('div', null, h('label', { class: 'label' }, 'Type de ligne'), segmented<LineType>('Type de ligne', (['attaque', 'defense', 'mixte'] as LineType[]).map((v) => ({ value: v, label: LINE_LABELS[v] })), draft.lineType, (v) => { draft.lineType = v; render(); })),
      ),
      h('div', { class: 'field' },
        h('div', { class: 'field__row' }, h('label', null, 'Ligne'), h('span', { class: 'hint' }, `${draft.lineup.length} joueur${draft.lineup.length > 1 ? 's' : ''}`)),
        h('div', { class: 'chips' }, candidates.map((p) => {
          const on = draft.lineup.includes(p.id);
          return h('button', { type: 'button', class: `chip ${on ? 'is-on' : ''}`, 'aria-pressed': on ? 'true' : 'false', onclick: () => {
            draft.lineup = on ? draft.lineup.filter((x) => x !== p.id) : [...draft.lineup, p.id];
            if (!draft.lineup.includes(draft.scorerId ?? '')) draft.scorerId = null;
            if (!draft.lineup.includes(draft.assistId ?? '')) draft.assistId = null;
            render();
          } }, playerLabel(p));
        })),
      ),
      h('div', { class: 'field' },
        h('label', null, 'Événements du point'),
        draft.events.length === 0 ? h('p', { class: 'hint' }, 'Aucun événement.') : h('ul', { class: 'evlist' }, draft.events.map((e) =>
          h('li', null, h('span', null, `${EVENT_LABELS[e.type]} · ${playerName(st.players, e.playerId)}`),
            h('button', { type: 'button', class: 'btn btn--small btn--danger-ghost', 'aria-label': 'Supprimer cet événement', onclick: () => { draft.events = draft.events.filter((x) => x.id !== e.id); render(); } }, '✕')))),
        h('div', { class: 'evadd' },
          selectOf(newEvent.type, (Object.keys(EVENT_LABELS) as EventType[]).map((t) => ({ value: t, label: EVENT_LABELS[t] })), (v) => { newEvent.type = v as EventType; }, 'Type d’événement'),
          selectOf(newEvent.playerId, lineupPlayers.map((p) => ({ value: p.id, label: playerLabel(p) })), (v) => { newEvent.playerId = v; }, 'Joueur'),
          h('button', { type: 'button', class: 'btn btn--small', onclick: () => {
            if (!newEvent.playerId) return;
            const ev: PointEvent = { id: uid(), type: newEvent.type, playerId: newEvent.playerId };
            draft.events = [...draft.events, ev];
            render();
          } }, 'Ajouter'),
        ),
      ),
      error,
      h('div', { class: 'modal__actions modal__actions--wrap' },
        h('button', { type: 'button', class: 'btn btn--danger-ghost', onclick: async () => {
          const ok = await confirmDialog('Supprimer ce point ? Le score et les stats seront recalculés.', 'Supprimer le point', true);
          if (!ok) return;
          try { update((s) => { const m = s.matches.find((x) => x.id === matchId); if (m) deletePoint(m, pointId); }); modal.close(); toast('Point supprimé.'); }
          catch (err) { error.textContent = errorMessage(err); error.hidden = false; }
        } }, 'Supprimer le point'),
        h('button', { type: 'button', class: 'btn btn--primary', onclick: () => {
          try {
            update((s) => { const m = s.matches.find((x) => x.id === matchId); if (!m) throw new Error('Match introuvable.'); replacePoint(m, pointId, draft); });
            modal.close();
            toast('Point corrigé.', { kind: 'success' });
          } catch (err) { error.textContent = errorMessage(err); error.hidden = false; }
        } }, 'Enregistrer'),
      ),
    );
  };

  const modal = openModal(`Corriger le point ${match.points.indexOf(point) + 1}`, body, { wide: true });
  render();
}
