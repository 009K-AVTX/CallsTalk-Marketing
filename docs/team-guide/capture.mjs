// Takes the Team Guide's screenshots from the demo copy (demo-server.mjs running, seed.mjs run just before): signs in
// through the real login page as staff, an admin and a buyer, does what the guide describes, and saves each picture
// to shots/. Some steps change the demo (an upload, a new customer, two replaced calls), so run seed.mjs first.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { PASSWORD, PORTAL, REAL_PORTAL, here, serverModules } from './demo-env.mjs';
import { launch } from './cdp.mjs';

const only = process.argv.slice(2); // names of shots to take again; none: all
const { crypto, pool } = await serverModules();
await pool.end();
const L = JSON.parse(readFileSync(path.join(here, '.demo', 'logins.json'), 'utf8'));
const shots = path.join(here, 'shots');
mkdirSync(shots, { recursive: true });

// Page helpers, put in every page the browser opens.
const HELPERS = `
window.__g = {
  norm: (s) => (s || '').replace(/\\s+/g, ' ').trim(),
  byText(sel, text, root = document) { return [...root.querySelectorAll(sel)].find((e) => __g.norm(e.textContent).includes(text)); },
  heading(text, exact) { return [...document.querySelectorAll('h1, h2')].find((h) => exact ? __g.norm(h.textContent) === text : __g.norm(h.textContent).startsWith(text)); },
  card(text, exact) { const h = __g.heading(text, exact); return h && h.closest('.p-card, section, form, article'); },
  box(els, pad = 10, maxHeight = 0) {
    const rs = els.filter(Boolean).map((e) => e.getBoundingClientRect());
    const x = Math.min(...rs.map((r) => r.left)) - pad, y = Math.min(...rs.map((r) => r.top)) - pad;
    const w = Math.max(...rs.map((r) => r.right)) + pad - x;
    let h = Math.max(...rs.map((r) => r.bottom)) + pad - y;
    if (maxHeight) h = Math.min(h, maxHeight);
    return { x: Math.max(0, x + scrollX), y: Math.max(0, y + scrollY), width: w, height: h };
  },
  set(input, v) {
    const proto = input.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(input, v);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  },
  field(label, v) { __g.set(__g.byText('label', label).querySelector('input'), v); },
  click(sel, text, root) { const e = __g.byText(sel, text, root); if (!e) throw new Error('No ' + sel + ' with ' + text); e.click(); },
  async choose(label, option) {
    const l = __g.byText('label', label);
    l.querySelector('.c-select__btn').click();
    await new Promise((r) => setTimeout(r, 200));
    __g.click('[role=option]', option, l);
  },
};`;

async function browser() {
  const b = await launch({ width: 1360, height: 900, port: 9300 + Math.floor(Math.random() * 600) });
  await b.send('Page.addScriptToEvaluateOnNewDocument', { source: HELPERS });
  b.open = async (p, ready) => {
    await b.goto(PORTAL + p, 300);
    if (ready) await b.waitFor(ready);
    await b.wait(700);
    await b.eval('scrollTo(0, 0)');
  };
  // Saves a picture of `expr` (JS giving a clip box), or of the whole page: then the window is made as tall as the
  // page, so what is fixed to its bottom (the chat button) sits at the page's foot instead of over its content.
  b.save = async (name, expr, { full = false } = {}) => {
    if (only.length && !only.includes(name)) return;
    if (full) {
      await b.size(1360, await b.eval('document.documentElement.scrollHeight'));
      await b.wait(400);
    }
    // From the top, so the sticky top bar never lies over what is cropped.
    await b.eval("document.documentElement.style.scrollBehavior = 'auto'; scrollTo(0, 0)");
    await b.wait(250);
    // No crop: the window as it shows (the whole page only when `full`).
    const clip = expr ? await b.eval(expr) : full ? null : { x: 0, y: 0, width: 1360, height: 900 };
    const r = await b.send('Page.captureScreenshot', { format: 'jpeg', quality: 90, captureBeyondViewport: !full, ...(clip && { clip: { ...clip, scale: 1 } }) });
    writeFileSync(path.join(shots, `${name}.jpg`), Buffer.from(r.data, 'base64'));
    if (full) await b.size(1360, 900);
    console.log(`  ${name}`);
  };
  b.files = async (selector, file) => {
    const { root } = await b.send('DOM.getDocument', { depth: -1 });
    const { nodeId } = await b.send('DOM.querySelector', { nodeId: root.nodeId, selector });
    await b.send('DOM.setFileInputFiles', { nodeId, files: [file] });
  };
  b.login = async (who) => {
    await b.open('/login', "document.querySelector('input[type=password]')");
    await b.eval(`__g.set(document.querySelector('input[type=email]'), ${JSON.stringify(who.email)});
      __g.set(document.querySelector('input[type=password]'), ${JSON.stringify(PASSWORD)});
      document.querySelector('form button[type=submit]').click()`);
    await b.waitFor("document.querySelector('input[autocomplete=one-time-code]')");
    await b.eval(`__g.set(document.querySelector('input[autocomplete=one-time-code]'), '${crypto.totpCode(who.secret)}');
      document.querySelector('form button[type=submit]').click()`);
    await b.waitFor("!location.pathname.startsWith('/login')");
    await b.wait(1200);
  };
  return b;
}

