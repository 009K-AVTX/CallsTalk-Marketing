// Creates an admin login for the portal and prints its setup link (also emailed when SMTP is set up).
// Run it once on a new server for the first admin; after that, admins add logins in the portal.
//
//   npm run portal:admin -- admin@callstalk.com "Full Name"
//
// For an email that already has a login, it prints a new setup link instead (and resets that login).

import { closeDb, initDb } from '../src/db.js';
import { createUser, findUserByEmail, initPortalDb, updateUser } from '../src/portal-db.js';
import { sendInvite } from '../src/admin.js';

const [email = '', name = ''] = process.argv.slice(2);
if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
  console.error('Usage: npm run portal:admin -- admin@callstalk.com "Full Name"');
  process.exit(1);
}

await initDb();
await initPortalDb();
let user = await findUserByEmail(email);
if (user) {
  if (user.role !== 'admin' || user.status === 'disabled') user = await updateUser(user.id, { role: 'admin', status: user.password_hash ? 'active' : 'invited' });
  console.log(`${email} already has a login; it is now an admin with a new setup link.`);
} else {
  user = await createUser({ email, name: name.trim() || email.split('@')[0], company: 'CallsTalk', role: 'admin' });
  console.log(`Admin login created for ${email}.`);
}
const full = await findUserByEmail(email);
const invite = await sendInvite(full, { reset: Boolean(full.password_hash) });
console.log(`\nSetup link (works once, until ${invite.expires_at.toISOString().slice(0, 10)}):\n${invite.invite_url}\n`);
console.log(invite.emailed ? `Also emailed to ${email}.` : invite.email_error);
await closeDb();
process.exit(0);
