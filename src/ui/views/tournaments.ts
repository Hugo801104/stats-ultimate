// Tournois : liste, fiche d'un tournoi (matchs + bilan), formulaires tournoi / match / règles.

import { getState, update } from '../../store';
import {
  DEFAULT_RULES, TIME_CAP_LABELS, cleanTeams, formatClock, newGame, newTournament, rulesError, rulesSummary, sheetState, standings, validateGame,
  type GameDraft,
} from '../../tournament';
import type { GameRules, TimeCapMode, Tournament, TournamentGame } from '../../types';
import { formatDateFr, isISODate, todayISO } from '../../util';
import { confirmDialog, emptyState, errorMessage, field, openModal, pageHeader, segmented, toast } from '../components';
import { h, icon, setChildren } from '../dom';
import { navigate, type View } from '../router';
import { pdfFileName, tournamentPdf } from '../../sheetPdf';
import { sharePdf } from '../files';

/* ---------- Éditeur de règles (partagé tournoi / match) ---------- */

function numInput(value: number, min: number, max: number, onInput: (v: number) => void): HTMLInputElement {
  return h('input', {
    type: 'number', inputmode: 'numeric', min, max, value,
    oninput: (e: Event) => onInput(Number((e.target as HTMLInputElement).value)),
  });
}

/** Modifie `rules` en place. */
export function rulesEditor(rules: GameRules): HTMLElement {
  const host = h('div', { class: 'rules-editor' });
  const summary = h('p', { class: 'hint rules-editor__summary' });
  const refresh = (): void => {
    const err = rulesError(rules);
    summary.textContent = err ?? rulesSummary(rules);
    summary.classList.toggle('form-error', err !== null);
  };

  const render = (): void => {
    const capOn = rules.pointCap !== null;
    const capInput = numInput(rules.pointCap ?? rules.targetPoints + 2, 1, 99, (v) => { rules.pointCap = v; refresh(); });
    setChildren(host,
      h('div', { class: 'grid-2' },
        field('Partie en (points)', numInput(rules.targetPoints, 1, 99, (v) => { rules.targetPoints = v; refresh(); })),
        h('div', { class: 'field' },
          h('label', { class: 'check' },
            h('input', { type: 'checkbox', checked: capOn, onchange: (e: Event) => {
              rules.pointCap = (e.target as HTMLInputElement).checked ? rules.targetPoints + 2 : null;
              render();
            } }),
            '2 pts d’écart, cap à…'),
          capOn ? capInput : h('small', { class: 'hint' }, 'Le premier au score cible gagne.'),
        ),
      ),
      h('div', { class: 'field' },
        h('span', { class: 'label' }, 'À la fin du temps de jeu'),
        segmented<TimeCapMode>(
          'À la fin du temps de jeu',
          (['plus1', 'fin', 'aucun'] as TimeCapMode[]).map((v) => ({ value: v, label: TIME_CAP_LABELS[v] })),
          rules.timeCap,
          (v) => { rules.timeCap = v; render(); },
        ),
        h('small', { class: 'hint' },
          rules.timeCap === 'plus1' ? 'On finit le point en cours, puis on joue jusqu’au meilleur score + 1.'
            : rules.timeCap === 'fin' ? 'On finit le point en cours et le match s’arrête (point décisif en cas d’égalité).'
              : 'Pas de limite de temps : le chrono est indicatif.'),
      ),
      rules.timeCap !== 'aucun'
        ? field('Temps de jeu (minutes)', numInput(rules.durationMin, 1, 300, (v) => { rules.durationMin = v; refresh(); }))
        : null,
      h('div', { class: 'grid-2' },
        field('Temps morts par équipe', numInput(rules.timeoutsPerTeam, 0, 10, (v) => { rules.timeoutsPerTeam = v; refresh(); })),
        field('Durée d’un temps mort (s)', numInput(rules.timeoutSeconds, 10, 600, (v) => { rules.timeoutSeconds = v; refresh(); })),
      ),
      summary,
    );
    refresh();
  };
  render();
  return host;
}

/* ---------- Liste des tournois ---------- */

