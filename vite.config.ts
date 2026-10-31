import { defineConfig } from 'vitest/config';
import { serviceWorkerPlugin } from './build/sw-plugin';

// base relative : l'app peut être hébergée dans n'importe quel sous-dossier.
export default defineConfig({
  base: './',
  plugins: [serviceWorkerPlugin()],
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
