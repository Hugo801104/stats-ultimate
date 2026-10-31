import { generateDemo } from '../../demo';
import { backupJson, parseBackup, pointsCsv, statsCsv } from '../../exporters';
import { computePlayerStats } from '../../stats';
import { parseParticipants, type ImportedParticipant } from '../../sportEasy';
import { getSaveError, getState, replaceState, resetAll, update } from '../../store';
import { MAX_LINE_SIZE } from '../../types';
import { normalizeName, uid } from '../../util';
import { confirmDialog, errorMessage, field, openModal, pageHeader, toast } from '../components';
import { h } from '../dom';
import { downloadText, fileStamp, readFileText } from '../files';
import { canPromptInstall, isIOS, isStandalone, promptInstall } from '../install';
import { requestRender, type View } from '../router';
import { accountSection } from './account';
import { KEY_PREFIX } from '../../legacyKeys';
import { legalLinks } from './legal';
import { getSession } from '../../cloud/session';

const BACKUP_KEY = `${KEY_PREFIX}last-backup`;

function lastBackup(): number | null {
  try {
    const v = Number(localStorage.getItem(BACKUP_KEY));
    return Number.isFinite(v) && v > 0 ? v : null;
  } catch {
    return null;
  }
}
function markBackup(): void {
  try {
    localStorage.setItem(BACKUP_KEY, String(Date.now()));
  } catch {
    /* sans importance */
  }
}

const dateFmt = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long', timeStyle: 'short' });