const day = (iso) => new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric', year: 'numeric' });
const ago = (n) => { const d = new Date(`${L.today}T12:00:00Z`); d.setUTCDate(d.getUTCDate() - n); return d.toISOString().slice(0, 10); };
const file = (name) => path.join(here, '.demo', name);

// ── before signing in, then staff ────────────────────────────────────────────
console.log('Staff');
let b = await browser();
await b.open('/login', "document.querySelector('.access-card')");
await b.save('login', "__g.box([document.querySelector('.access-card')], 24)");
await b.goto(L.inviteUrl.replace(REAL_PORTAL, PORTAL), 300);
await b.waitFor("document.querySelector('.access-card img, .access-card svg, canvas')");
await b.wait(800);
await b.save('setup', "__g.box([document.querySelector('.access-card')], 24)");

await b.login(L.staff);
await b.open('/upload', "__g.heading('Uploaded')");
await b.save('staff-reports');

// A Call Summary for Harbor: the afternoon's log.
await b.eval("__g.choose('Customer', 'HHP')");
await b.files('input[type=file]', file('HHP - afternoon.xlsx'));
await b.waitFor("/9 calls/.test(document.querySelector('.p-drop').textContent)");
await b.wait(600);
await b.save('upload-calls', "__g.box([__g.card('Upload a Report')], 12)");
await b.eval("__g.click('button[type=submit]', 'Upload Call Summary')");
await b.waitFor("document.querySelector('.p-up__form .p-ok')");
await b.wait(500);
await b.save('upload-done', "__g.box([document.querySelector('.p-up__form .p-ok')], 14)");

// A billing report for Bluepeak, read against their billing.
await b.open('/upload', "__g.heading('Uploaded')");
await b.eval("__g.click('[role=radio]', 'Billing Report')");
await b.eval("__g.choose('Customer', 'BPI')");
await b.files('input[type=file]', file('Bluepeak billing report.xlsx'));
await b.waitFor("document.querySelector('.p-import table')");
await b.wait(800);
await b.save('upload-billing', "__g.box([__g.card('Upload a Report')], 12)");
await b.open('/upload', "__g.heading('Uploaded')");
await b.save('uploaded', "__g.box([__g.card('Uploaded')], 12, 760)");

await b.open('/customers', "__g.heading('Nicknames')");
await b.save('customers', "__g.box([document.querySelector('.p-head'), __g.card('Nicknames')], 12, 860)");

await b.open('/customers/new', "__g.heading('New Login')");
await b.eval(`__g.field('Full Name', 'Nadia Romero'); __g.field('Email', 'nadia@lakesidelegal.example'); __g.field('Company', 'Lakeside Legal Leads');
  __g.field('Nickname', 'LLL'); __g.field('Price per Call', '36.00'); __g.field('Opening Balance', '0')`);
