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
test('nobody is deleted: Not proceeding with a reason, on record in Outcomes, sources kept 13 months', () => {
  assert.equal(faq('delete-a-person').a, 'No. Nobody is deleted. When someone is not going ahead, close them as Not proceeding with a reason. They stay on record in Outcomes. The original messages and call records behind them are kept for 13 months.');
});
test('"late" is asked about the Inbox, and the rule is unchanged', () => {
  const late = faq('late-in-new-leads');
  assert.equal(late.q, 'What does "late" mean in the Inbox?');
  assert.equal(late.a, 'The lead arrived before today, it is past 09:00 Riga time, and nobody has handled it yet.');
  assert.ok(!HELP.faq.some((f) => /New Leads/.test(f.q + f.a)), 'no answer says New Leads');
});
test('the Next steps tour step points at Next steps in the menu, not at Home', () => {
  const step = HELP.tour.find((s) => s.title === 'Next steps');
  assert.equal(step.target, '.cnav a[data-c="today"]');
});
