// The report look (patch 87, 28.10.2026): section titles in small capitals, page titles keep their own size.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../src/app.html', import.meta.url), 'utf8');

test('small-capital section titles leave the page titles alone', () => {
  const rule = html.match(/html\.ui-c #view h2:not\(([^)]*)\), html\.ui-c #view h3 \{ letter-spacing: \.14em;/);
  assert.ok(rule, 'the small-capital rule is there');
  for (const t of ['.dl-tile h2', '.c-apps-head h2', '.one h2', '.c-card h2', '.tct-h', '.tcgo-stage']) {
    assert.ok(rule[1].includes(t), `${t} keeps its own size`);
  }
});