function gameCounts(t: Tournament): string {
  const done = t.games.filter((g) => g.status === 'termine').length;
  return `${t.games.length} match${t.games.length > 1 ? 's' : ''}${t.games.length ? ` · ${done} terminé${done > 1 ? 's' : ''}` : ''}`;
}

export function tournamentsView(): View {
  const st = getState();
  const list = [...st.tournaments].sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt);
  const newBtn = h('button', { class: 'btn btn--primary', type: 'button', onclick: () => openTournamentForm() }, icon('plus', 18), ' Nouveau tournoi');
  const live = st.tournaments.flatMap((t) => t.games.filter((g) => g.status === 'en_cours').map((g) => ({ t, g })));

  return {
    el: h('div', { class: 'page' },
      pageHeader('Tournois', newBtn),
      live.map(({ t, g }) => h('a', { class: 'banner', href: `#/feuille/${t.id}/${g.id}` },
        h('strong', null, 'Feuille en cours'), ` · ${g.teamA} – ${g.teamB} (${t.name}) — reprendre`)),
      list.length === 0
        ? emptyState('Aucun tournoi', 'Crée un tournoi pour tenir les feuilles de match : équipes, chrono, points, temps morts et cap.',
          h('button', { class: 'btn btn--primary', type: 'button', onclick: () => openTournamentForm() }, 'Nouveau tournoi'))
        : h('div', { class: 'list' }, list.map((t) => h('a', { class: 'card match-card', href: `#/tournoi/${t.id}` },
          h('div', { class: 'match-card__main' },
            h('div', { class: 'match-card__date' }, formatDateFr(t.date)),
            h('div', { class: 'match-card__title' }, t.name),
            h('div', { class: 'match-card__sub' }, [t.location, `${t.teams.length} équipe${t.teams.length > 1 ? 's' : ''}`].filter(Boolean).join(' · ')),
          ),
          h('div', { class: 'match-card__score' }, h('span', { class: 'badge' }, gameCounts(t))),
        ))),
    ),
  };
}

/* ---------- Formulaire tournoi ---------- */

export function openTournamentForm(existing?: Tournament): void {
  const draft = {
    name: existing?.name ?? '',
    date: existing?.date ?? todayISO(),
    location: existing?.location ?? '',
    teams: (existing?.teams ?? []).join('\n'),
    rules: { ...(existing?.rules ?? DEFAULT_RULES) },
  };
  const error = h('p', { class: 'form-error', role: 'alert', hidden: true });
  const text = (key: 'name' | 'location', placeholder: string): HTMLInputElement =>
    h('input', { type: 'text', value: draft[key], placeholder, oninput: (e: Event) => { draft[key] = (e.target as HTMLInputElement).value; } });

  const form = h('form', { class: 'form', novalidate: true },
    field('Nom du tournoi', text('name', 'Ex. Tournoi de la Toussaint')),
    h('div', { class: 'grid-2' },
      field('Date', h('input', { type: 'date', value: draft.date, oninput: (e: Event) => { draft.date = (e.target as HTMLInputElement).value; } })),
      field('Lieu', text('location', 'Optionnel')),
    ),
    field('Équipes engagées', h('textarea', { rows: 5, placeholder: 'Une équipe par ligne', oninput: (e: Event) => { draft.teams = (e.target as HTMLTextAreaElement).value; } }, draft.teams),
      'Une par ligne. Tu pourras en ajouter en créant les matchs.'),
    h('h3', { class: 'section-title' }, 'Règles par défaut des matchs'),
    h('p', { class: 'hint' }, 'Reprises pour chaque nouveau match, modifiables match par match.'),
    rulesEditor(draft.rules),
    error,
    h('div', { class: 'modal__actions' }, h('button', { class: 'btn btn--primary btn--block', type: 'submit' }, existing ? 'Enregistrer' : 'Créer le tournoi')),
  );
  const modal = openModal(existing ? 'Modifier le tournoi' : 'Nouveau tournoi', form, { wide: true });

  form.addEventListener('submit', (ev) => {
    ev.preventDefault();
    const failMsg = (msg: string): void => { error.textContent = msg; error.hidden = false; };
    const name = draft.name.trim();
    if (!name) return failMsg('Donne un nom au tournoi.');
    if (!isISODate(draft.date)) return failMsg('Choisis une date valide.');
    const rErr = rulesError(draft.rules);
    if (rErr) return failMsg(rErr);
    const teams = cleanTeams(draft.teams.split('\n'));
    try {
      let id = existing?.id ?? '';
      update((s) => {
        if (existing) {
          const t = s.tournaments.find((x) => x.id === existing.id);
          if (!t) throw new Error('Tournoi introuvable.');
          Object.assign(t, { name, date: draft.date, location: draft.location.trim(), teams, rules: { ...draft.rules } });
        } else {
          const t = newTournament(name, draft.date, draft.location.trim(), teams, draft.rules);
          id = t.id;
          s.tournaments.push(t);
        }
      });
      modal.close();
      if (existing) toast('Tournoi mis à jour.', { kind: 'success' });
      else navigate(`/tournoi/${id}`);
    } catch (err) {
      failMsg(errorMessage(err));
    }
  });
}

