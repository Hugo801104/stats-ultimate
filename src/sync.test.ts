import { describe, expect, it } from 'vitest';
import { decideSync, type RemoteRow } from './cloud/sync';

const remote = (revision: number): RemoteRow => ({ revision, data: {}, updated_at: '2026-10-31T20:00:00Z' });

describe('synchronisation : que faire ?', () => {
  it('cloud vide : on envoie seulement s’il y a des données locales', () => {
    expect(decideSync({ revision: null, dirty: true }, null, true)).toBe('push');
    expect(decideSync({ revision: null, dirty: false }, null, false)).toBe('nothing');
  });
  it('même révision : on envoie les modifications en attente', () => {
    expect(decideSync({ revision: 4, dirty: true }, remote(4), true)).toBe('push');
    expect(decideSync({ revision: 4, dirty: false }, remote(4), true)).toBe('nothing');
    // Tout effacé volontairement sur cet appareil : l'effacement part aussi dans le cloud.
    expect(decideSync({ revision: 4, dirty: true }, remote(4), false)).toBe('push');
  });
  it('le cloud a avancé et rien n’a changé ici : on récupère', () => {
    expect(decideSync({ revision: 4, dirty: false }, remote(6), true)).toBe('pull');
  });
  it('nouvel appareil sans données : on récupère le cloud', () => {
    expect(decideSync({ revision: null, dirty: false }, remote(3), false)).toBe('pull');
  });
  it('modifié des deux côtés : conflit, on demande', () => {
    expect(decideSync({ revision: 4, dirty: true }, remote(5), true)).toBe('conflict');
    // Données saisies sans compte, puis connexion à un compte qui a déjà des données.
    expect(decideSync({ revision: null, dirty: true }, remote(2), true)).toBe('conflict');
  });
});
