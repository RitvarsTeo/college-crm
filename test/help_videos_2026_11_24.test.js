// THE TUTORIAL CLIPS (24.11.2026, the owner's picks: "A + short videos", "Live app, signed-in only", "Silent clip +
// captions", "Database, admin upload"). The clips show real names, so: never in git, only in the database, served only
// to a signed-in account of the clip's half, uploaded only by an admin. Every byte here is invented.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDb } from '../src/db.js';
import { CLIPS, clipOfPath, clipPath, saveClip, getClip, listClips, byteRange, BadClip, cleanVtt } from '../src/helpvideos.js';
import { areaOfApi } from '../src/areas.js';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const SERVER = fs.readFileSync(path.join(ROOT, 'src', 'server.js'), 'utf8');
const APP = fs.readFileSync(path.join(ROOT, 'src', 'app.html'), 'utf8');
const MP4 = Buffer.concat([Buffer.from([0, 0, 0, 24]), Buffer.from('ftypisom'), Buffer.alloc(40, 7)]);
const VTT = 'WEBVTT\n\n00:00:00.000 --> 00:00:04.400\nHome: the year in four figures.\n';

test('the three clips, each in its own half; an address names exactly one clip, in its own half', () => {
  assert.deepEqual(Object.keys(CLIPS), ['admissions', 'training-centre', 'go-list']);
  assert.equal(clipPath('admissions'), '/api/video/admissions.mp4');
  assert.equal(clipPath('go-list', 'vtt'), '/api/tc/video/go-list.vtt');
  assert.deepEqual(clipOfPath('/api/tc/video/go-list.mp4'), { name: 'go-list', kind: 'mp4' });
  for (const p of ['/api/video/go-list.mp4', '/api/tc/video/admissions.mp4', '/api/video/../x.mp4', '/api/video/admissions.mp4/', '/api/video/other.mp4', '/api/video/admissions.html'])
    assert.equal(clipOfPath(p), null, p);
  // the area gate: the Admissions clip needs Academy, the Training Centre clips need Training Centre
  assert.equal(areaOfApi('/api/video/admissions.mp4'), 'academy');
  assert.equal(areaOfApi('/api/video/list'), 'academy');
  assert.equal(areaOfApi('/api/tc/video/go-list.mp4'), 'tc');
  assert.equal(areaOfApi('/api/tc/video/list'), 'tc');
});

test('stored and read back; replaced, never two; only an MP4 and plain-text captions are taken', async () => {
  const db = await openDb();
  assert.equal(await getClip(db, 'go-list'), null);
  await saveClip(db, 'go-list', { mp4: MP4.toString('base64'), vtt: VTT }, 'Admin', '2026-11-24T12:00:00.000Z');
  await saveClip(db, 'go-list', { mp4: MP4.toString('base64'), vtt: VTT + '\n' }, 'Admin', '2026-11-24T12:05:00.000Z');
  const c = await getClip(db, 'go-list');
  assert.ok(c.mp4.equals(MP4)); assert.equal(c.vtt, VTT + '\n');
  const list = await listClips(db);
  assert.deepEqual(list.map((x) => [x.name, x.ready]), [['admissions', false], ['training-centre', false], ['go-list', true]]);
  await assert.rejects(saveClip(db, 'other', { mp4: MP4.toString('base64'), vtt: VTT }, 'A', 'x'), BadClip);
  await assert.rejects(saveClip(db, 'admissions', { mp4: Buffer.from('<html>hello</html>').toString('base64'), vtt: VTT }, 'A', 'x'), BadClip, 'not an MP4');
  await assert.rejects(saveClip(db, 'admissions', { mp4: 'not base64!', vtt: VTT }, 'A', 'x'), BadClip);
  assert.throws(() => cleanVtt('WEBVTT\n\n00:00.000 --> 00:01.000\n<script>x</script>'), BadClip, 'no markup in captions');
  assert.throws(() => cleanVtt('hello'), BadClip);
});

test('a range of bytes for the player', () => {
  assert.deepEqual(byteRange('bytes=0-', 100), [0, 99]);
  assert.deepEqual(byteRange('bytes=10-19', 100), [10, 19]);
  assert.deepEqual(byteRange('bytes=-10', 100), [90, 99]);
  assert.equal(byteRange(undefined, 100), null);
  assert.equal(byteRange('bytes=200-', 100), 'bad');
});

test('the routes: behind the sign-in door and the area gate, never open before sign-in, upload for admins only', () => {
  const door = SERVER.indexOf('// ---------------------------------------------- the area gate --');
  const route = SERVER.indexOf("if (req.method === 'GET' && clipOfPath(p))");
  assert.ok(door > 0 && route > door, 'served only after the sign-in door and the area gate');
  const open = SERVER.slice(SERVER.indexOf('function openBeforeSignIn('), SERVER.indexOf('\n}\n', SERVER.indexOf('function openBeforeSignIn(')));
  assert.doesNotMatch(open, /video/, 'no clip opens before sign-in');
  const up = SERVER.slice(SERVER.indexOf("const upClip = "), SERVER.indexOf("const upClip = ") + 900);
  assert.match(up, /const me = await adminOf\(req\);\s*if \(!me\) return json\(res, 403/, 'the admin role, checked in the route');
  assert.match(SERVER, /'cache-control': 'private, no-store'/, 'never kept by a shared cache');
});

test('no clip file is in the repository; the Help center plays them, an admin uploads them', () => {
  const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (['node_modules', '.git'].includes(e.name) ? []
    : e.isDirectory() ? walk(path.join(d, e.name)) : [e.name]));
  assert.deepEqual(walk(ROOT).filter((n) => /\.(mp4|webm|vtt|mov)$/i.test(n)), [], 'real names never enter git');
  assert.match(APP, /<track kind="captions" srclang="en" label="English" src="\$\{esc\(c\.vtt\)\}" default>/, 'captions on by default');
  assert.match(APP, /<video controls muted playsinline/, 'silent');
  assert.match(APP, /else if \(place === 'video'\) await viewTcVideo\(arg\);/, '#/tc/video/go-list, the link a reminder carries');
  assert.match(APP, /<a href="#\/clips">Tutorial clips<\/a>/);
});
