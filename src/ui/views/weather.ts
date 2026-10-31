// Prévision pour l'entraînement : jouable / limite / non jouable, avec seuil de vent réglable.

import { getState, update } from '../../store';
import { dailyAssessments, fetchForecast, loadCachedForecast, saveCachedForecast, type Assessment, type DayAssessment, type HourlySlot, type Verdict } from '../../weather';
import { parseISO } from '../../util';
import { errorMessage, pageHeader } from '../components';
import { h } from '../dom';
import { requestRender, type View } from '../router';

const STALE_MS = 30 * 60 * 1000;

const net: {
  key: string;
  slots: HourlySlot[] | null;
  fetchedAt: number | null;
  status: 'idle' | 'loading' | 'error';
  error: string | null;
  attempted: boolean;
} = { key: '', slots: null, fetchedAt: null, status: 'idle', error: null, attempted: false };

const VERDICT_LABEL: Record<Verdict, string> = { jouable: 'Jouable', limite: 'Limite', non_jouable: 'Non jouable' };
const VERDICT_ICON: Record<Verdict, string> = { jouable: '✓', limite: '!', non_jouable: '✕' };

function load(force: boolean): void {
  const w = getState().settings.weather;
  const key = `${w.latitude},${w.longitude}`;
  if (net.key !== key) {
    const cached = loadCachedForecast(w);
    Object.assign(net, { key, slots: cached?.slots ?? null, fetchedAt: cached?.fetchedAt ?? null, status: 'idle', error: null, attempted: false });
  }
  if (net.status === 'loading') return;
  const stale = net.fetchedAt === null || Date.now() - net.fetchedAt > STALE_MS;
  if (!force && (net.attempted || !stale)) return;
  net.attempted = true;
  net.status = 'loading';
  net.error = null;
  fetchForecast(w).then(
    (slots) => {
      net.slots = slots;
      net.fetchedAt = Date.now();
      net.status = 'idle';
      saveCachedForecast(w, slots);
      requestRender();
    },
    (err: unknown) => {
      net.status = 'error';
      net.error = navigator.onLine === false ? 'Pas de réseau.' : errorMessage(err);
      requestRender();
    },
  );
}

const dayFmt = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
const timeFmt = new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'short' });

function dayLabel(date: string): string {
  const d = parseISO(date);
  const today = new Date();
  const diff = Math.round((new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() - new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime()) / 86_400_000);
  const raw = dayFmt.format(d);
  const base = raw.charAt(0).toUpperCase() + raw.slice(1);
  return diff === 0 ? `Aujourd’hui · ${base}` : diff === 1 ? `Demain · ${base}` : base;
}

function figures(a: Assessment): HTMLElement {
  return h('dl', { class: 'figures' },
    h('div', null, h('dt', null, 'Vent'), h('dd', null, `${Math.round(a.maxWind)} km/h`)),
    h('div', null, h('dt', null, 'Rafales'), h('dd', null, `${Math.round(a.maxGust)} km/h`)),
    h('div', null, h('dt', null, 'Pluie'), h('dd', null, `${a.rain} mm`)),
    h('div', null, h('dt', null, 'Risque'), h('dd', null, a.maxRainProbability === null ? '—' : `${a.maxRainProbability} %`)));
}

