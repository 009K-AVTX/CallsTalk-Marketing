import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // Email reply links in development point here; the chat server renders those pages.
    proxy: { '/reply': 'http://localhost:3001' },
  },
});
