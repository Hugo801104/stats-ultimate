import { describe, expect, it } from 'vitest';
import { KEY_PREFIX, migrateLegacyKeys } from './legacyKeys';

function memoryStorage(init: Record<string, string>): Storage {
  const m = new Map(Object.entries(init));
  return {
    get length() { return m.size; },
    key: (i: number) => [...m.keys()][i] ?? null,
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => { m.set(k, v); },
    removeItem: (k: string) => { m.delete(k); },
    clear: () => m.clear(),
  };
}

describe('migration des anciennes clés de stockage', () => {
  const old = ['stats-ultimate', 'plouf:'].join('-');
  it('déplace les données et la session vers les nouvelles clés, une seule fois', () => {
    const s = memoryStorage({ [`${old}state`]: '{"players":[1]}', [`${old}auth`]: 'jeton', autre: 'x' });
    expect(migrateLegacyKeys(s)).toBe(2);
    expect(s.getItem(`${KEY_PREFIX}state`)).toBe('{"players":[1]}');
    expect(s.getItem(`${KEY_PREFIX}auth`)).toBe('jeton');
    expect(s.getItem(`${old}state`)).toBeNull();
    expect(s.getItem('autre')).toBe('x');
    expect(migrateLegacyKeys(s)).toBe(0);
  });
  it('n’écrase jamais une donnée déjà présente sous la nouvelle clé', () => {
    const s = memoryStorage({ [`${old}state`]: 'ancien', [`${KEY_PREFIX}state`]: 'récent' });
    migrateLegacyKeys(s);
    expect(s.getItem(`${KEY_PREFIX}state`)).toBe('récent');
  });
});
