// The Help questions, trimmed and corrected by the owner, 05.10.2026. ids NEVER change once used (the open
// counts are kept per id), so "late-in-new-leads" keeps its id while its question says Inbox.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const HELP = JSON.parse(fs.readFileSync(path.join(ROOT, 'config', 'help.json'), 'utf8'));
const faq = (id) => HELP.faq.find((f) => f.id === id);

test('no sign-in question (whoever reads Help is already in) and no time-zone question', () => {
  assert.equal(faq('how-do-i-sign-in'), undefined);
  assert.equal(faq('time-zone'), undefined);
});
// Q54: Outcomes is no longer a menu place; the person stays on the Journey, under Not proceeding
test('nobody is deleted: Not proceeding with a reason, on record on the Journey, sources kept 13 months', () => {
  assert.equal(faq('delete-a-person').a, 'No. Nobody is deleted. When someone is not going ahead, close them as Not proceeding with a reason. They stay on record on the Journey, under Not proceeding. The original messages and call records behind them are kept for 13 months.');
});
test('"late" is asked about the Inbox, and the answer is the Q50 working-hours rule (live since patch 18)', () => {
  const late = faq('late-in-new-leads');
  assert.equal(late.q, 'What does "late" mean in the Inbox?');
  // the 23.09 rule ("arrived before today, past 09:00") was replaced on 05.10 (Q50); Help says what the app does
  assert.equal(late.a, 'Nobody has handled the message by the end of the working day it should have been answered in. Working hours are Monday to Friday, 09:00 to 17:00 Riga time. One working hour after it arrived the card first says "answer now"; a message that arrives in the evening or at the weekend counts from the next working morning.');
  assert.ok(!HELP.faq.some((f) => /New Leads/.test(f.q + f.a)), 'no answer says New Leads');
});
test('the Due tour step points at Due in the menu, not at Home', () => {
  const step = HELP.tour.find((s) => s.title === 'Due');
  assert.equal(step.target, '.cnav a[data-c="today"]');
});
