// Item 10, 30.09.2026: one focal point per screen, and the working is shown.
// All four KPI numbers were 30px, so the strip had no focal point at all. The hero
// leads at 40 and the other three stay at 30. The conversion caption described the
// sum in a sentence; it IS the sum now, a / b.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const APP = fs.readFileSync(path.join(ROOT, 'src', 'app.html'), 'utf8');
const REPORTS = fs.readFileSync(path.join(ROOT, 'src', 'reports.js'), 'utf8');

test('the hero number is bigger than the other three', () => {
  const hero = APP.match(/html\.ui-c \.kstrip \.khero b\{font-size:(\d+)px/);
  const rest = APP.match(/html\.ui-c \.kstrip b\{[^}]*font-size:(\d+)px/);
  assert.ok(hero && rest, 'both rules are there');
  assert.equal(Number(hero[1]), 40);
  assert.equal(Number(rest[1]), 30);
  assert.ok(Number(hero[1]) > Number(rest[1]), 'the focal point is the biggest thing');
});

// One screen, one hero (the owner, 01.10.2026). There were two KPI screens: a Home and
// Reports, and Reports already held every figure Home drew plus Applications, a date
// range and the download. Home became Today, the work screen, and has no hero figure -
// its biggest thing is the overdue list, which is the point of it.
test('Home and Reports each have exactly one hero figure', () => {
  assert.equal(APP.split('class="khero"').length - 1, 2, 'Home and Reports, one each; Today is work and has none');
});

test('conversion shows its sum, not a sentence about it', () => {
  assert.match(REPORTS, /conversionA: admittedFromPeriod/, 'the report carries a');
  assert.match(REPORTS, /conversionB: newLeads/, 'and b');
  // Reports and Home (B, locked 02.10.2026) print the same a / b from the same report fields
  assert.equal(APP.split('${s.conversionA ?? 0} / ${s.conversionB ?? 0} who arrived').length - 1, 2,
    'Reports and Home show a / b');
  assert.ok(!APP.includes('esc(s.conversionOf || \'\')'), 'the sentence is off both screens');
  assert.match(REPORTS, /conversionOf: conversion === null/, 'and stays for the export');
});

test('the captions are labels, not sentences', () => {
  for (const s of [
    'in ${year}, with an admission date',
    'first contacted in ${year}',
    'of them reached Application or beyond',
    'admitted in these days, whenever they arrived',
    'for people admitted in these days',
  ]) assert.ok(!APP.includes(s), 'still a sentence: ' + s);
});
