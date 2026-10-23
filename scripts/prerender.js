// Inject the server-rendered page into dist/index.html after the client build.
import { readFile, writeFile, rm } from 'fs/promises';
import { pathToFileURL } from 'url';
import { resolve } from 'path';

const dist = resolve('dist');
const { render } = await import(pathToFileURL(resolve('dist-ssr/entry-server.js')).href);
const html = await readFile(resolve(dist, 'index.html'), 'utf8');
let out = html.replace('<div id="root"></div>', `<div id="root">${render()}</div>`);
const css = out.match(/<link rel="stylesheet" crossorigin href="(\/assets\/[^"]+\.css)">/);
if (css) {
  const sheet = await readFile(resolve(dist, css[1].slice(1)), 'utf8');
  out = out.replace(css[0], `<style>${sheet}</style>`);
}
if (!out.includes('id="root"><')) throw new Error('prerender: #root placeholder not found');
await writeFile(resolve(dist, 'index.html'), out);
await rm(resolve('dist-ssr'), { recursive: true, force: true });
console.log('prerendered dist/index.html');
