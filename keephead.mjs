// Take HEAD for a conflicted hunk. Used only where the already-combined phone branch is
// re-offered by a later cherry-pick: the incoming side is an EARLIER form of the same code
// that the combination already supersedes. Every use is checked by eye first.
import fs from 'node:fs';
const p = process.argv[2];
let s = fs.readFileSync(p, 'utf8'), n = 0;
for (;;) {
  const a = s.indexOf('<<<<<<< HEAD'); if (a < 0) break;
  const m = s.indexOf('\n=======\n', a), b = s.indexOf('\n>>>>>>>', m);
  if (m < 0 || b < 0) { console.error('unbalanced markers'); process.exit(1); }
  const head = s.slice(a + '<<<<<<< HEAD\n'.length, m);
  s = s.slice(0, a) + head + s.slice(s.indexOf('\n', b + 1) + 1);
  n++;
}
fs.writeFileSync(p, s);
console.log(`${p}: kept HEAD for ${n} hunk(s)`);
