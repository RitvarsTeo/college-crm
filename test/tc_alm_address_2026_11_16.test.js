// ALEKSEJS MAĻINOVSKIS'S ADDRESS (16.11.2026, his "Yes, fix + release"): Intake had him as alma@novikontas.org, a mailbox that
// does not exist (a mail to it bounced 11.11, 550 5.1.1), so he could not sign in. His address is alm@novikontas.org. The list
// code stays "Alma", so the Stage 2 rows with sender 'Alma' stay his.
import test from 'node:test';
import assert from 'node:assert/strict';
const ml = await import('../src/tcmylist.js');
const godemo = await import('../src/godemo.js');
const { TC } = await import('../src/tc.js');

test('alm@ signs in to the list Alma, and only that one; alma@ is nobody', () => {
  const alm = { email: 'alm@novikontas.org' };
  assert.equal(ml.ownCode(alm), 'Alma');
  assert.equal(ml.ownCode({ email: 'ALM@Novikontas.org' }), 'Alma', 'any letter case');
  assert.deepEqual(ml.openable(alm, false), ['Alma']);
  assert.equal(ml.mayOpen(alm, false, 'Alma'), true);
  assert.equal(ml.mayOpen(alm, false, 'JS'), false);
  assert.equal(ml.ownCode({ email: 'alma@novikontas.org' }), null, 'the address that does not exist opens no list');
  const sender = TC.grandOpening.stage2.senders.find((s) => s.code === 'Alma');
  assert.equal(sender.email, 'alm@novikontas.org');
  assert.equal(sender.name, 'Aleksejs Maļinovskis');
});

test('alm@ may view the Grand Opening demo; alma@ is not on the viewers list', () => {
  assert.equal(godemo.mayView({ email: 'alm@novikontas.org' }), true);
  assert.ok(!godemo.viewers().includes('alma@novikontas.org'));
});
