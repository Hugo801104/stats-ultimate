// Renomme une seule fois les anciennes clés de stockage local (préfixe d'avant le changement de nom)
// vers le préfixe actuel, pour que personne ne perde ses données ni sa session.
// Importé en tout premier par store.ts et cloud/client.ts : s'exécute avant toute lecture.

export const KEY_PREFIX = 'stats-ultimate:';
const OLD_PREFIX = ['stats-ultimate', 'plouf:'].join('-');

export function migrateLegacyKeys(storage: Storage | undefined = globalThis.localStorage): number {
  if (!storage) return 0;
  let moved = 0;
  try {
    const old: string[] = [];
    for (let i = 0; i < storage.length; i++) {
      const k = storage.key(i);
      if (k?.startsWith(OLD_PREFIX)) old.push(k);
    }
    for (const k of old) {
      const target = KEY_PREFIX + k.slice(OLD_PREFIX.length);
      const value = storage.getItem(k);
      if (value !== null && storage.getItem(target) === null) {
        storage.setItem(target, value);
        moved++;
      }
      storage.removeItem(k);
    }
  } catch {
    /* stockage indisponible (navigation privée stricte…) : rien à migrer */
  }
  return moved;
}

migrateLegacyKeys();
