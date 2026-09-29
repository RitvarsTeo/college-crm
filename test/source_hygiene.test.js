// No colleague's name and no Latvian in the shipped source comments (30.09.2026).
// A comment that records WHO asked for something dates badly and puts a person's name
// in a file that ships; the reason survives on its own, and the roles are the ones the
// product already uses (the owner, the review, Admissions, Marketing, an admin).
//
// Names in CODE are untouched and must stay: the actor dropdown, config.admins and the
// owner fields are real values, not commentary.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const FILES = ['src/app.html', 'src/console.html'];
const NAMES = ['Ritvars', 'Aigars', 'Ieva', 'Laura', 'Tetiana', 'Marina'];
const LATVIAN = /filtrus|messedzus|jabut|piezvan[iī]t|Butiba|run[aā]ts|izveli|neliekas|draudziga/i;

const commentLines = (src) => {
  const out = [];
  let inBlock = false;
  src.split('\n').forEach((l, i) => {
    const t = l.trim();
    const opens = t.includes('/*');
    const closes = t.includes('*/');
    const isComment = t.startsWith('//') || t.startsWith('*') || opens || inBlock;
    if (opens && !closes) inBlock = true;
    if (closes) inBlock = false;
    if (isComment) out.push({ line: i + 1, text: l });
  });
  return out;
};

test('no colleague is named in a source comment', () => {
  for (const f of FILES) {
    const hits = commentLines(fs.readFileSync(path.join(ROOT, f), 'utf8'))
      .filter((c) => NAMES.some((n) => c.text.includes(n)))
      .map((c) => f + ':' + c.line + '  ' + c.text.trim().slice(0, 80));
    assert.deepEqual(hits, [], 'use the role, not the person');
  }
});

test('no Latvian quoted back into a source comment', () => {
  for (const f of FILES) {
    const hits = commentLines(fs.readFileSync(path.join(ROOT, f), 'utf8'))
      .filter((c) => LATVIAN.test(c.text))
      .map((c) => f + ':' + c.line + '  ' + c.text.trim().slice(0, 80));
    assert.deepEqual(hits, [], 'say in English what it asked for');
  }
});

test('the names that are DATA are still there', () => {
  // the guard must not have eaten the actor list or the admin roles
  const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'config', 'prototype.json'), 'utf8'));
  assert.ok((cfg.admins || []).length >= 2, 'config still names its admins');
  assert.ok((cfg.users || []).length >= 2, 'config still names its users');
});
