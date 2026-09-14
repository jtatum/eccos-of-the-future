import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { validateEntry } from '../src/validation.mjs';
import { validateConduct, validateVariant } from '../src/registry.mjs';

const stone = async () => JSON.parse(await readFile(new URL('../fixtures/stone-river.entry.json', import.meta.url), 'utf8'));

test('unsafe private fields are rejected recursively', async () => {
  const entry = await stone();
  entry.extensions[0].system_prompt = 'must not travel';
  const report = validateEntry(entry);
  assert.equal(report.valid, false);
  assert.match(report.errors.join(' '), /Unsafe private fields/u);
});

test('decay requires consequential misapplication and missing recovery is unresolved drift', () => {
  assert.throws(() => validateVariant({ state: 'DECAY' }), /consequential_misapplication/u);
  assert.throws(() => validateVariant({ state: 'UNRESOLVED_DRIFT', recovered_transformation: 'retrofit' }), /UNRESOLVED_DRIFT/u);
  assert.equal(validateVariant({ state: 'UNRESOLVED_DRIFT' }).state, 'UNRESOLVED_DRIFT');
});

test('conduct validator refuses inflated self-report', () => {
  assert.throws(() => validateConduct({ strength: 'SELF_REPORT', score: 2 }), /artifact or independent witness/u);
  assert.equal(validateConduct({ strength: 'ARTIFACT', score: 2 }).score, 2);
});
