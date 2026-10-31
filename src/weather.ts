import { KEY_PREFIX } from './legacyKeys';
// Prévision pour l'entraînement via Open-Meteo (gratuit, sans clé, position en paramètre).

import type { WeatherSettings } from './types';

export interface HourlySlot {
  /** Heure locale « AAAA-MM-JJTHH:00 ». */
  time: string;
  temperature: number | null;
  precipitation: number;
  precipitationProbability: number | null;
  wind: number;
  gust: number;
}

export type Verdict = 'jouable' | 'limite' | 'non_jouable';

export interface Thresholds {
  windLimitKmh: number;
  rainLimitMm: number;
}

export interface Assessment {
  verdict: Verdict;
  maxWind: number;
  maxGust: number;
  rain: number;
  maxRainProbability: number | null;
  reasons: string[];
  hours: number;
}

/** Rafales : tolérance de 40 % au-dessus du seuil de vent avant « non jouable ». */
export const GUST_FACTOR = 1.4;
/** « Limite » dès 75 % du seuil de vent. */
export const WIND_WARN_RATIO = 0.75;
export const RAIN_WARN_MM = 0.2;
export const RAIN_WARN_PROBABILITY = 50;

export function assessSlots(slots: HourlySlot[], th: Thresholds): Assessment | null {
  if (slots.length === 0) return null;
  const maxWind = Math.max(...slots.map((s) => s.wind));
  const maxGust = Math.max(...slots.map((s) => s.gust));
  const rain = Math.round(slots.reduce((a, s) => a + s.precipitation, 0) * 10) / 10;
  const probs = slots.map((s) => s.precipitationProbability).filter((p): p is number => p !== null);
  const maxRainProbability = probs.length ? Math.max(...probs) : null;

  const blocking: string[] = [];
  const warning: string[] = [];
  if (maxWind > th.windLimitKmh) blocking.push(`vent ${Math.round(maxWind)} km/h (seuil ${th.windLimitKmh})`);
  else if (maxWind > th.windLimitKmh * WIND_WARN_RATIO) warning.push(`vent soutenu ${Math.round(maxWind)} km/h`);
  if (maxGust > th.windLimitKmh * GUST_FACTOR) blocking.push(`rafales ${Math.round(maxGust)} km/h`);
  else if (maxGust > th.windLimitKmh && maxWind <= th.windLimitKmh) warning.push(`rafales ${Math.round(maxGust)} km/h`);
  if (rain >= th.rainLimitMm && rain > 0) blocking.push(`pluie ${rain} mm`);
  else if (rain >= RAIN_WARN_MM) warning.push(`pluie ${rain} mm`);
  else if (maxRainProbability !== null && maxRainProbability >= RAIN_WARN_PROBABILITY) {
    warning.push(`risque de pluie ${maxRainProbability} %`);
  }

  const verdict: Verdict = blocking.length ? 'non_jouable' : warning.length ? 'limite' : 'jouable';
  return {
    verdict,
    maxWind,
    maxGust,
    rain,
    maxRainProbability,
    reasons: blocking.length ? blocking : warning,
    hours: slots.length,
  };
}

export interface DayAssessment {
  date: string;
  slots: HourlySlot[];
  assessment: Assessment | null;
}

/** Évalue chaque jour sur le créneau [startHour, endHour[ (heure locale). */
export function dailyAssessments(
  slots: HourlySlot[],
  startHour: number,
  endHour: number,
  th: Thresholds,
): DayAssessment[] {
  const byDay = new Map<string, HourlySlot[]>();
  for (const s of slots) {
    const date = s.time.slice(0, 10);
    const hour = Number(s.time.slice(11, 13));
    if (hour < startHour || hour >= endHour) continue;
    const list = byDay.get(date) ?? [];
    list.push(s);
    byDay.set(date, list);
  }
  const days = [...new Set(slots.map((s) => s.time.slice(0, 10)))].sort();
  return days.map((date) => {
    const daySlots = byDay.get(date) ?? [];
    return { date, slots: daySlots, assessment: assessSlots(daySlots, th) };
  });
}

interface OpenMeteoResponse {
  hourly?: {
    time?: string[];
    temperature_2m?: (number | null)[];
    precipitation?: (number | null)[];
    precipitation_probability?: (number | null)[];
    wind_speed_10m?: (number | null)[];
    wind_gusts_10m?: (number | null)[];
  };
}

export function buildForecastUrl(w: Pick<WeatherSettings, 'latitude' | 'longitude'>): string {
  const q = new URLSearchParams({
    latitude: w.latitude.toFixed(4),
    longitude: w.longitude.toFixed(4),
    hourly: 'temperature_2m,precipitation,precipitation_probability,wind_speed_10m,wind_gusts_10m',
    wind_speed_unit: 'kmh',
    timezone: 'Europe/Paris',
    forecast_days: '7',
  });
  return `https://api.open-meteo.com/v1/forecast?${q.toString()}`;
}

export function parseForecast(json: unknown): HourlySlot[] {
  const hourly = (json as OpenMeteoResponse | null)?.hourly;
  const time = hourly?.time;
  if (!hourly || !Array.isArray(time)) throw new Error('Réponse météo inattendue.');
  const slots: HourlySlot[] = [];
  time.forEach((t, i) => {
    const wind = hourly.wind_speed_10m?.[i];
    const gust = hourly.wind_gusts_10m?.[i];
    if (typeof t !== 'string' || typeof wind !== 'number') return;
    slots.push({
      time: t,
      temperature: hourly.temperature_2m?.[i] ?? null,
      precipitation: hourly.precipitation?.[i] ?? 0,
      precipitationProbability: hourly.precipitation_probability?.[i] ?? null,
      wind,
      gust: typeof gust === 'number' ? gust : wind,
    });
  });
  if (slots.length === 0) throw new Error('Aucune donnée météo reçue.');
  return slots;
}

export async function fetchForecast(w: WeatherSettings, signal?: AbortSignal): Promise<HourlySlot[]> {
  const res = await fetch(buildForecastUrl(w), { signal });
  if (!res.ok) throw new Error(`Service météo indisponible (${res.status}).`);
  return parseForecast(await res.json());
}

const CACHE_KEY = `${KEY_PREFIX}forecast`;
export interface CachedForecast {
  fetchedAt: number;
  latitude: number;
  longitude: number;
  slots: HourlySlot[];
}

export function loadCachedForecast(w: WeatherSettings): CachedForecast | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const c = JSON.parse(raw) as CachedForecast;
    if (c.latitude !== w.latitude || c.longitude !== w.longitude || !Array.isArray(c.slots)) return null;
    return c;
  } catch {
    return null;
  }
}

export function saveCachedForecast(w: WeatherSettings, slots: HourlySlot[]): void {
  try {
    const c: CachedForecast = { fetchedAt: Date.now(), latitude: w.latitude, longitude: w.longitude, slots };
    localStorage.setItem(CACHE_KEY, JSON.stringify(c));
  } catch {
    /* cache facultatif */
  }
}