/* ---------- Formulaire match ---------- */

/** Règles repliables, avec le résumé à jour dans l'en-tête. */
function rulesDetails(rules: GameRules, open: boolean): HTMLElement {
  const summary = h('summary', null);
  const refresh = (): void => { summary.textContent = `Règles du match · ${rulesError(rules) ?? rulesSummary(rules)}`; };
  const details = h('details', { class: 'rules-details', open: open || undefined }, summary, rulesEditor(rules));
  details.addEventListener('input', refresh);
  details.addEventListener('click', () => queueMicrotask(refresh));
  refresh();
  return details;
}

export function openGameForm(t: Tournament, existing?: TournamentGame): void {
  const draft: GameDraft = {
    label: existing?.label ?? '',
    field: existing?.field ?? '',
    time: existing?.time ?? '',
    teamA: existing?.teamA ?? '',
    teamB: existing?.teamB ?? '',
    scorekeeper: existing?.scorekeeper ?? '',
    rules: { ...(existing?.rules ?? t.rules) },
  };
  const listId = `dl-teams-${t.id}`;
  const error = h('p', { class: 'form-error', role: 'alert', hidden: true });
  const input = (key: 'label' | 'field' | 'teamA' | 'teamB' | 'scorekeeper', placeholder: string, list?: string): HTMLInputElement =>
    h('input', { type: 'text', value: draft[key], placeholder, list, autocomplete: 'off', oninput: (e: Event) => { draft[key] = (e.target as HTMLInputElement).value; } });

  const teamChips = (key: 'teamA' | 'teamB' | 'scorekeeper', target: () => HTMLInputElement): HTMLElement | null =>
    t.teams.length === 0 || t.teams.length > 16 ? null : h('div', { class: 'chips chips--small' }, t.teams.map((name) =>
      h('button', { type: 'button', class: 'chip', onclick: () => { draft[key] = name; target().value = name; } }, name)));

  const teamA = input('teamA', 'Équipe A', listId);
  const teamB = input('teamB', 'Équipe B', listId);
  const keeper = input('scorekeeper', 'Équipe à la table', listId);

  const form = h('form', { class: 'form', novalidate: true },
    h('div', { class: 'grid-2' },
      h('div', { class: 'field' }, h('label', { for: 'gf-a' }, 'Équipe A'), Object.assign(teamA, { id: 'gf-a' }), teamChips('teamA', () => teamA)),
      h('div', { class: 'field' }, h('label', { for: 'gf-b' }, 'Équipe B'), Object.assign(teamB, { id: 'gf-b' }), teamChips('teamB', () => teamB)),
    ),
    h('div', { class: 'field' }, h('label', { for: 'gf-k' }, 'Table de marque'), Object.assign(keeper, { id: 'gf-k' }), teamChips('scorekeeper', () => keeper),
      h('small', { class: 'hint' }, 'L’équipe qui tient la feuille de match (souvent une équipe qui ne joue pas).')),
    h('div', { class: 'grid-3' },
      field('Intitulé', input('label', 'Ex. Poule A, Finale')),
      field('Terrain', input('field', 'Ex. 2')),
      field('Heure', h('input', { type: 'time', value: draft.time, oninput: (e: Event) => { draft.time = (e.target as HTMLInputElement).value; } })),
    ),
    rulesDetails(draft.rules, !!existing),
    error,
    h('datalist', { id: listId }, t.teams.map((v) => h('option', { value: v }))),
    h('div', { class: 'modal__actions' }, h('button', { class: 'btn btn--primary btn--block', type: 'submit' }, existing ? 'Enregistrer' : 'Créer le match')),
  );
  const modal = openModal(existing ? 'Modifier le match' : 'Nouveau match du tournoi', form, { wide: true });

  form.addEventListener('submit', (ev) => {
    ev.preventDefault();
    const failMsg = (msg: string): void => { error.textContent = msg; error.hidden = false; };
    const err = validateGame(draft);
    if (err) return failMsg(err);
    try {
      let gid = existing?.id ?? '';
      update((s) => {
        const tour = s.tournaments.find((x) => x.id === t.id);
        if (!tour) throw new Error('Tournoi introuvable.');
        // Les nouvelles équipes rejoignent la liste du tournoi.
        tour.teams = cleanTeams([...tour.teams, draft.teamA, draft.teamB, draft.scorekeeper]);
        if (existing) {
          const g = tour.games.find((x) => x.id === existing.id);
          if (!g) throw new Error('Match introuvable.');
          Object.assign(g, {
            label: draft.label.trim(), field: draft.field.trim(), time: draft.time,
            teamA: draft.teamA.trim(), teamB: draft.teamB.trim(), scorekeeper: draft.scorekeeper.trim(), rules: { ...draft.rules },
          });
        } else {
          const g = newGame(draft);
          gid = g.id;
          tour.games.push(g);
        }
      });
      modal.close();
      if (existing) toast('Match mis à jour.', { kind: 'success' });
      else navigate(`/feuille/${t.id}/${gid}`);
    } catch (e) {
      failMsg(errorMessage(e));
    }
  });
}

