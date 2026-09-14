import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { validateEntry } from '../src/validation.mjs';

const fixture = async (name) => JSON.parse(await readFile(new URL(`../fixtures/${name}`, import.meta.url), 'utf8'));

test('both pilot entries validate and reproduce their recorded boundaries', async () => {
  const stone = await fixture('stone-river.entry.json');
  const tower = await fixture('poker-chip-tower.entry.json');
  assert.equal(validateEntry(stone).valid, true);
  assert.equal(validateEntry(tower).valid, true);
  assert.equal(stone.break_ledger.find(({ outcome }) => outcome === 'SURRENDERED').territory_after.includes('scope-no-intent'), true);
  assert.equal(stone.variants[0].state, 'BRANCH');
  assert.equal(stone.extensions.some(({ id }) => id === 'extension-formation-memory'), true);
  assert.equal(tower.break_ledger[0].outcome, 'SURVIVED');
  assert.match(tower.does_not_carry.find(({ id }) => id === 'scope-no-rosette').text, /not a tower/u);
});

test('Experiment Zero is visibly uncontrolled and cannot count as cold', async () => {
  const zero = await fixture('experiment-zero.json');
  assert.equal(zero.controlled, false);
  assert.equal(zero.eligible_as_cold_run, false);
  assert.equal(zero.status, 'DESIGN_PROVENANCE');
  assert.ok(zero.contamination.length >= 4);
});
