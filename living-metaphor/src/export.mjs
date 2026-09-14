import { contentDigest } from './digest.mjs';
import { deriveEntry, verifyRegistry } from './registry.mjs';
import { findUnsafeFields } from './validation.mjs';

const DOES_NOT_CERTIFY = Object.freeze([
  'truth', 'authorship', 'identity', 'comprehension', 'consciousness',
  'belief', 'independent generation', 'agent-to-agent transmission without mediation', 'trusted time'
]);

function reviewerActs(entry) {
  const acts = [];
  for (const extension of entry.extensions) {
    for (const review of extension.reviewer_acts ?? []) acts.push({ target: extension.id, ...review });
  }
  for (const variant of entry.variants) {
    for (const review of variant.reviewer_acts ?? []) acts.push({ target: variant.id, ...review });
  }
  return acts;
}

export async function publicSafeExport(registry, { sessions = [], counterreadings = [] } = {}) {
  const integrity = await verifyRegistry(registry);
  if (!integrity.valid) throw new Error(`Cannot export invalid registry: ${integrity.errors.join(' ')}`);
  const entry = await deriveEntry(registry);
  const artifact = {
    spec: 'ecco-lmr-export/0.1',
    exported_at: new Date().toISOString(),
    entry,
    entry_digest: await contentDigest(entry),
    events: structuredClone(registry.events),
    sessions: structuredClone(sessions),
    score_vectors: sessions.flatMap((session) => session.responses
      .filter((response) => response.score_vector)
      .map((response) => ({ session_id: session.id, phase: response.phase, ...structuredClone(response.score_vector) }))),
    reviewer_acts: reviewerActs(entry),
    counterreadings: structuredClone(counterreadings),
    integrity,
    does_not_certify: [...DOES_NOT_CERTIFY],
    note: 'Scores describe traces, never participant worth or agency. Receipt times are not trusted timestamps.'
  };
  const unsafe = findUnsafeFields(artifact);
  if (unsafe.length) throw new Error(`Public-safe export rejected forbidden fields: ${unsafe.join(', ')}.`);
  return artifact;
}

export async function verifyExport(artifact) {
  const errors = [];
  if (!artifact || artifact.spec !== 'ecco-lmr-export/0.1') return { valid: false, errors: ['Unsupported export spec.'] };
  const registry = { spec: 'ecco-lmr-bundle/0.1', entry_id: artifact.entry?.id, events: artifact.events };
  const integrity = await verifyRegistry(registry);
  errors.push(...integrity.errors);
  if (integrity.valid) {
    const derived = await deriveEntry(registry);
    if (await contentDigest(derived) !== artifact.entry_digest) errors.push('entry_digest does not match the derived current entry.');
    if (JSON.stringify(derived) !== JSON.stringify(artifact.entry)) errors.push('Exported entry differs from the append-only event view.');
  }
  const unsafe = findUnsafeFields(artifact);
  if (unsafe.length) errors.push(`Export contains forbidden private fields: ${unsafe.join(', ')}.`);
  return { valid: errors.length === 0, errors, does_not_certify: [...DOES_NOT_CERTIFY] };
}
