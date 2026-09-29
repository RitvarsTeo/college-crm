// 29.09.2026: the schema is part of the Postgres connection (a startup option), not a `SET
// search_path` fired from the pool's 'connect' event - that raced the first query and pg warned
// "Calling client.query() when the client is already executing a query is deprecated" (pg@9 refuses).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pgConnectionString } from '../src/db.js';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const DB = fs.readFileSync(path.join(ROOT, 'src', 'db.js'), 'utf8');

test('the schema goes into the connection options, and what was there is kept', () => {
  const a = new URL(pgConnectionString('crm', 'postgresql://u:p@host.example/db?sslmode=require'));
  assert.equal(a.searchParams.get('options'), '-c search_path=crm');
  assert.equal(a.searchParams.get('sslmode'), 'require');
  const b = new URL(pgConnectionString('crm', 'postgresql://u:p@host.example/db?options=endpoint%3Dep-x'));
  assert.equal(b.searchParams.get('options'), 'endpoint=ep-x -c search_path=crm');
  assert.equal(pgConnectionString('crm', ''), '');
});

test('no SET search_path from a connect event any more', () => {
  assert.doesNotMatch(DB, /on\('connect'[^\n]*search_path/);
  assert.match(DB, /connectionString: pgConnectionString\(schema\)/);
});
