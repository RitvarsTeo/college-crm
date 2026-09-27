// The Excel export is a real .xlsx (28.09.2026, Ritvars: "the most recent excel
// extension"). It used to be tab-separated text named .xls. These read the file back
// with a zip reader written here, independently of the writer, and check what a
// spreadsheet program would check: every part present, every checksum right, text
// kept as text, numbers as numbers, and the section titles in bold.

import test from 'node:test';
import assert from 'node:assert/strict';
import zlib from 'node:zlib';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { rowsToXlsx, crc32, XLSX_TYPE } from '../src/xlsx.js';
import { boldRowsOf } from '../src/reports.js';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

function unzip(buf) {
  const end = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  assert.ok(end > 0, 'has an end-of-directory record');
  const count = buf.readUInt16LE(end + 10);
  let at = buf.readUInt32LE(end + 16);
  const files = {};
  for (let i = 0; i < count; i += 1) {
    assert.equal(buf.readUInt32LE(at), 0x02014b50, 'central directory entry');
    const method = buf.readUInt16LE(at + 10); const crc = buf.readUInt32LE(at + 16);
    const size = buf.readUInt32LE(at + 20); const nameLen = buf.readUInt16LE(at + 28);
    const extra = buf.readUInt16LE(at + 30); const comment = buf.readUInt16LE(at + 32);
    const local = buf.readUInt32LE(at + 42);
    const name = buf.slice(at + 46, at + 46 + nameLen).toString('utf8');
    assert.equal(buf.readUInt32LE(local), 0x04034b50, 'local header for ' + name);
    const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
    const raw = method === 8 ? zlib.inflateRawSync(buf.slice(start, start + size)) : buf.slice(start, start + size);
    assert.equal(crc32(raw), crc, 'checksum of ' + name);
    files[name] = raw.toString('utf8');
    at += 46 + nameLen + extra + comment;
  }
  return files;
}

test('an .xlsx carries every part Excel needs, with correct checksums', () => {
  const f = unzip(rowsToXlsx([['Title'], ['A', 1]]));
  for (const part of ['[Content_Types].xml', '_rels/.rels', 'xl/workbook.xml', 'xl/_rels/workbook.xml.rels',
    'xl/styles.xml', 'xl/worksheets/sheet1.xml', 'docProps/core.xml', 'docProps/app.xml']) {
    assert.ok(f[part], part + ' is present');
  }
  assert.match(f['[Content_Types].xml'], /spreadsheetml\.sheet\.main\+xml/);
});

test('text stays text, numbers stay numbers, and odd characters cannot break the file', () => {
  const f = unzip(rowsToXlsx([['Phone', '0012345'], ['Count', 115], ['Name', 'Ņina & <Co> "x"\u0007']]));
  const sheet = f['xl/worksheets/sheet1.xml'];
  assert.match(sheet, /<c r="B1" t="inlineStr"><is><t xml:space="preserve">0012345<\/t>/, 'a phone number is not turned into 12345');
  assert.match(sheet, /<c r="B2"><v>115<\/v><\/c>/);
  assert.match(sheet, /Ņina &amp; &lt;Co&gt; &quot;x&quot;<\/t>/, 'escaped, and the control character dropped');
});

test('the report\'s section titles and their column names are bold', () => {
  const rows = [];
  const head = (t) => { const r = [t]; r.head = true; rows.push(r); };
  head('Academy CRM report'); rows.push(['Period', 'x']); rows.push([]);
  head('The headline figures'); rows.push(['Metric', 'Value']); rows.push(['New leads', 3]);
  assert.deepEqual(boldRowsOf(rows), [0, 3, 4]);
  const sheet = unzip(rowsToXlsx(rows, { bold: boldRowsOf(rows) }))['xl/worksheets/sheet1.xml'];
  assert.match(sheet, /<c r="A4" s="1"/);
  assert.match(sheet, /<c r="A5" s="1"/);
  assert.doesNotMatch(sheet, /<c r="A6" s="1"/);
});

test('/api/report.xlsx sends a real workbook with the report in it', async (t) => {
  const child = spawn(process.execPath, [path.join(ROOT, 'src', 'server.js')], {
    env: { ...process.env, PORT: '0', CRM_DB: ':memory:', DATASET: 'demo', CRM_AUTH: '', CRM_PUBLIC: '' },
    stdio: ['ignore', 'pipe', 'pipe'] });
  t.after(() => child.kill());
  const port = await new Promise((resolve, reject) => {
    let out = '';
    child.stdout.on('data', (d) => { out += d; const m = out.match(/http:\/\/localhost:(\d+)/); if (m) resolve(Number(m[1])); });
    child.stderr.on('data', (d) => { out += d; });
    child.on('exit', () => reject(new Error('server exited: ' + out)));
    setTimeout(() => reject(new Error('never started: ' + out)), 10000);
  });
  const r = await fetch(`http://127.0.0.1:${port}/api/report.xlsx?from=2026-01-01&to=2026-12-31&sections=summary,trend,programmes`);
  assert.equal(r.status, 200);
  assert.equal(r.headers.get('content-type'), XLSX_TYPE);
  assert.match(r.headers.get('content-disposition'), /filename="academy-crm-kpi-\d{4}-\d{2}-\d{2}\.xlsx"/);
  const sheet = unzip(Buffer.from(await r.arrayBuffer()))['xl/worksheets/sheet1.xml'];
  assert.match(sheet, /Academy CRM report/);
  assert.match(sheet, /2026-01-01 to 2026-12-31/);
  assert.match(sheet, /The headline figures/);
  const bad = await fetch(`http://127.0.0.1:${port}/api/report.xlsx?from=not-a-date`);
  assert.equal(bad.status, 200, 'a malformed date falls back to the default period instead of failing');
});