await b.wait(400);
await b.save('new-customer', "__g.box([__g.card('New Login')], 12)");
await b.eval("__g.click('button[type=submit]', 'Create Login and Send Link')");
await b.waitFor("__g.byText('button', 'Copy')");
await b.wait(500);
await b.save('new-customer-link', "__g.box([__g.card('New Login')], 12)");

// Harbor's page, as staff open it from Customers: the Account tab (no role, no Delete), then Calls & Replacements.
await b.open(`/customers/${L.ids.hhp}?tab=account`, "__g.heading('Danger Zone')");
await b.save('staff-customer', "__g.box([document.querySelector('.p-crumb'), document.querySelector('.p-head'), document.querySelector('.p-tabs'), document.querySelector('.p-grid')], 12)");
await b.save('staff-danger', "__g.box([__g.card('Danger Zone')], 12)");
await b.open(`/customers/${L.ids.hhp}`, "__g.heading('Replaced Calls') && document.querySelector('.p-rc__reports')");
await b.save('buyer-tabs', "__g.box([document.querySelector('.p-head'), document.querySelector('.p-tabs')], 12)");
await b.eval(`__g.click('.p-table--click tr', '${day(ago(2))}')`);
await b.wait(800);
await b.save('calls-logged', "__g.box([__g.card('Calls', true)], 12)");

// Two more calls Harbor asked to have replaced, chosen in their Call Summary.
await b.eval(`__g.click('button', 'Choose Calls', __g.byText('.p-rc__reports li', '${day(ago(2))}'))`);
await b.waitFor("document.querySelectorAll('.p-viewer tbody tr').length > 5");
await b.wait(800);
await b.eval(`const boxes = [...document.querySelectorAll('.p-viewer tbody .p-viewer__mark input')]; boxes[3].click(); boxes[6].click();
  __g.set(document.querySelector('.p-viewer__send input'), 'Buyer asked in chat: no conversation')`);
await b.wait(400);
await b.save('replace-pick', "__g.box([document.querySelector('.p-viewer__panel')], 0)");
await b.eval("document.querySelector('.p-viewer__pick button[type=submit]').click()");
await b.waitFor("document.querySelector('.p-viewer__pick .p-ok')");
await b.wait(600);
await b.save('replace-done', "__g.box([document.querySelector('.p-viewer__pick')], 12)");
await b.eval("document.querySelector('.p-viewer__tools button[aria-label=Close]').click()");
await b.wait(600);
await b.save('replaced-card', "__g.box([__g.card('Replaced Calls')], 12)");

// The date filter open on its presets. The window is made as tall as the page first, so nothing scrolls under the
// popover (it is fixed to the window).
await b.size(1360, await b.eval('document.documentElement.scrollHeight'));
await b.eval("scrollTo(0, 0); document.querySelector('.p-rc .p-range').click()");
await b.waitFor("document.querySelector('.p-range__pop')");
await b.wait(400);
await b.eval("document.querySelector('.p-range__preset').click()");
await b.wait(300);
await b.save('date-presets', "__g.box([document.querySelector('.p-rc .p-range'), document.querySelector('.p-range__pop')], 12)");
await b.eval("document.querySelector('.p-range__preset').click()");
await b.wait(300);
await b.save('date-range', "__g.box([document.querySelector('.p-rc .p-range'), document.querySelector('.p-range__pop')], 12)");
await b.eval("document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))");
await b.size(1360, 900);

await b.open('/settings', "__g.heading('Change Password')");
await b.save('settings');
await b.close();

// ── an admin ─────────────────────────────────────────────────────────────────
console.log('Admin');
b = await browser();
await b.login(L.admin);
await b.open('/admin', "__g.heading('Everyone Who Can Sign In')");
await b.save('logins');
await b.eval("__g.click('button', 'New Login')");
await b.wait(600);
await b.save('new-login', "__g.box([__g.card('New Login')], 12)");

