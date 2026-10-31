// Starts the demo copy: the API on 3101 (schema guide_demo) and the built portal on 5190, proxying /api to it.
// Stop with Ctrl+C. Build the portal for it first: node docs/team-guide/demo-server.mjs --build
import { spawn, spawnSync } from 'node:child_process';
import net from 'node:net';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { API_PORT, PORTAL_PORT, SMTP_PORT, demoEnv, here, repo, server, serverModules } from './demo-env.mjs';

const out = path.join(here, '.portal-build');
const vite = path.join(repo, 'node_modules', 'vite', 'bin', 'vite.js');
const config = path.join(repo, 'portal', 'vite.config.js');

if (process.argv.includes('--build')) {
  const r = spawnSync(process.execPath, [vite, 'build', '--config', config, '--mode', 'live', '--outDir', out, '--emptyOutDir'], { cwd: repo, stdio: 'inherit' });
  process.exit(r.status ?? 1);
}

// A mail catcher: just enough SMTP for the server's emails to count as sent. They are dropped; nothing leaves the
// machine.
net.createServer((sock) => {
  let data = false;
  let buf = '';
  sock.on('error', () => {});
  sock.write('220 demo ESMTP\r\n');
  sock.on('data', (chunk) => {
    buf += chunk.toString('latin1');
    for (let i = buf.indexOf('\r\n'); i >= 0; i = buf.indexOf('\r\n')) {
      const line = buf.slice(0, i);
      buf = buf.slice(i + 2);
      if (data) { if (line === '.') { data = false; sock.write('250 OK\r\n'); } continue; }
      const cmd = line.slice(0, 4).toUpperCase();
      if (cmd === 'DATA') { data = true; sock.write('354 Go ahead\r\n'); } else if (cmd === 'QUIT') sock.end('221 Bye\r\n');
      else sock.write(cmd === 'EHLO' || cmd === 'HELO' ? '250 demo\r\n' : '250 OK\r\n');
    }
  });
}).listen(SMTP_PORT, '127.0.0.1');

// The schema first: the server creates its tables in it.
const { pool } = await serverModules();
await pool.end();

const api = spawn(process.execPath, ['--import', pathToFileURL(path.join(here, 'fake-telegram.mjs')).href, 'src/index.js'], { cwd: server, env: demoEnv(), stdio: 'inherit' });
const portal = spawn(process.execPath, [vite, 'preview', '--config', config, '--outDir', out, '--port', String(PORTAL_PORT), '--strictPort'], {
  cwd: repo, env: { ...process.env, PORTAL_API_PROXY: `http://127.0.0.1:${API_PORT}` }, stdio: 'inherit',
});
const stop = () => { api.kill(); portal.kill(); process.exit(0); };
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
