// THE "SAME COMPANY?" LIST MERGED ONCE (patch 178, his words 24.11.2026 "all of the companies in the tab are the same, just check them
// yourself and delete the tab!"): every group is merged except the four pairs he did not tick, which stay separate. Invented names.
import test from 'node:test';
import assert from 'node:assert/strict';
import { planTicked, SEPARATE } from '../scripts/merge_same_ticked_2026_11_24.mjs';

test('the four pairs stay separate; a group left with nobody to merge is no group; the hash pins the companies', () => {
  assert.deepEqual(SEPARATE, [[315, 314], [1436, 1437], [769, 761], [1045, 1047]]);
  const c = (id, name) => ({ id, name });
  const groups = [
    [c(315, 'Davai, UAB'), c(314, 'Davai Bridge and Tunnel A/S')],                       // stays apart: no group
    [c(1050, 'RelyOn Nutec'), c(1051, 'RelyOn Nutec Brasil'), c(1053, 'RelyOn Nutec USA, LLC')],
    [c(769, 'Maersk Training, Inc'), c(761, 'Maersk'), c(770, 'Maersk Training Denmark')], // only 761 stays apart
  ];
  const p = planTicked(groups);
  assert.deepEqual(p.groups.map((g) => [g.keep.id, ...g.drop.map((d) => d.id)]), [[1050, 1051, 1053], [769, 770]]);
  assert.match(p.hash, /^[0-9a-f]{12}$/);
  assert.equal(planTicked(groups.slice(1)).hash, p.hash, 'a pair left apart changes nothing');
  assert.notEqual(planTicked(groups.slice(2)).hash, p.hash, 'a different list is a different hash');
});
