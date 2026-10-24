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
    build: { outDir: `${here}dist`, emptyOutDir: true },
  };
});
