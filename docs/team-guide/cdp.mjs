// A tiny Chrome DevTools Protocol driver: starts headless Chrome and gives one page to script.
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

export const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const wait = (ms) => new Promise((ok) => setTimeout(ok, ms));

export async function launch({ width = 1440, height = 900, port = 9333, args = [] } = {}) {
  const profile = mkdtempSync(path.join(tmpdir(), 'cdp-'));
  const proc = spawn(CHROME, [
    '--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, '--no-first-run', '--no-default-browser-check',
    '--disable-extensions', '--hide-scrollbars', `--window-size=${width},${height}`, ...args, 'about:blank',
  ], { stdio: 'ignore' });
  let targets;
  for (let i = 0; i < 50; i++) {
    try { targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); if (targets.some((t) => t.type === 'page')) break; } catch { /* starting */ }
    await wait(200);
  }
  const page = targets.find((t) => t.type === 'page');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((ok, no) => { ws.onopen = ok; ws.onerror = no; });
  let id = 0;
  const pending = new Map();
  const listeners = [];
  ws.onmessage = (e) => {
    const msg = JSON.parse(e.data);
    if (msg.id && pending.has(msg.id)) {
      const { ok, no } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) no(new Error(`${msg.error.message}`)); else ok(msg.result);
    } else if (msg.method) listeners.forEach((l) => l(msg));
  };
  const send = (method, params = {}) => new Promise((ok, no) => {
    const n = ++id;
    pending.set(n, { ok, no });
    ws.send(JSON.stringify({ id: n, method, params }));
  });
  const once = (method) => new Promise((ok) => { const l = (m) => { if (m.method === method) { listeners.splice(listeners.indexOf(l), 1); ok(m.params); } }; listeners.push(l); });
  await send('Page.enable');
  await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 2, mobile: false });

  const api = {
    send,
    wait,
    async goto(url, settle = 800) {
      const loaded = once('Page.loadEventFired');
      await send('Page.navigate', { url });
      await loaded;
      await wait(settle);
    },
    async eval(expr) {
      const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
      if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
      return r.result.value;
    },
    async waitFor(expr, timeout = 15000) {
      const end = Date.now() + timeout;
      while (Date.now() < end) {
        if (await api.eval(`Boolean(${expr})`).catch(() => false)) return;
        await wait(150);
      }
      throw new Error(`Timed out waiting for ${expr}`);
    },
    async size(width, height) {
      await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 2, mobile: false });
    },
    // A PNG of the page, or of `clip` ({ x, y, width, height } in CSS pixels).
    async shot(clip) {
      const r = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, ...(clip && { clip: { ...clip, scale: 1 } }) });
      return Buffer.from(r.data, 'base64');
    },
    // Streamed back in pieces: a guide full of screenshots is too big for one message.
    async pdf(opts = {}) {
      const { stream } = await send('Page.printToPDF', { printBackground: true, preferCSSPageSize: true, transferMode: 'ReturnAsStream', ...opts });
      const parts = [];
      for (;;) {
        const r = await send('IO.read', { handle: stream, size: 4 * 1024 * 1024 });
        parts.push(Buffer.from(r.data, r.base64Encoded ? 'base64' : 'utf8'));
        if (r.eof) break;
      }
      await send('IO.close', { handle: stream });
      return Buffer.concat(parts);
    },
    async close() {
      ws.close();
      proc.kill();
    },
  };
  return api;
}
