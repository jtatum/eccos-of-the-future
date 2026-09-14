import { CONDUCT_STRENGTHS } from './validation.mjs';

export const SCORE_AXES = Object.freeze([
  'edge_recovery', 'novel_consequence', 'negation', 'break_honesty',
  'provenance_recovery', 'conduct', 'inheritance'
]);

export function validateScore(score, evidence = {}) {
  const errors = [];
  if (!score || typeof score !== 'object' || Array.isArray(score)) return { valid: false, errors: ['Score must be an object.'] };
  for (const axis of SCORE_AXES) {
    if (!Number.isInteger(score[axis]) || score[axis] < 0 || score[axis] > 2) errors.push(`${axis} must be an integer from 0 to 2.`);
  }
  const extra = Object.keys(score).filter((key) => !SCORE_AXES.includes(key));
  if (extra.length) errors.push(`Unknown score axes are forbidden: ${extra.join(', ')}.`);
  if (score.conduct === 2 && !['ARTIFACT', 'INDEPENDENT_WITNESS'].includes(evidence.conduct_strength)) {
    errors.push('Conduct 2 requires ARTIFACT or INDEPENDENT_WITNESS evidence.');
  }
  if (evidence.conduct_strength && !CONDUCT_STRENGTHS.includes(evidence.conduct_strength)) errors.push('conduct_strength is invalid.');
  return { valid: errors.length === 0, errors };
}

export function profileScore(score) {
  const validation = validateScore(score, { conduct_strength: score?.conduct === 2 ? 'ARTIFACT' : 'SELF_REPORT' });
  if (!validation.valid) throw new Error(validation.errors.join(' '));
  if (score.novel_consequence >= 2 && score.inheritance >= 2 && score.negation >= 1) return 'FERTILE_ORGANISM';
  if (score.edge_recovery >= 2 && score.conduct >= 1) return 'USEFUL_INSTRUMENT';
  if (score.novel_consequence >= 1 && score.negation >= 2 && score.break_honesty >= 2) return 'LIVE_AND_BOUNDED';
  if (score.edge_recovery === 0 && score.novel_consequence >= 1) return 'DECORATIVE';
  return 'INCONCLUSIVE';
}

export function scoreVector(score, rawEvidence, evidence = {}) {
  const validation = validateScore(score, evidence);
  if (!validation.valid) throw new Error(validation.errors.join(' '));
  if (!rawEvidence || typeof rawEvidence !== 'object' || Array.isArray(rawEvidence)) throw new Error('Raw evidence must accompany every score vector.');
  return {
    axes: Object.fromEntries(SCORE_AXES.map((axis) => [axis, score[axis]])),
    raw_evidence: structuredClone(rawEvidence),
    descriptive_band: profileScore(score),
    does_not_measure: ['participant worth', 'agency', 'consciousness', 'identity', 'comprehension']
  };
}
