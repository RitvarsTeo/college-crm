// 06.10.2026: patch 22 (Q59, the Year filter) dropped the line that defined `year` in viewJourneyC while C_JDATA still
// used it, so every way into the Journey answered "Failed to load: year is not defined". No test executed viewJourneyC,
// so 1280 green tests did not see it. This one runs it, for one year, several years and all years.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const APP = fs.readFileSync(path.join(ROOT, 'src', 'app.html'), 'utf8');
const start = APP.indexOf('async function viewJourneyC()');
const VIEW = APP.slice(start, APP.indexOf('\n}\n', start) + 2);

async function open(scopeYear) {
  const ctx = {
    cPeopleRows: async () => [{ id: 1, status: 'New' }],
    api: async (url) => (url.startsWith('/api/report') ? { summary: { newLeads: 7 } } : url.startsWith('/api/tasks') ? [] : null),
    cScopeYear: () => scopeYear, cScopeReportQs: () => 'years=2026',
    cDrawJourney: () => {}, C_JEXITS: null, C_JDATA: null, C_PDATA: null,
  };
  vm.runInNewContext(VIEW.replace('async function viewJourneyC', 'var viewJourneyC = async function'), ctx);
  await ctx.viewJourneyC();
  return ctx.C_JDATA;
}

test('the Journey opens for one year, several years and all years', async () => {
  const one = await open(2026);
  assert.equal(one.year, '2026');
  assert.equal(one.arrived, 7);
  assert.equal((await open('multi')).year, '', 'several years: no single year to filter People by');
  assert.equal((await open('all')).year, '');
});