function dayCard(d: DayAssessment, startHour: number, endHour: number): HTMLElement {
  const today = new Date();
  const isToday = d.date === `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  const past = isToday && today.getHours() >= endHour;
  const a = d.assessment;
  if (!a || past) {
    return h('article', { class: 'card weather-day is-none' }, h('h3', null, dayLabel(d.date)), h('p', { class: 'muted' }, past ? 'Créneau passé.' : 'Pas de données sur ce créneau.'));
  }
  return h('article', { class: `card weather-day verdict-${a.verdict}` },
    h('div', { class: 'weather-day__head' },
      h('h3', null, dayLabel(d.date)),
      h('span', { class: `verdict verdict--${a.verdict}` }, h('span', { 'aria-hidden': 'true' }, VERDICT_ICON[a.verdict]), ` ${VERDICT_LABEL[a.verdict]}`)),
    h('p', { class: 'muted' }, `${String(startHour).padStart(2, '0')}h–${String(endHour).padStart(2, '0')}h${a.reasons.length ? ` · ${a.reasons.join(', ')}` : ' · conditions calmes'}`),
    figures(a),
    h('details', null, h('summary', null, 'Heure par heure'),
      h('table', { class: 'table table--tiny' },
        h('thead', null, h('tr', null, ['Heure', 'Temp.', 'Vent', 'Rafales', 'Pluie'].map((x, i) => h('th', { class: i ? 'num' : '' }, x)))),
        h('tbody', null, d.slots.map((s) => h('tr', null,
          h('td', null, `${s.time.slice(11, 13)}h`), h('td', { class: 'num' }, s.temperature === null ? '—' : `${Math.round(s.temperature)}°`),
          h('td', { class: 'num' }, Math.round(s.wind)), h('td', { class: 'num' }, Math.round(s.gust)), h('td', { class: 'num' }, `${s.precipitation} mm`)))))));
}

export function weatherView(): View {
  load(false);
  const st = getState();
  const w = st.settings.weather;
  const local = { windLimitKmh: w.windLimitKmh, rainLimitMm: w.rainLimitMm };

  const results = h('div', { class: 'weather-days' });
  const renderResults = (): void => {
    if (!net.slots) {
      results.replaceChildren(h('p', { class: 'muted' }, net.status === 'loading' ? 'Chargement de la prévision…' : 'Aucune prévision en mémoire. Connecte-toi puis touche « Actualiser ».'));
      return;
    }
    const days = dailyAssessments(net.slots, w.startHour, w.endHour, local);
    results.replaceChildren(...days.map((d) => dayCard(d, w.startHour, w.endHour)));
  };

  const windLabel = h('output', { class: 'slider__value' }, `${local.windLimitKmh} km/h`);
  const wind = h('input', {
    type: 'range', min: 10, max: 60, step: 1, value: local.windLimitKmh, 'aria-label': 'Seuil de vent en km/h',
    oninput: (e: Event) => { local.windLimitKmh = Number((e.target as HTMLInputElement).value); windLabel.textContent = `${local.windLimitKmh} km/h`; renderResults(); },
    onchange: () => update((s) => { s.settings.weather.windLimitKmh = local.windLimitKmh; }),
  });
  const rainLabel = h('output', { class: 'slider__value' }, `${local.rainLimitMm} mm`);
  const rain = h('input', {
    type: 'range', min: 0, max: 10, step: 0.5, value: local.rainLimitMm, 'aria-label': 'Seuil de pluie en millimètres',
    oninput: (e: Event) => { local.rainLimitMm = Number((e.target as HTMLInputElement).value); rainLabel.textContent = `${local.rainLimitMm} mm`; renderResults(); },
    onchange: () => update((s) => { s.settings.weather.rainLimitMm = local.rainLimitMm; }),
  });

  const status = net.status === 'loading'
    ? 'Mise à jour…'
    : net.fetchedAt ? `Mis à jour le ${timeFmt.format(new Date(net.fetchedAt))}` : 'Jamais mise à jour';

  const el = h('div', { class: 'page' },
    pageHeader('Météo entraînement', h('button', { class: 'btn', type: 'button', disabled: net.status === 'loading', onclick: () => { load(true); requestRender(); } }, 'Actualiser')),
    h('p', { class: 'muted' }, `${w.placeName} · créneau ${String(w.startHour).padStart(2, '0')}h–${String(w.endHour).padStart(2, '0')}h · ${status}`),
    net.status === 'error' ? h('p', { class: 'form-error', role: 'alert' }, `${net.error ?? 'Erreur réseau.'}${net.slots ? ' Dernière prévision enregistrée affichée.' : ''}`) : null,
    h('section', { class: 'card sliders' },
      h('div', { class: 'slider' }, h('label', null, 'Vent maximum acceptable'), windLabel, wind),
      h('div', { class: 'slider' }, h('label', null, 'Pluie maximale sur le créneau'), rainLabel, rain),
      h('p', { class: 'hint' }, 'Non jouable au-dessus du seuil de vent (rafales : seuil +40 %) ou du cumul de pluie ; « limite » dès 75 % du seuil de vent ou à partir de quelques gouttes. Terrain et créneau : dans les réglages.')),
    results,
    h('p', { class: 'hint' }, 'Données : Open-Meteo (service gratuit, sans clé).'),
  );
  renderResults();
  return { el };
}
