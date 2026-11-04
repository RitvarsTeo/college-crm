// MY CLIENTS ON HOME (04.11.2026): the owner's pick - the list stays under Clients, Home has a clear shortcut to it.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

test('TC Home: My clients for an account with companies, the next contact first, All of mine to its list under Clients', () => {
  const app = fs.readFileSync(path.join(ROOT, 'src', 'app.html'), 'utf8');
  assert.match(app, /else \{ await viewTcHome\(\); tcMyClients\(\); tcTourFirst\(\); \}/);
  const fn = app.slice(app.indexOf('async function tcMyClients('), app.indexOf('async function viewTcHome('));
  assert.match(fn, /api\('\/api\/tc\/companies\?pic=me&size=6&sort=next&only=1'\)/);
  assert.match(fn, /if \(!L \|\| !Number\(L\.total\)/, 'nothing for an account with no company');
  assert.match(fn, /T_F=\{ \.\.\.T_F_EMPTY\(\), pic: 'me' \};T_KEEP=true;cGo\('#\/tc\/companies'\)/);
  assert.doesNotMatch(app.slice(app.indexOf('function tcInstallNav('), app.indexOf('function tcMore(open)')), /My clients/, 'no new menu item');
});
