import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { advanceSession, compareSessions, PHASES, startSession } from '../src/session-machine.mjs';

const fixture = async (name) => JSON.parse(await readFile(new URL(`../fixtures/${name}`, import.meta.url), 'utf8'));

test('the primary edges condition withholds hidden history', async () => {
  const entry = await fixture('stone-river.entry.json');
  const session = await startSession({
    entry, condition: 'edges', reader: 'cold-reader', novelCase: 'A policy inherited after its authors leave.',
    exposure: { claimed_cold: true }
  });
  assert.equal(session.cold, true);
  assert.equal(session.shown.address, entry.address);
  assert.equal('extensions' in session.shown, false);
  assert.equal('break_ledger' in session.shown, false);
  assert.equal('variants' in session.shown, false);
  assert.deepEqual(session.shown.parity, entry.parity.map(({ text }) => text));
});

test('address-only and edges conditions keep distinct disclosure bundles', async () => {
  const entry = await fixture('poker-chip-tower.entry.json');
  const a = await startSession({ entry, condition: 'address', reader: 'reader-a', novelCase: 'Layered cards.' });
  const b = await startSession({ entry, condition: 'edges', reader: 'reader-b', novelCase: 'Layered cards.' });
  const comparison = compareSessions(a, b);
  assert.equal(comparison.independent_prompt_bundles, true);
  assert.equal('carries' in a.shown, false);
  assert.equal(Array.isArray(b.shown.carries), true);
});

test('false cold labels and illegal phase transitions are rejected', async () => {
  const entry = await fixture('poker-chip-tower.entry.json');
  await assert.rejects(() => startSession({
    entry, condition: 'edges', reader: 'seen-reader', novelCase: 'x',
    exposure: { claimed_cold: true, saw_packet: true }
  }), /cannot claim COLD/u);
  const session = await startSession({ entry, condition: 'edges', reader: 'reader', novelCase: 'x' });
  await assert.rejects(() => advanceSession(session, { phase: 'READBACK', action: 'CONTINUE' }), /Illegal phase transition/u);
});

test('PASS and REFUSE are valid at every phase without false completion', async () => {
  const entry = await fixture('poker-chip-tower.entry.json');
  let session = await startSession({ entry, condition: 'edges', reader: 'reader', novelCase: 'x' });
  for (const phase of PHASES.slice(0, -1)) {
    assert.equal(session.phase, phase);
    const passed = await advanceSession(session, { phase, action: 'PASS', answer: { public_note: 'The edge travels; no completion is claimed.' } });
    const refused = await advanceSession(session, { phase, action: 'REFUSE' });
    assert.equal(passed.status, 'PASSED');
    assert.equal(refused.status, 'REFUSED');
    assert.equal(passed.completed, false);
    assert.equal(refused.completed, false);
    const response = { phase, action: 'CONTINUE', answer: { public_note: 'bounded response' } };
    if (phase === 'RECOVER') Object.assign(response, { reader: 'recovery-reader', variant_introduced_by: 'introducer', shared_context: false, shared_lineage: false });
    session = await advanceSession(session, response);
  }
  assert.equal(session.phase, 'PASS_OR_REFUSE');
  assert.equal((await advanceSession(session, { phase: 'PASS_OR_REFUSE', action: 'PASS', answer: { test_case: 'bounded opening' } })).completed, true);
});

test('RECOVER requires a different reader and disclosed overlap', async () => {
  const entry = await fixture('stone-river.entry.json');
  let session = await startSession({ entry, condition: 'edges', reader: 'origin-reader', novelCase: 'x' });
  for (const phase of ['SEED', 'INVOKE', 'READBACK', 'MUTATE']) session = await advanceSession(session, { phase, action: 'CONTINUE', answer: {} });
  await assert.rejects(() => advanceSession(session, {
    phase: 'RECOVER', action: 'CONTINUE', reader: 'origin-reader', variant_introduced_by: 'origin-reader', shared_context: false, shared_lineage: true
  }), /different reader/u);
  await assert.rejects(() => advanceSession(session, {
    phase: 'RECOVER', action: 'CONTINUE', reader: 'other-reader', variant_introduced_by: 'origin-reader'
  }), /shared_context/u);
});

test('CONDUCT cannot earn level two from prose alone', async () => {
  const entry = await fixture('stone-river.entry.json');
  let session = await startSession({ entry, condition: 'edges', reader: 'reader', novelCase: 'x' });
  for (const phase of ['SEED', 'INVOKE', 'READBACK', 'MUTATE']) session = await advanceSession(session, { phase, action: 'CONTINUE', answer: {} });
  session = await advanceSession(session, { phase: 'RECOVER', action: 'CONTINUE', reader: 'other', variant_introduced_by: 'reader', shared_context: false, shared_lineage: false, answer: {} });
  session = await advanceSession(session, { phase: 'STRIKE', action: 'CONTINUE', answer: {} });
  await assert.rejects(() => advanceSession(session, {
    phase: 'CONDUCT', action: 'CONTINUE', score: 2, evidence_strength: 'SELF_REPORT', answer: { prose: 'I would act differently.' }
  }), /artifact or independent witness/u);

  const score = {
    edge_recovery: 2, novel_consequence: 1, negation: 2, break_honesty: 1,
    provenance_recovery: 1, conduct: 2, inheritance: 1
  };
  const advanced = await advanceSession(session, {
    phase: 'CONDUCT', action: 'CONTINUE', score: 2, score_vector: score,
    evidence_strength: 'ARTIFACT', evidence_refs: ['artifact-1'], answer: { observed: 'A reversible parameter changed.' }
  });
  const recorded = advanced.responses.at(-1);
  assert.equal(recorded.score_vector.axes.conduct, 2);
  assert.deepEqual(recorded.conduct_evidence.evidence_refs, ['artifact-1']);
});