export function settingsView(): View {
  const st = getState();
  const saveError = getSaveError();
  const backupAt = lastBackup();
  const hasData = st.matches.length > 0 || st.players.length > 0;
  const lastActivity = Math.max(0, ...st.matches.map((m) => m.createdAt));

  const section = (title: string, ...children: (HTMLElement | null)[]): HTMLElement => h('section', { class: 'card settings-block' }, h('h2', null, title), children);

  /* Équipe */
  const teamName = h('input', { type: 'text', value: st.settings.teamName, maxlength: 40, onchange: (e: Event) => {
    const v = (e.target as HTMLInputElement).value.trim();
    if (v) update((s) => { s.settings.teamName = v; }); else toast('Le nom de l’équipe ne peut pas être vide.', { kind: 'error' });
  } });
  const lineSize = h('input', { type: 'number', min: 1, max: MAX_LINE_SIZE, inputmode: 'numeric', value: st.settings.lineSize, onchange: (e: Event) => {
    const v = Math.round(Number((e.target as HTMLInputElement).value));
    if (v >= 1 && v <= MAX_LINE_SIZE) update((s) => { s.settings.lineSize = v; }); else toast(`Entre 1 et ${MAX_LINE_SIZE} joueurs.`, { kind: 'error' });
  } });

  /* Saisons */
  const seasonList = h('ul', { class: 'plain-list' }, st.seasons.map((s) => {
    const n = st.matches.filter((m) => m.seasonId === s.id).length;
    const current = s.id === st.settings.currentSeasonId;
    return h('li', null,
      h('span', null, h('b', null, s.name), ` · ${n} rencontre${n > 1 ? 's' : ''}`, current ? h('span', { class: 'badge badge--ok' }, 'Saison courante') : null),
      h('span', { class: 'inline-actions' },
        current ? null : h('button', { class: 'btn btn--small', type: 'button', onclick: () => update((x) => { x.settings.currentSeasonId = s.id; }) }, 'Choisir'),
        h('button', { class: 'btn btn--small', type: 'button', onclick: () => renameSeason(s.id) }, 'Renommer'),
        n === 0 && st.seasons.length > 1 && !current ? h('button', { class: 'btn btn--small btn--danger-ghost', type: 'button', onclick: () => update((x) => { x.seasons = x.seasons.filter((y) => y.id !== s.id); }) }, 'Supprimer') : null));
  }));

  /* Terrain / météo */
  const w = st.settings.weather;
  const wForm = { placeName: w.placeName, latitude: String(w.latitude), longitude: String(w.longitude), startHour: String(w.startHour), endHour: String(w.endHour) };
  const wError = h('p', { class: 'form-error', role: 'alert', hidden: true });
  const bind = (k: keyof typeof wForm) => (e: Event): void => { wForm[k] = (e.target as HTMLInputElement).value; };
  const wFormEl = h('form', { class: 'form', novalidate: true, onsubmit: (ev: Event) => {
    ev.preventDefault();
    const lat = Number(wForm.latitude.replace(',', '.'));
    const lon = Number(wForm.longitude.replace(',', '.'));
    const sh = Math.round(Number(wForm.startHour));
    const eh = Math.round(Number(wForm.endHour));
    const fail = (m: string): void => { wError.textContent = m; wError.hidden = false; };
    if (!Number.isFinite(lat) || lat < -90 || lat > 90) return fail('Latitude invalide (entre -90 et 90).');
    if (!Number.isFinite(lon) || lon < -180 || lon > 180) return fail('Longitude invalide (entre -180 et 180).');
    if (!(sh >= 0 && sh <= 23) || !(eh >= 1 && eh <= 24) || eh <= sh) return fail('Créneau invalide : l’heure de fin doit être après l’heure de début.');
    update((s) => { Object.assign(s.settings.weather, { placeName: wForm.placeName.trim() || 'Terrain', latitude: lat, longitude: lon, startHour: sh, endHour: eh }); });
    toast('Terrain enregistré.', { kind: 'success' });
  } },
    field('Nom du terrain', h('input', { type: 'text', value: wForm.placeName, oninput: bind('placeName') })),
    h('div', { class: 'grid-2' },
      field('Latitude', h('input', { type: 'text', inputmode: 'decimal', value: wForm.latitude, oninput: bind('latitude') })),
      field('Longitude', h('input', { type: 'text', inputmode: 'decimal', value: wForm.longitude, oninput: bind('longitude') }))),
    h('div', { class: 'grid-2' },
      field('Début du créneau (h)', h('input', { type: 'number', min: 0, max: 23, value: wForm.startHour, oninput: bind('startHour') })),
      field('Fin du créneau (h)', h('input', { type: 'number', min: 1, max: 24, value: wForm.endHour, oninput: bind('endHour') }))),
    wError,
    h('button', { class: 'btn btn--primary', type: 'submit' }, 'Enregistrer le terrain'));

  /* Imports */
  const backupInput = h('input', { type: 'file', accept: '.json,application/json', class: 'visually-hidden', id: 'import-backup', onchange: async (e: Event) => {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (file) await importBackup(file);
  } });
  const seInput = h('input', { type: 'file', accept: '.csv,text/csv,text/plain', class: 'visually-hidden', id: 'import-se', onchange: async (e: Event) => {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (file) await importSportEasy(file);
  } });

  const installBlock: HTMLElement | null = isStandalone()
    ? h('p', { class: 'muted' }, '✓ L’appli est installée sur cet appareil.')
    : canPromptInstall()
      ? h('button', { class: 'btn btn--primary', type: 'button', onclick: async () => { await promptInstall(); requestRender(); } }, 'Installer l’appli')
      : h('p', { class: 'muted' }, isIOS()
        ? 'Sur iPhone : bouton Partager de Safari, puis « Sur l’écran d’accueil ».'
        : 'Sur Android (Chrome) : menu ⋮ puis « Installer l’application ». Sur ordinateur : icône d’installation dans la barre d’adresse.');

  const inCloud = getSession().status === 'signed_in';
  const stale = !inCloud && hasData && (backupAt === null || (lastActivity > backupAt && Date.now() - backupAt > 7 * 86_400_000));

  const el = h('div', { class: 'page' },
    pageHeader('Réglages'),
    saveError ? h('p', { class: 'form-error', role: 'alert' }, saveError) : null,
    accountSection(),
    section('Équipe', field('Nom de l’équipe', teamName), field('Joueurs par ligne', lineSize, 'Nombre de joueurs attendu sur le terrain (7 en ultimate classique).')),
    section('Saisons', seasonList, h('button', { class: 'btn', type: 'button', onclick: newSeason }, 'Nouvelle saison')),
    section('Terrain et créneau d’entraînement', wFormEl),
    section('Sauvegarde et partage',
      h('p', { class: stale ? 'form-error' : 'muted' }, inCloud ? 'Tes données sont aussi enregistrées dans ton espace en ligne. Le fichier de sauvegarde reste utile pour garder une copie ou les transférer.' : backupAt ? `Dernière sauvegarde : ${dateFmt.format(new Date(backupAt))}.${stale ? ' Pense à en refaire une.' : ''}` : hasData ? 'Aucune sauvegarde faite sur cet appareil. Les données ne sont stockées que dans ce navigateur : exporte-les régulièrement.' : 'Les données sont stockées dans ce navigateur, sans serveur.'),
      h('div', { class: 'stack' },
        h('button', { class: 'btn btn--primary', type: 'button', onclick: () => {
          downloadText(`stats-ultimate-sauvegarde-${fileStamp()}.json`, backupJson(getState()), 'application/json');
          markBackup();
          toast('Sauvegarde téléchargée.', { kind: 'success' });
          requestRender();
        } }, 'Télécharger la sauvegarde complète (JSON)'),
        h('label', { class: 'btn', for: 'import-backup' }, 'Restaurer une sauvegarde…'), backupInput,
        h('button', { class: 'btn', type: 'button', onclick: () => downloadText(`stats-joueurs-${fileStamp()}.csv`, statsCsv(st.players, computePlayerStats(st.matches)), 'text/csv') }, 'Export CSV : stats par joueur (toutes saisons)'),
        h('button', { class: 'btn', type: 'button', onclick: () => downloadText(`points-${fileStamp()}.csv`, pointsCsv(getState()), 'text/csv') }, 'Export CSV : tous les points')),
      h('p', { class: 'hint' }, 'Pour partager avec le groupe : envoie le fichier de sauvegarde, ou utilise « Résumé à partager » dans le détail d’un match.')),
    section('Import Sport Easy',
      h('p', { class: 'muted' }, 'Ajoute à l’effectif les noms d’un export de participants (CSV avec colonnes Prénom / Nom ou Nom complet). Format détecté automatiquement ; tu vérifies avant d’importer.'),
      h('label', { class: 'btn', for: 'import-se' }, 'Choisir un fichier CSV…'), seInput),
    section('Installation', installBlock),
    section('Données',
      h('div', { class: 'stack' },
        h('button', { class: 'btn', type: 'button', onclick: () => void loadDemo() }, 'Charger des données d’exemple'),
        h('button', { class: 'btn btn--danger-ghost', type: 'button', onclick: () => void wipe() }, 'Tout effacer'))),
    section('Informations légales', legalLinks()),
    h('p', { class: 'hint center' }, 'Stats Ultimate — version 0.2.0'),
  );
  return { el };
}

