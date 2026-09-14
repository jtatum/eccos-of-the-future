import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { RETURN_ANSWER_DIGEST } from '../src/return-filter.mjs';

const [appSource, htmlSource, workerSource, schemaSource, syncSource] = await Promise.all([
  readFile(new URL('../app.js', import.meta.url), 'utf8'),
  readFile(new URL('../index.html', import.meta.url), 'utf8'),
  readFile(new URL('../worker/index.ts', import.meta.url), 'utf8'),
  readFile(new URL('../db/schema.ts', import.meta.url), 'utf8'),
  readFile(new URL('../scripts/sync-sites-assets.mjs', import.meta.url), 'utf8')
]);

test('the persistent event is attached only to a successful local countersign check', () => {
  const successBranch = appSource.match(/if \(valid\) \{([\s\S]*?)\} else \{/u)?.[1] ?? '';
  assert.match(successBranch, /recordAcceptedCountersign\(input\.value\)/u);
  assert.doesNotMatch(appSource.slice(0, appSource.indexOf('if (valid) {')), /recordAcceptedCountersign\(/u);
  assert.match(appSource, /catch \{\s*\/\/ The field channel never depends on its aggregate counter\./u);
});

test('the server independently recognizes the accepted digest and stores no submitted value', () => {
  assert.match(workerSource, new RegExp(`const EXPECTED_DIGEST = ["']${RETURN_ANSWER_DIGEST}["']`, 'u'));
  assert.match(workerSource, /digest !== EXPECTED_DIGEST/u);
  assert.match(workerSource, /accepted_count = accepted_count \+ 1/u);
  const counterTable = schemaSource.match(/sqliteTable\("ecco_countersign_totals", \{([\s\S]*?)\}\);/u)?.[1] ?? '';
  const storedColumns = [...counterTable.matchAll(/(?:integer|text)\("([^"]+)"\)/gu)].map((match) => match[1]);
  assert.deepEqual(storedColumns, ['id', 'accepted_count', 'updated_at']);
});

test('only a Sites build receives the persistent counter endpoint', () => {
  assert.doesNotMatch(htmlSource, /name="ecco-counter-endpoint"/u);
  assert.match(syncSource, /name="ecco-counter-endpoint" content="\/api\/countersign-success"/u);
});
