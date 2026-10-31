// Plugin Vite : génère `sw.js` à la fin du build avec la liste exacte des fichiers à mettre en cache.
// Résultat : après la première visite en ligne, toute l'appli fonctionne sans réseau.

import type { Plugin } from 'vite';

const EXTRA_FILES = ['./', './index.html', './manifest.webmanifest', './icon.svg', './icon-192.png', './icon-512.png', './icon-maskable-512.png'];

function hash(input: string): string {
  let h = 5381;
  for (let i = 0; i < input.length; i++) h = ((h << 5) + h + input.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

function swSource(version: string, files: string[]): string {
  return `// Généré au build : ne pas modifier à la main.
const CACHE = 'stats-ultimate-${version}';
const FILES = ${JSON.stringify(files)};

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(FILES)).then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => (k.startsWith('stats-ultimate-') || k.startsWith('stats-pl' + 'ouf-')) && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// Cache d'abord (rapide et hors-ligne) ; le réseau sert de secours. Les requêtes vers d'autres
// domaines (prévision météo) ne sont jamais interceptées.
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  event.respondWith(
    caches.match(req, { ignoreSearch: true }).then((hit) => {
      if (hit) return hit;
      return fetch(req).catch(() => (req.mode === 'navigate' ? caches.match('./index.html') : Response.error()));
    }),
  );
});
`;
}

export function serviceWorkerPlugin(): Plugin {
  return {
    name: 'stats-ultimate-service-worker',
    apply: 'build',
    enforce: 'post',
    generateBundle(_options, bundle) {
      const built = Object.keys(bundle)
        .filter((name) => name !== 'sw.js')
        .map((name) => `./${name}`);
      const files = [...new Set([...EXTRA_FILES, ...built])];
      const version = hash(files.join('|') + Object.values(bundle).map((b) => ('code' in b && typeof b.code === 'string' ? b.code.length : 0)).join(','));
      this.emitFile({ type: 'asset', fileName: 'sw.js', source: swSource(version, files) });
    },
  };
}
