// "Intake", never "CRM", wherever a person reads it (the owner, 05.10.2026). Comments, identifiers, env names
// (CRM_AUTH ...) and repo or folder names keep their words; only what is shown to a person is checked.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const read = (...p) => fs.readFileSync(path.join(ROOT, ...p), 'utf8');
const CRM = /\bCRM\b(?!_)/;

// every string value in a JSON file, skipping the "_..." keys that are the file's own comments
function values(node, out = [], key = '') {
  if (key.startsWith('_')) return out;
  if (typeof node === 'string') out.push(node);
  else if (Array.isArray(node)) node.forEach((v) => values(v, out));
  else if (node && typeof node === 'object') for (const [k, v] of Object.entries(node)) values(v, out, k);
  return out;
}
// the visible text of a page: comments, scripts' comments and styles out
const visible = (html) => html.replace(/<!--[\s\S]*?-->/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/[^\n]*/g, '$1').replace(/<style[\s\S]*?<\/style>/g, '');

test('the help center and the tour never say CRM', () => {
  const bad = values(JSON.parse(read('config', 'help.json'))).filter((v) => CRM.test(v));
  assert.deepEqual(bad, []);
});
test('the channel steps and notes never say CRM', () => {
  const bad = values(JSON.parse(read('config', 'channels.json'))).filter((v) => CRM.test(v));
  assert.deepEqual(bad, []);
});
test('the install name, the console and the Excel file say Intake', () => {
  assert.match(read('src', 'server.js'), /name: 'Novikontas Intake',\s*short_name: 'Intake'/);
  const console = visible(read('src', 'console.html'));
  assert.ok(!CRM.test(console), 'console.html shows no CRM: ' + (console.match(/.{0,40}\bCRM\b.{0,40}/) || [''])[0]);
  assert.doesNotMatch(read('src', 'xlsx.js'), /Academy CRM/);
});
test('the app shows no CRM: its title and every string outside comments', () => {
  const app = visible(read('src', 'app.html'));
  const hits = (app.match(/[^\n]{0,40}\bCRM\b(?!_)[^\n]{0,40}/g) || [])
    .filter((l) => !/x === 'CRM'/.test(l));   // a stored actor value, mapped to "Intake" before it is shown
  assert.deepEqual(hits, []);
  assert.match(read('src', 'app.html'), /<title>[^<]*Intake[^<]*<\/title>/);
});
test('the tour opens on the left card, in his words', () => {
  const tour = JSON.parse(read('config', 'help.json')).tour;
  assert.equal(tour[0].title, 'The left card');
  assert.equal(tour[0].body, 'Everything in Intake is one click away here. The numbers show what is waiting.');
  assert.ok(!/menu/i.test(tour[0].title + tour[0].body));
});

// LOCKED 05.10.2026, the last word that day: Home > Admissions (Today, Inbox) > People (Journey, Outcomes) > Reports >
// Settings. The page reads TODAY again and comes first ("when we click admissions, first is todays work ..., then inbox
// goes as next step"); "Next steps" as the page name is gone, a person's next step keeps its words.
test('the menu order and the Today name', () => {
  const APP = read('src', 'app.html');
  const nav = APP.slice(APP.indexOf('<div class="cnav" role="navigation"'), APP.indexOf('</div>`);', APP.indexOf('<div class="cnav" role="navigation"')));
  const order = [...nav.matchAll(/data-c="(\w+)"/g)].map((m) => m[1]);
  // Q51: Home, Admissions (Inbox, Today, Journey), Reports, Settings; Journey's place id stays 'people'
  // Q53: Help center is its own item directly under Settings
  assert.deepEqual(order, ['home', 'admissions', 'leads', 'today', 'people', 'reports', 'settings', 'help']);
  assert.match(nav, /<span>Today<\/span><span class="n" id="cnNext"><\/span>/, 'the count badge stays on Today');
  assert.doesNotMatch(nav, /<span>Next steps<\/span>/);
  assert.match(APP, /title: 'Today',/);
  assert.doesNotMatch(APP, /<h1>Next steps<\/h1>|Back to Next steps/);
  assert.match(APP, /cPlace\(page\)[\s\S]{0,400}today: 'today'/, 'the #/today route still works');
  const help = APP.slice(APP.indexOf('class="c-step-n">01'), APP.indexOf('class="c-step-n">03') + 60);
  // Q54: the three steps follow the work as the menu does: 01 Inbox, 02 Today, 03 Journey
  assert.match(help, /01<\/span><b>Inbox<\/b>[\s\S]*02<\/span><b>Today<\/b>[\s\S]*03<\/span><b>Journey<\/b>/);
  assert.match(APP, /<a class="c-step" href="#\/today"><span class="c-step-n">02<\/span><b>Today<\/b>/, 'box 02 opens Today');
});
test('the lines Intake writes on a person\'s History say Intake', () => {
  assert.match(read('src', 'intake.js'), /body: 'The Intake admissions journey ends here\. The record stays for reporting\.'/);
  assert.match(read('src', 'sync.js'), /body: 'The Intake stage is unchanged\.'/);
});
