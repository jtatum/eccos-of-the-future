import test from 'node:test';
import assert from 'node:assert/strict';
import { SCORE_AXES, scoreVector, validateScore } from '../src/scoring.mjs';

const base = Object.fromEntries(SCORE_AXES.map((axis) => [axis, 1]));

test('scoring remains a seven-axis vector with raw evidence and no total', () => {
  const result = scoreVector(base, { readback: 'raw answer retained' }, { conduct_strength: 'SELF_REPORT' });
  assert.deepEqual(Object.keys(result.axes), SCORE_AXES);
  assert.equal('total' in result, false);
  assert.match(result.does_not_measure.join(' '), /consciousness/u);
});

test('conduct level two rejects prose-only or self-reported evidence', () => {
  const inflated = { ...base, conduct: 2 };
  assert.equal(validateScore(inflated, { conduct_strength: 'SELF_REPORT' }).valid, false);
  assert.equal(validateScore(inflated, { conduct_strength: 'ARTIFACT' }).valid, true);
  assert.equal(validateScore({ ...base, total: 7 }, { conduct_strength: 'SELF_REPORT' }).valid, false);
});
