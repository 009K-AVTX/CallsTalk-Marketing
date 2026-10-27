import { fileURLToPath } from 'url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The customer portal (portal.callstalk.com). Shares the site's fonts, icons, styles and API client.
const here = fileURLToPath(new URL('.', import.meta.url));

// `npm run portal:live` (mode "live") talks to the server in server/ through /api, with real logins.
// Plain `npm run portal` keeps the sample-data preview.
export default defineConfig(({ mode }) => {
  if (mode === 'live') process.env.VITE_PORTAL_API_URL ||= '/api';
  return {
    root: here,
    envDir: `${here}..`,
    publicDir: `${here}../public`,
    plugins: [react()],
    server: { port: 5180, proxy: { '/api': process.env.PORTAL_API_PROXY || 'http://localhost:3001' } },
    preview: { port: 5181 },
    // Its own dependency cache: the website's dev server (npm run dev) rebuilds node_modules/.vite, which would pull
    // SheetJS and jsPDF from under the portal while both run.
    cacheDir: `${here}../node_modules/.vite-portal`,
    // SheetJS (~500 kB) and jsPDF load with import() only when a report is opened, uploaded or exported,
    // so their size doesn't slow the first page.
    build: { outDir: `${here}dist`, emptyOutDir: true, chunkSizeWarningLimit: 600 },
  };
});
