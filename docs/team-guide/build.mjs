// Prints the staff quick guide (staff-guide.html, 8 pages) to docs/CallsTalk-Portal-Team-Guide.pdf with Chrome's own
// --print-to-pdf (A4; the page footers come from each page's @page rules). With --full, the long guide for staff and
// admins (guide.html) goes to docs/CallsTalk-Portal-Team-Guide-Full.pdf instead.
//
// The whole guide, from nothing:
//   node docs/team-guide/demo-server.mjs --build   build the portal for the demo copy
//   node docs/team-guide/demo-server.mjs           run the demo copy (leave it running)
//   node docs/team-guide/seed.mjs                  fill it with sample buyers
//   node docs/team-guide/capture.mjs               take the screenshots (shots/)
//   node docs/team-guide/facts.mjs                 the figures the text quotes, to check against guide.html
//   node docs/team-guide/build.mjs                 this: the PDF
// Only the text changed: edit staff-guide.html (or guide.html) and run this alone.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { CHROME } from './cdp.mjs';
import { here, repo } from './demo-env.mjs';

const full = process.argv.includes('--full');
const out = path.join(repo, 'docs', full ? 'CallsTalk-Portal-Team-Guide-Full.pdf' : 'CallsTalk-Portal-Team-Guide.pdf');
const profile = mkdtempSync(path.join(tmpdir(), 'guide-pdf-'));
const r = spawnSync(CHROME, [
  '--headless=new', '--disable-gpu', '--no-pdf-header-footer', `--user-data-dir=${profile}`, `--print-to-pdf=${out}`,
  pathToFileURL(path.join(here, full ? 'guide.html' : 'staff-guide.html')).href,
], { timeout: 120_000, stdio: 'ignore' });
rmSync(profile, { recursive: true, force: true });
if (r.status !== 0) throw new Error(`Chrome stopped with ${r.status ?? r.signal}`);
console.log(`Written ${path.relative(repo, out)} (${(statSync(out).size / 1024 / 1024).toFixed(1)} MB)`);
