// Creates an admin login for the portal and prints its setup link (also emailed when SMTP is set up).
// Run it once on a new server for the first admin; after that, admins add logins in the portal.
// With --owner it makes the Owner instead: an admin who also sets clients' rates and has the Owner Panel.
// Only the Owner can add or change an Owner login in the portal, so the first one is made here.
//
//   npm run portal:admin -- admin@callstalk.com "Full Name"
//   npm run portal:admin -- owner@callstalk.com "Full Name" --owner
//
// For an email that already has a login, it prints a new setup link instead (and resets that login).

import { closeDb, initDb } from '../src/db.js';
import { createUser, findUserByEmail, initPortalDb, updateUser } from '../src/portal-db.js';
import { sendInvite } from '../src/admin.js';

const args = process.argv.slice(2);
const role = args.includes('--owner') ? 'owner' : 'admin';
const [email = '', name = ''] = args.filter((a) => a !== '--owner');
if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
  console.error('Usage: npm run portal:admin -- admin@callstalk.com "Full Name" [--owner]');
  process.exit(1);
}

await initDb();
await initPortalDb();
let user = await findUserByEmail(email);
if (user) {
  if (user.role !== role || user.status === 'disabled') user = await updateUser(user.id, { role, status: user.password_hash ? 'active' : 'invited' });
  console.log(`${email} already has a login; it is now ${role === 'owner' ? 'the Owner' : 'an admin'} with a new setup link.`);
} else {
  user = await createUser({ email, name: name.trim() || email.split('@')[0], company: 'CallsTalk', role });
  console.log(`${role === 'owner' ? 'Owner' : 'Admin'} login created for ${email}.`);
}
const full = await findUserByEmail(email);
const invite = await sendInvite(full, { reset: Boolean(full.password_hash) });
console.log(`\nSetup link (works once, until ${invite.expires_at.toISOString().slice(0, 10)}):\n${invite.invite_url}\n`);
console.log(invite.emailed ? `Also emailed to ${email}.` : invite.email_error);
await closeDb();
process.exit(0);