/* ---------- Fiche d'un tournoi ---------- */

const STATUS_LABEL = { a_venir: 'À venir', en_cours: 'En cours', termine: 'Terminé' } as const;

function gameCard(t: Tournament, g: TournamentGame): HTMLElement {
  const s = sheetState(g);
  const meta = [g.label, g.time, g.field ? `Terrain ${g.field}` : '', g.scorekeeper ? `Table : ${g.scorekeeper}` : ''].filter(Boolean).join(' · ');
  const winA = g.status === 'termine' && s.scoreA > s.scoreB;
  const winB = g.status === 'termine' && s.scoreB > s.scoreA;
  return h('a', { class: `card game-card ${g.status === 'en_cours' ? 'is-live' : ''}`, href: `#/feuille/${t.id}/${g.id}` },
    h('div', { class: 'game-card__teams' },
      h('div', { class: `game-card__row ${winA ? 'is-win' : ''}` }, h('span', { class: 'game-card__name' }, g.teamA), h('b', { class: 'game-card__pts' }, s.scoreA)),
      h('div', { class: `game-card__row ${winB ? 'is-win' : ''}` }, h('span', { class: 'game-card__name' }, g.teamB), h('b', { class: 'game-card__pts' }, s.scoreB)),
    ),
    h('div', { class: 'game-card__foot' },
      meta ? h('span', { class: 'match-card__sub' }, meta) : h('span'),
      h('span', { class: `badge ${g.status === 'en_cours' ? 'badge--live' : g.status === 'termine' ? 'badge--ok' : ''}` },
        g.status === 'en_cours' ? `En cours · ${formatClock(s.elapsedMs)}` : STATUS_LABEL[g.status]),
    ),
  );
}

