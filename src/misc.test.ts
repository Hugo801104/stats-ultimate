import { describe, expect, it } from 'vitest';
import { generateDemo } from './demo';
import { backupJson, buildMatchSummary, parseBackup, pointsCsv, statsCsv, summaryText, toCsv } from './exporters';
import { defaultState, normalizeState } from './schema';
import { parseParticipants } from './sportEasy';
import { computePlayerStats } from './stats';
import { assessSlots, dailyAssessments, parseForecast, type HourlySlot } from './weather';

const th = { windLimitKmh: 25, rainLimitMm: 1 };
const slot = (hour: number, o: Partial<HourlySlot> = {}, date = '2026-11-02'): HourlySlot => ({
  time: `${date}T${String(hour).padStart(2, '0')}:00`, temperature: 10, precipitation: 0,
  precipitationProbability: 0, wind: 10, gust: 15, ...o,
});

describe('météo : jouable ou non', () => {
  it('jouable par temps calme', () => {
    expect(assessSlots([slot(19), slot(20)], th)!.verdict).toBe('jouable');
  });
  it('non jouable au-dessus du seuil de vent réglable', () => {
    const slots = [slot(19, { wind: 27, gust: 30 }), slot(20)];
    expect(assessSlots(slots, th)!.verdict).toBe('non_jouable');
    expect(assessSlots(slots, { ...th, windLimitKmh: 35 })!.verdict).toBe('limite'); // 27 > 0,75×35
    expect(assessSlots(slots, { ...th, windLimitKmh: 45 })!.verdict).toBe('jouable');
  });
  it('rafales fortes => non jouable même si le vent soutenu est faible', () => {
    expect(assessSlots([slot(19, { wind: 15, gust: 40 })], th)!.verdict).toBe('non_jouable');
  });
  it('pluie : limite puis non jouable', () => {
    expect(assessSlots([slot(19, { precipitation: 0.4 })], th)!.verdict).toBe('limite');
    expect(assessSlots([slot(19, { precipitation: 0.6 }), slot(20, { precipitation: 0.6 })], th)!.verdict).toBe('non_jouable');
    expect(assessSlots([slot(19, { precipitationProbability: 80 })], th)!.verdict).toBe('limite');
  });
  it('pas de créneau => pas d’évaluation', () => {
    expect(assessSlots([], th)).toBeNull();
  });
  it('découpe par jour sur le créneau horaire', () => {
    const slots = [slot(12, { wind: 60 }), slot(19), slot(20), slot(21, { wind: 60 }), slot(19, { wind: 40 }, '2026-11-03')];
    const days = dailyAssessments(slots, 19, 21, th);
    expect(days.map((d) => d.date)).toEqual(['2026-11-02', '2026-11-03']);
    expect(days[0]!.assessment!.verdict).toBe('jouable');
    expect(days[1]!.assessment!.verdict).toBe('non_jouable');
  });
  it('lit la réponse Open-Meteo et refuse une réponse invalide', () => {
    const slots = parseForecast({
      hourly: {
        time: ['2026-11-02T19:00', '2026-11-02T20:00'],
        temperature_2m: [9, null], precipitation: [0, 0.2], precipitation_probability: [10, null],
        wind_speed_10m: [12.4, 14], wind_gusts_10m: [20, null],
      },
    });
    expect(slots).toHaveLength(2);
    expect(slots[1]).toMatchObject({ temperature: null, precipitationProbability: null, gust: 14 });
    expect(() => parseForecast({})).toThrow();
  });
});

describe('import Sport Easy', () => {
  it('prénom/nom + statut, séparateur « ; », guillemets, doublons', () => {
    const csv = '﻿Prénom;Nom;Statut\r\nLéa;Martin;Présent\r\n"Tom";"Le Gall";Absent\r\nLéa;Martin;Présent\r\nJade;Roy;\r\n';
    const r = parseParticipants(csv);
    expect(r.participants).toEqual([
      { name: 'Léa Martin', present: true },
      { name: 'Tom Le Gall', present: false },
      { name: 'Jade Roy', present: null },
    ]);
  });
  it('colonne nom complet, séparateur virgule, sans statut', () => {
    const r = parseParticipants('Nom complet,Email\nHugo Dupont,h@x.fr\n');
    expect(r.participants).toEqual([{ name: 'Hugo Dupont', present: null }]);
    expect(r.warnings.join(' ')).toMatch(/statut/);
  });
  it('signale un fichier sans colonne de nom', () => {
    const r = parseParticipants('A;B\n1;2\n');
    expect(r.participants).toHaveLength(0);
    expect(r.warnings[0]).toMatch(/Colonnes de nom/);
  });
});

describe('sauvegarde et exports', () => {
  const demo = generateDemo(new Date(2026, 9, 31));

  it('sauvegarde JSON → restauration identique', () => {
    const { state, warnings } = parseBackup(backupJson(demo));
    expect(warnings).toEqual([]);
    expect(state.matches).toEqual(demo.matches);
    expect(state.players).toEqual(demo.players);
  });

  it('accepte un état brut, refuse du texte invalide', () => {
    expect(parseBackup(JSON.stringify(demo)).state.players).toHaveLength(demo.players.length);
    expect(() => parseBackup('pas du json')).toThrow(/JSON/);
    expect(() => parseBackup('42')).toThrow();
  });

  it('nettoie les données corrompues sans planter', () => {
    const { state, warnings } = normalizeState({
      players: [{ name: 'Léa', number: 'x' }, { name: '' }, 3],
      seasons: [],
      matches: [{ seasonId: 'inconnue', date: 'hier', points: [{ lineup: ['a'], result: 'bizarre', events: [{ type: 'nope', playerId: 'a' }] }] }],
      settings: { lineSize: 99, weather: { latitude: 500 } },
    });
    expect(state.players).toHaveLength(1);
    expect(state.players[0]!.number).toBeNull();
    expect(state.seasons).toHaveLength(1);
    expect(state.matches[0]!.points[0]).toMatchObject({ result: null, events: [] });
    expect(state.matches[0]!.seasonId).toBe(state.seasons[0]!.id);
    expect(state.settings.lineSize).toBe(14);
    expect(state.settings.weather.latitude).toBe(46.99);
    expect(warnings.length).toBeGreaterThan(0);
  });

  it('CSV : échappement et BOM', () => {
    const csv = toCsv([['a;b', 'c"d', 1, null]]);
    expect(csv.startsWith('﻿')).toBe(true);
    expect(csv).toContain('"a;b";"c""d";1;');
  });

  it('CSV des stats et des points', () => {
    const stats = computePlayerStats(demo.matches);
    const lines = statsCsv(demo.players, stats).trim().split('\r\n');
    expect(lines).toHaveLength(demo.players.length + 1);
    expect(lines[0]).toContain('Plus-minus');
    const nPoints = demo.matches.reduce((a, m) => a + m.points.length, 0);
    expect(pointsCsv(demo).trim().split('\r\n')).toHaveLength(nPoints + 1);
  });

  it('résumé de match partageable', () => {
    const m = demo.matches[0]!;
    const s = buildMatchSummary(m, demo.players, 'Les Albatros', demo.seasons[0]);
    expect(s.pour).toBeGreaterThanOrEqual(0);
    const text = summaryText(s);
    expect(text).toContain('🥏 Les Albatros');
    expect(text).toContain('Disques perdus');
  });

  it('état par défaut cohérent', () => {
    const d = defaultState(new Date(2026, 9, 31));
    expect(d.seasons[0]!.name).toBe('2026-2027');
    expect(d.settings.currentSeasonId).toBe(d.seasons[0]!.id);
  });
});
