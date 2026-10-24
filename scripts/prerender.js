// Pre-render every page into dist/ after the client build, with its own title and description,
// and inline the (small) stylesheet so the first paint needs no extra request.
import { readFile, writeFile, rm } from 'fs/promises';
import { pathToFileURL } from 'url';
import { resolve } from 'path';

const SITE = 'https://callstalk-marketing.vercel.app';
const dist = resolve('dist');
const { render } = await import(pathToFileURL(resolve('dist-ssr/entry-server.js')).href);
const { DOCS } = await import(pathToFileURL(resolve('dist-ssr/entry-server.js')).href);
const template = await readFile(resolve(dist, 'index.html'), 'utf8');
const cssLink = template.match(/<link rel="stylesheet" crossorigin href="(\/assets\/[^"]+\.css)">/);
const sheet = cssLink ? await readFile(resolve(dist, cssLink[1].slice(1)), 'utf8') : '';

const pages = [
  { path: '/', file: 'index.html' },
  { path: '/request-access', file: 'request-access.html', title: 'Request access', description: 'Request a CallsTalk account. Approved requests receive a login link by email.' },
  { path: '/login', file: 'login.html', title: 'Customer log in', description: 'Log in to see your live CallsTalk bill and pay it online.', noindex: true },
  { path: '/billing', file: 'billing.html', title: 'Billing', description: 'Your live CallsTalk balance and daily statements.', noindex: true },
  { path: '/legal', file: 'legal.html', title: 'Legal Center', description: 'The agreements and policies that apply when you use CallsTalk.' },
  ...['terms', 'privacy', 'cookies'].map((id) => ({ path: `/${id}`, file: `${id}.html`, title: DOCS[id].title, description: DOCS[id].summary })),
  { path: '/404', file: '404.html', title: 'Page not found', description: 'This page does not exist.', noindex: true },
];

const escape = (s) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

for (const page of pages) {
  let out = template.replace('<div id="root"></div>', `<div id="root">${render(page.path)}</div>`);
  if (!out.includes('id="root"><')) throw new Error(`prerender: #root placeholder not found for ${page.path}`);
  if (cssLink) out = out.replace(cssLink[0], `<style>${sheet}</style>`);
  if (page.title) {
    const title = `${page.title} | CallsTalk`;
    out = out
      .replace(/<title>[^<]*<\/title>/, `<title>${escape(title)}</title>`)
      .replace(/(<meta name="description" content=")[^"]*"/, `$1${escape(page.description)}"`)
      .replace(/(<meta property="og:title" content=")[^"]*"/, `$1${escape(title)}"`)
      .replace(/(<meta property="og:description" content=")[^"]*"/, `$1${escape(page.description)}"`);
  }
  const url = page.path === '/' ? `${SITE}/` : `${SITE}${page.path}`;
  out = out.replace(/(<link rel="canonical" href=")[^"]*"/, `$1${url}"`).replace(/(<meta property="og:url" content=")[^"]*"/, `$1${url}"`);
  if (page.noindex) out = out.replace('</head>', '<meta name="robots" content="noindex">\n</head>');
  await writeFile(resolve(dist, page.file), out);
}

const indexed = pages.filter((p) => !p.noindex);
await writeFile(resolve(dist, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${indexed.map((p) => `  <url><loc>${p.path === '/' ? `${SITE}/` : SITE + p.path}</loc></url>`).join('\n')}
</urlset>
`);
await rm(resolve('dist-ssr'), { recursive: true, force: true });
console.log(`prerendered ${pages.length} pages and sitemap.xml`);