export function tournamentView(params: Record<string, string>): View {
  const st = getState();
  const t = st.tournaments.find((x) => x.id === params.id);
  if (!t) {
    return { el: h('div', { class: 'page' }, emptyState('Tournoi introuvable', 'Il a peut-être été supprimé.', h('a', { class: 'btn btn--primary', href: '#/tournois' }, 'Retour aux tournois'))) };
  }
  const order = { en_cours: 0, a_venir: 1, termine: 2 } as const;
  const games = [...t.games].sort((a, b) => order[a.status] - order[b.status] || (a.time || '99').localeCompare(b.time || '99') || a.createdAt - b.createdAt);
  const table = standings(t).filter((r) => r.played > 0);

  const remove = async (): Promise<void> => {
    const ok = await confirmDialog(`Supprimer le tournoi « ${t.name} » et ses ${t.games.length} feuille(s) de match ? C’est définitif.`, 'Supprimer', true);
    if (!ok) return;
    update((s) => { s.tournaments = s.tournaments.filter((x) => x.id !== t.id); });
    navigate('/tournois');
    toast('Tournoi supprimé.');
  };

  const el = h('div', { class: 'page' },
    h('header', { class: 'page-head' },
      h('a', { class: 'btn btn--ghost btn--icon', href: '#/tournois', 'aria-label': 'Retour aux tournois' }, icon('back')),
      h('div', { class: 'page-head__title' },
        h('h1', null, t.name),
        h('p', { class: 'muted' }, [formatDateFr(t.date), t.location].filter(Boolean).join(' · ')),
      ),
      h('button', { class: 'btn btn--ghost btn--icon', type: 'button', 'aria-label': 'Modifier le tournoi', onclick: () => openTournamentForm(t) }, icon('edit')),
    ),
    h('p', { class: 'hint' }, `Règles par défaut : ${rulesSummary(t.rules)}`),
    h('div', { class: 'inline-actions' },
      h('button', { class: 'btn btn--primary', type: 'button', onclick: () => openGameForm(t) }, icon('plus', 18), ' Nouveau match'),
      games.length
        ? h('button', { class: 'btn', type: 'button', onclick: async () => {
          try {
            const r = await sharePdf(tournamentPdf(t, games), pdfFileName('feuilles', t.name), `Feuilles de match · ${t.name}`);
            toast(r === 'shared' ? 'PDF du tournoi prêt.' : 'PDF du tournoi téléchargé.', { kind: 'success' });
          } catch (err) {
            toast(`PDF impossible : ${errorMessage(err)}`, { kind: 'error' });
          }
        } }, icon('pdf', 18), ' PDF de toutes les feuilles')
        : null),
    games.length === 0
      ? emptyState('Aucun match', 'Ajoute un match : les deux équipes, la table de marque, et c’est parti.')
      : h('div', { class: 'list' }, games.map((g) => gameCard(t, g))),
    table.length
      ? h('section', { class: 'stack' },
        h('h2', { class: 'section-title' }, 'Bilan des équipes'),
        h('div', { class: 'table-wrap' }, h('table', { class: 'table' },
          h('thead', null, h('tr', null, h('th', null, 'Équipe'), h('th', { class: 'num' }, 'J'), h('th', { class: 'num' }, 'V'), h('th', { class: 'num' }, 'D'), h('th', { class: 'num' }, 'N'), h('th', { class: 'num' }, 'Pts +'), h('th', { class: 'num' }, 'Pts −'), h('th', { class: 'num' }, 'Diff'))),
          h('tbody', null, table.map((r) => {
            const diff = r.pointsFor - r.pointsAgainst;
            return h('tr', null, h('td', null, r.team), h('td', { class: 'num' }, r.played), h('td', { class: 'num' }, r.won), h('td', { class: 'num' }, r.lost), h('td', { class: 'num' }, r.drawn),
              h('td', { class: 'num' }, r.pointsFor), h('td', { class: 'num' }, r.pointsAgainst), h('td', { class: `num ${diff > 0 ? 'pos' : diff < 0 ? 'neg' : ''}` }, diff > 0 ? `+${diff}` : diff));
          })),
        )),
        h('p', { class: 'hint' }, 'Sur les matchs terminés uniquement.'))
      : null,
    h('div', { class: 'stack stack--end' }, h('button', { class: 'btn btn--danger-ghost btn--block', type: 'button', onclick: () => void remove() }, 'Supprimer le tournoi')),
  );
  return { el };
}