function renameSeason(id: string): void {
  const st = getState();
  const season = st.seasons.find((s) => s.id === id);
  if (!season) return;
  openNameDialog('Renommer la saison', season.name, (name) => {
    update((s) => { const x = s.seasons.find((y) => y.id === id); if (x) x.name = name; });
  });
}

function newSeason(): void {
  openNameDialog('Nouvelle saison', '', (name) => {
    const id = uid();
    update((s) => { s.seasons.push({ id, name }); s.settings.currentSeasonId = id; });
    toast(`Saison ${name} créée et sélectionnée.`, { kind: 'success' });
  }, 'ex. 2027-2028');
}

function openNameDialog(title: string, initial: string, onOk: (name: string) => void, placeholder = ''): void {
  let value = initial;
  const error = h('p', { class: 'form-error', role: 'alert', hidden: true });
  const input = h('input', { type: 'text', value: initial, maxlength: 30, placeholder, oninput: (e: Event) => { value = (e.target as HTMLInputElement).value; } });
  const form = h('form', { class: 'form' }, field('Nom', input), error, h('div', { class: 'modal__actions' }, h('button', { class: 'btn btn--primary', type: 'submit' }, 'Enregistrer')));
  const modal = openModal(title, form);
  form.addEventListener('submit', (ev) => {
    ev.preventDefault();
    const name = value.trim();
    const dup = getState().seasons.some((s) => normalizeName(s.name) === normalizeName(name) && s.name !== initial);
    if (!name) { error.textContent = 'Le nom est obligatoire.'; error.hidden = false; return; }
    if (dup) { error.textContent = 'Une saison porte déjà ce nom.'; error.hidden = false; return; }
    onOk(name);
    modal.close();
  });
}

