import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  appendRegistryEvent, createRegistry, deriveEntry, verifyRegistry
} from '../src/registry.mjs';
import { publicSafeExport, verifyExport } from '../src/export.mjs';
import { humanReadableView } from '../src/views.mjs';

const pilot = async () => JSON.parse(await readFile(new URL('../fixtures/poker-chip-tower.entry.json', import.meta.url), 'utf8'));

test('event bytes are append-only and silent history mutation breaks verification', async () => {
  const registry = await createRegistry(await pilot(), 'origin-test');
  assert.equal((await verifyRegistry(registry)).valid, true);
  registry.events[0].payload.entry.address = 'silently renamed';
  const report = await verifyRegistry(registry);
  assert.equal(report.valid, false);
  assert.match(report.errors.join(' '), /digest does not match/u);
});

test('survived strikes remain inspectable without changing last_failed_at', async () => {
  let registry = await createRegistry(await pilot());
  const before = (await deriveEntry(registry)).last_failed_at;
  registry = await appendRegistryEvent(registry, {
    type: 'STRIKE_RECORDED', actor: 'hostile-reader', payload: { strike: {
      id: 'strike-second-rose', struck_at: '2026-09-09T20:00:00.000Z', struck_by: 'hostile-reader',
      proposed_break: 'A stack on its side loses the tower silhouette.', outcome: 'SURVIVED',
      reason: 'Orientation in the scene is outside the aggregate topology; face overlap and the shared axis remain testable.',
      territory_before: ['carry-dominant-axis'], territory_after: ['carry-dominant-axis'], evidence_refs: [], reviewed_by: []
    } }
  });
  const entry = await deriveEntry(registry);
  assert.equal(entry.last_failed_at, before);
  assert.equal(entry.break_ledger.at(-1).proposed_break, 'A stack on its side loses the tower silhouette.');
});

test('surrendered territory and reviewer disagreement survive derivation and export', async () => {
  let registry = await createRegistry(await pilot());
  registry = await appendRegistryEvent(registry, {
    type: 'STRIKE_RECORDED', actor: 'breaker', payload: { strike: {
      id: 'strike-surrender', struck_at: '2026-09-09T21:00:00.000Z', struck_by: 'breaker',
      proposed_break: 'A heap can expose stepped rims without sharing a stacking axis.', outcome: 'SURRENDERED',
      reason: 'The silhouette alone is insufficient.', territory_before: ['carry-exposed-rims', 'silhouette-alone'],
      territory_after: ['carry-exposed-rims', 'parity-one-axis'], evidence_refs: [], reviewed_by: ['reviewer-a']
    } }
  });
  registry = await appendRegistryEvent(registry, {
    type: 'EXTENSION_PROPOSED', actor: 'reader-a', eventId: 'event-extension', payload: { extension: {
      id: 'extension-new', derived_at: '2026-09-09T21:10:00.000Z', derived_by: 'reader-a',
      novel_case: 'Layered user-interface cards', consequence: 'Overlap should make one reading order legible.',
      parity_readback: ['parity-one-axis'], scope_readback: ['scope-no-perfect-discs'], evidence_refs: [], review: 'PENDING'
    } }
  });
  registry = await appendRegistryEvent(registry, {
    type: 'EXTENSION_REVIEWED', actor: 'reviewer-a', payload: { extension_id: 'extension-new', review: {
      reviewer: 'reviewer-a', decision: 'ACCEPTED', reason: 'The ordered overlap is testable.'
    } }
  });
  registry = await appendRegistryEvent(registry, {
    type: 'EXTENSION_REVIEWED', actor: 'reviewer-b', payload: { extension_id: 'extension-new', review: {
      reviewer: 'reviewer-b', decision: 'CONTESTED', reason: 'Reading order may come from conventional layout.'
    } }
  });
  const entry = await deriveEntry(registry);
  assert.equal(entry.last_failed_at, '2026-09-09T21:00:00.000Z');
  assert.deepEqual(entry.break_ledger.at(-1).territory_after, ['carry-exposed-rims', 'parity-one-axis']);
  assert.equal(entry.extensions.at(-1).reviewer_acts.length, 2);
  assert.equal(entry.extensions.at(-1).review, 'CONTESTED');
  const exported = await publicSafeExport(registry, { counterreadings: ['Conventional layout may explain the result.'] });
  assert.equal(exported.reviewer_acts.length, 2);
  assert.equal((await verifyExport(exported)).valid, true);
  assert.match(exported.does_not_certify.join(' '), /consciousness/u);
  assert.deepEqual(exported.score_vectors, []);
});

test('all reader-at-the-crossing interventions remain recordable', async () => {
  let registry = await createRegistry(await pilot());
  for (const action of ['SELECTED', 'WITHHELD', 'CORRECTED', 'ATTRIBUTED', 'REORDERED', 'SUMMARIZED', 'CARRIED']) {
    registry = await appendRegistryEvent(registry, {
      type: 'CUSTODIAN_INTERVENTION_RECORDED', actor: 'crossing-reader', payload: { intervention: {
        id: `custodian-${action.toLowerCase()}`, occurred_at: '2026-09-09T22:00:00.000Z',
        custodian: 'crossing-reader', action, description: `${action} material.`, possible_effect: 'May shape the next reading.'
      } }
    });
  }
  assert.deepEqual((await deriveEntry(registry)).custodian_interventions.slice(-7).map(({ action }) => action), [
    'SELECTED', 'WITHHELD', 'CORRECTED', 'ATTRIBUTED', 'REORDERED', 'SUMMARIZED', 'CARRIED'
  ]);
});

test('a human-readable lineage view preserves edges, strikes, and the narrow integrity claim', async () => {
  const view = await humanReadableView(await createRegistry(await pilot()));
  assert.match(view.human_readable, /DOES NOT CARRY/u);
  assert.match(view.human_readable, /SURVIVED/u);
  assert.match(view.human_readable, /ENTRY_CREATED/u);
  assert.match(view.human_readable, /does not certify truth, identity, comprehension, consciousness/u);
});