// Harbor's page as an admin: the Account tab, then Billing & Payments, then Calls & Replacements.
await b.open(`/admin/users/${L.ids.hhp}?tab=account`, "__g.heading('Recent Activity') && __g.heading('Contact Methods')");
await b.save('buyer-top', "__g.box([document.querySelector('.p-crumb'), document.querySelector('.p-head'), document.querySelector('.p-tabs'), document.querySelector('.p-grid')], 12)");
await b.save('contacts', "__g.box([__g.card('Contact Methods')], 12)");
await b.save('activity', "__g.box([__g.card('Recent Activity')], 12)");
await b.save('danger-zone', "__g.box([__g.card('Danger Zone')], 12)");
await b.open(`/admin/users/${L.ids.hhp}?tab=billing`, "__g.heading('Billing Terms')");
await b.save('terms-payment', "__g.box([__g.card('Billing Terms'), __g.card('Record a Payment')], 12)");
await b.save('payments', "__g.box([[...document.querySelectorAll('h2')].filter((h) => h.textContent.trim() === 'Payments').pop().closest('.p-card')], 12)");
await b.open(`/admin/users/${L.ids.hhp}`, "__g.heading('Last')");
await b.save('ledger', "__g.box([__g.card('Last')], 12)");

await b.open('/admin/finance', "__g.heading('By Customer')");
await b.wait(1200);
await b.save('finance-figures', `(() => { const top = document.querySelector('.p-head'); const next = __g.card('Billed and Collected');
  const t = top.getBoundingClientRect(), n = next.getBoundingClientRect();
  return { x: t.left - 10 + scrollX, y: t.top - 10 + scrollY, width: t.width + 20, height: n.top - t.top - 4 }; })()`);
await b.save('finance-charts', "__g.box([__g.card('Billed and Collected'), __g.card('Calls per Day')], 12)");
await b.save('finance-owed', "__g.box([__g.card('Owed Now'), [...document.querySelectorAll('h2')].filter((h) => h.textContent.trim() === 'Payments').pop().closest('.p-card')], 12)");
await b.save('finance-customers', "__g.box([__g.card('By Customer')], 12)");
await b.eval("__g.click('button', 'Download')");
await b.wait(500);
await b.save('finance-download', `(() => { const btn = __g.byText('button', 'Download'); const menu = document.querySelector('[role=menu]') || btn.parentElement;
  return __g.box([btn, menu], 14); })()`);

await b.open('/admin/audit', "__g.heading('Entries')");
await b.wait(800);
await b.save('audit', `(() => { const top = document.querySelector('.p-head'); const next = __g.card('Entries');
  const t = top.getBoundingClientRect(), n = next.getBoundingClientRect();
  return { x: t.left - 10 + scrollX, y: t.top - 10 + scrollY, width: t.width + 20, height: n.top - t.top - 4 }; })()`);
await b.save('audit-entries', "__g.box([__g.card('Entries')], 12, 760)");

await b.open('/settings', "__g.heading('Billing Notifications')");
await b.save('notifications', "__g.box([__g.heading('Billing Notifications').closest('section, .p-card, form')], 12)");
await b.close();

// ── the buyer (Harbor) ───────────────────────────────────────────────────────
console.log('Buyer');
b = await browser();
await b.login(L.buyer);
await b.open('/', "document.querySelector('.wallet') && document.querySelector('.bill')");
await b.wait(1000);
await b.save('buyer-billing', null, { full: true });
await b.save('buyer-bill', "__g.box([document.querySelector('.bill--today') || document.querySelector('.bill')], 12)");
await b.save('buyer-history', "__g.box([document.querySelector('.billing__history'), document.querySelector('.billing__replaced'), document.querySelector('.billing__payments:not(.billing__replaced)')], 14)");
await b.open('/reports', "document.querySelector('.p-report')");
await b.eval(`__g.click('button', 'View', __g.byText('.p-report', '${day(ago(3))}'))`);
await b.waitFor("document.querySelectorAll('.p-viewer tbody tr').length > 5");
await b.eval("document.querySelector('.chat__launcher').style.visibility = 'hidden'"); // not over the report
await b.wait(800);
await b.save('buyer-report', "__g.box([document.querySelector('.p-viewer__panel')], 0)");
await b.close();
console.log('Done');