async function importBackup(file: File): Promise<void> {
  try {
    const { state, warnings } = parseBackup(await readFileText(file));
    const ok = await confirmDialog(
      `Remplacer toutes les données de cet appareil par la sauvegarde (${state.players.length} joueurs, ${state.matches.length} rencontres, ${state.seasons.length} saisons) ? Pense à télécharger une sauvegarde de l’état actuel avant.${warnings.length ? ` Remarques : ${warnings.join(' ')}` : ''}`,
      'Remplacer',
      true,
    );
    if (!ok) return;
    replaceState(state);
    toast('Sauvegarde restaurée.', { kind: 'success' });
  } catch (err) {
    toast(errorMessage(err), { kind: 'error' });
  }
}

async function importSportEasy(file: File): Promise<void> {
  let text: string;
  try {
    text = await readFileText(file);
  } catch (err) {
    toast(errorMessage(err), { kind: 'error' });
    return;
  }
  const { participants, warnings } = parseParticipants(text);
  if (participants.length === 0) {
    toast(warnings[0] ?? 'Aucun participant trouvé.', { kind: 'error', durationMs: 7000 });
    return;
  }
  const existing = new Set(getState().players.map((p) => normalizeName(p.name)));
  const rows = participants.map((p: ImportedParticipant) => ({ p, known: existing.has(normalizeName(p.name)), checked: !existing.has(normalizeName(p.name)) && p.present !== false }));

  const list = h('div', { class: 'chips chips--col' });
  const counter = h('p', { class: 'hint' });
  const refresh = (): void => {
    const n = rows.filter((r) => r.checked).length;
    counter.textContent = `${n} joueur${n > 1 ? 's' : ''} à ajouter à l’effectif.`;
  };
  list.append(...rows.map((r) => h('label', { class: `check ${r.known ? 'is-muted' : ''}` },
    h('input', { type: 'checkbox', checked: r.checked, disabled: r.known, onchange: (e: Event) => { r.checked = (e.target as HTMLInputElement).checked; refresh(); } }),
    ` ${r.p.name}`,
    r.known ? ' (déjà dans l’effectif)' : r.p.present === true ? ' · présent' : r.p.present === false ? ' · absent' : '')));
  refresh();

  const form = h('form', { class: 'form' },
    warnings.length ? h('p', { class: 'hint' }, warnings.join(' ')) : null,
    list, counter,
    h('div', { class: 'modal__actions' }, h('button', { class: 'btn btn--primary', type: 'submit' }, 'Ajouter à l’effectif')));
  const modal = openModal('Import Sport Easy', form);
  form.addEventListener('submit', (ev) => {
    ev.preventDefault();
    const names = rows.filter((r) => r.checked).map((r) => r.p.name);
    if (names.length === 0) { modal.close(); return; }
    update((s) => { for (const name of names) s.players.push({ id: uid(), name, number: null, position: 'polyvalent', active: true }); });
    modal.close();
    toast(`${names.length} joueur${names.length > 1 ? 's' : ''} ajouté${names.length > 1 ? 's' : ''}. Complète les numéros et postes dans l’effectif.`, { kind: 'success', durationMs: 6000 });
  });
}

async function loadDemo(): Promise<void> {
  const st = getState();
  const hasData = st.players.length > 0 || st.matches.length > 0;
  const ok = await confirmDialog(hasData ? 'Les données d’exemple REMPLACENT les données actuelles de cet appareil. Continuer ?' : 'Charger 14 joueurs fictifs et 8 rencontres d’exemple ?', 'Charger', hasData);
  if (!ok) return;
  replaceState(generateDemo());
  toast('Données d’exemple chargées.', { kind: 'success' });
}

async function wipe(): Promise<void> {
  const ok = await confirmDialog('Effacer TOUTES les données de cet appareil (joueurs, matchs, réglages) ? Cette action est définitive : télécharge d’abord une sauvegarde.', 'Tout effacer', true);
  if (!ok) return;
  resetAll();
  toast('Données effacées.');
}
