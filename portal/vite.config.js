import { fileURLToPath } from 'url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The customer portal (app.callstalk.io). Shares the site's fonts, icons, styles and API client.
const here = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  root: here,
  envDir: `${here}..`,
  publicDir: `${here}../public`,
  plugins: [react()],
  server: { port: 5180 },
  preview: { port: 5181 },
  build: { outDir: `${here}dist`, emptyOutDir: true },
});
