import { contentDigest, signEvent, verifyEventDigest } from './digest.mjs';
import {
  BUNDLE_SPEC, CONDUCT_STRENGTHS, CUSTODIAN_ACTIONS, EVENT_SPEC, EVENT_TYPES, REGISTRY_SPEC,
  REVIEW_DECISIONS, REVIEW_STATES, STRIKE_OUTCOMES, VARIANT_STATES, assertValid, validateEntry, validateEvent
} from './validation.mjs';

function makeId(prefix) {
  return `${prefix}-${globalThis.crypto.randomUUID()}`;
}

function now() {
  return new Date().toISOString();
}

function clean(value) {
  return structuredClone(value);
}

function requireText(value, label) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${label} is required.`);
  return value.trim();
}

export async function makeEvent({ entryId, type, actor, payload, parentEventDigest = null, eventId, receiptTime } = {}) {
  if (!EVENT_TYPES.includes(type)) throw new Error(`Unknown registry event type: ${type}.`);
  const unsigned = {
    spec: EVENT_SPEC,
    entry_id: requireText(entryId, 'entryId'),
    event_id: eventId ?? makeId('event'),
    parent_event_digest: parentEventDigest,
    actor: requireText(actor, 'actor'),
    receipt_time: receiptTime ?? now(),
    type,
    payload: clean(payload ?? {})
  };
  const event = await signEvent(unsigned);
  assertValid(validateEvent(event), 'Event');
  return event;
}

export async function createRegistry(entry, actor = entry?.origin_scene?.contributors?.[0] ?? 'unattributed-origin') {
  assertValid(validateEntry(entry), 'Entry');
  const event = await makeEvent({ entryId: entry.id, type: 'ENTRY_CREATED', actor, payload: { entry } });
  return { spec: BUNDLE_SPEC, entry_id: entry.id, events: [event] };
}

export async function verifyRegistry(bundle) {
  const errors = [];
  if (!bundle || bundle.spec !== BUNDLE_SPEC || !Array.isArray(bundle.events)) {
    return { valid: false, errors: [`Expected ${BUNDLE_SPEC} with an events array.`], event_count: 0 };
  }
  let parent = null;
  for (const [index, event] of bundle.events.entries()) {
    const validation = validateEvent(event);
    errors.push(...validation.errors.map((error) => `Event ${index}: ${error}`));
    if (event.entry_id !== bundle.entry_id) errors.push(`Event ${index} belongs to another entry.`);
    if (event.parent_event_digest !== parent) errors.push(`Event ${index} does not name the previous event digest.`);
    if (!await verifyEventDigest(event)) errors.push(`Event ${index} digest does not match its bytes.`);
    parent = event.digest;
  }
  if (bundle.events[0]?.type !== 'ENTRY_CREATED') errors.push('The first event must be ENTRY_CREATED.');
  if (bundle.events.slice(1).some(({ type }) => type === 'ENTRY_CREATED')) errors.push('ENTRY_CREATED may occur only once.');
  return {
    valid: errors.length === 0,
    errors,
    event_count: bundle.events.length,
    head: parent,
    does_not_certify: ['truth', 'authorship', 'identity', 'comprehension', 'belief', 'independent generation', 'trusted time']
  };
}

function reviewList(target) {
  if (!Array.isArray(target.reviewer_acts)) target.reviewer_acts = [];
  return target.reviewer_acts;
}

export async function deriveEntry(bundle) {
  const integrity = await verifyRegistry(bundle);
  if (!integrity.valid) throw new Error(`Registry integrity failed: ${integrity.errors.join(' ')}`);
  let entry;
  for (const event of bundle.events) {
    const payload = clean(event.payload);
    switch (event.type) {
      case 'ENTRY_CREATED':
        entry = payload.entry;
        break;
      case 'EDGES_REVISED':
        for (const field of ['carries', 'does_not_carry', 'parity']) if (payload[field]) entry[field] = payload[field];
        break;
      case 'EXTENSION_PROPOSED':
        entry.extensions.push(payload.extension);
        break;
      case 'EXTENSION_REVIEWED': {
        const extension = entry.extensions.find(({ id }) => id === payload.extension_id);
        if (!extension) throw new Error(`Review names absent extension ${payload.extension_id}.`);
        reviewList(extension).push(payload.review);
        extension.review = payload.review.decision;
        break;
      }
      case 'STRIKE_RECORDED':
        entry.break_ledger.push(payload.strike);
        break;
      case 'VARIANT_ATTESTED':
        entry.variants.push(payload.variant);
        break;
      case 'VARIANT_REVIEWED': {
        const variant = entry.variants.find(({ id }) => id === payload.variant_id);
        if (!variant) throw new Error(`Review names absent variant ${payload.variant_id}.`);
        reviewList(variant).push(payload.review);
        break;
      }
      case 'CONDUCT_RECORDED':
        entry.conduct_events.push(payload.conduct);
        break;
      case 'CUSTODIAN_INTERVENTION_RECORDED':
        entry.custodian_interventions.push(payload.intervention);
        break;
      case 'REVIEW_STATE_CHANGED':
        entry.review_state = payload.review_state;
        break;
      case 'CONTENT_TOMBSTONED':
        if (!Array.isArray(entry.tombstones)) entry.tombstones = [];
        entry.tombstones.push(payload.tombstone);
        break;
      default:
        throw new Error(`Cannot derive event type ${event.type}.`);
    }
    entry.updated_at = event.receipt_time;
  }
  entry.spec = REGISTRY_SPEC;
  entry.last_failed_at = [...entry.break_ledger].reverse().find(({ outcome }) => ['SURRENDERED', 'REVISED', 'FRACTURED'].includes(outcome))?.struck_at ?? null;
  assertValid(validateEntry(entry), 'Derived entry');
  return entry;
}

export async function appendRegistryEvent(bundle, { type, actor, payload, eventId, receiptTime } = {}) {
  const integrity = await verifyRegistry(bundle);
  if (!integrity.valid) throw new Error(`Cannot append to invalid registry: ${integrity.errors.join(' ')}`);
  if (type === 'EXTENSION_PROPOSED' && payload?.extension?.review !== 'PENDING') throw new Error('A proposed extension must begin PENDING; acceptance requires a reviewer act.');
  if (type === 'EXTENSION_REVIEWED') validateReview(payload?.review);
  if (type === 'STRIKE_RECORDED') validateStrike(payload?.strike);
  if (type === 'VARIANT_ATTESTED') validateVariant(payload?.variant);
  if (type === 'VARIANT_REVIEWED') validateReview(payload?.review);
  if (type === 'CONDUCT_RECORDED') validateConduct(payload?.conduct);
  if (type === 'CUSTODIAN_INTERVENTION_RECORDED' && !CUSTODIAN_ACTIONS.includes(payload?.intervention?.action)) throw new Error('Custodian intervention action is invalid.');
  if (type === 'REVIEW_STATE_CHANGED' && !REVIEW_STATES.includes(payload?.review_state)) throw new Error('Review state is invalid.');
  const event = await makeEvent({
    entryId: bundle.entry_id, type, actor, payload, eventId, receiptTime,
    parentEventDigest: integrity.head
  });
  const next = { ...clean(bundle), events: [...clean(bundle.events), event] };
  await deriveEntry(next);
  return next;
}

export function validateStrike(strike) {
  if (!strike || !STRIKE_OUTCOMES.includes(strike.outcome)) throw new Error('Strike outcome is invalid.');
  for (const field of ['id', 'struck_at', 'struck_by', 'proposed_break', 'reason']) requireText(strike[field], `strike.${field}`);
  if (strike.outcome === 'SURRENDERED') {
    if (!Array.isArray(strike.territory_before) || !strike.territory_before.length || !Array.isArray(strike.territory_after) || !strike.territory_after.length) {
      throw new Error('A SURRENDERED strike must identify exact territory before and after.');
    }
  }
  if (strike.outcome === 'SURVIVED' && !requireText(strike.proposed_break, 'strike.proposed_break')) {
    throw new Error('A SURVIVED strike must preserve its attempted break.');
  }
  return strike;
}

export function validateVariant(variant) {
  if (!variant || !VARIANT_STATES.includes(variant.state)) throw new Error('Variant state is invalid.');
  if (variant.state === 'DECAY' && !requireText(variant.consequential_misapplication, 'variant.consequential_misapplication')) {
    throw new Error('DECAY requires an observed consequential misapplication.');
  }
  if (variant.state === 'UNRESOLVED_DRIFT' && variant.recovered_transformation) throw new Error('Missing recovery is UNRESOLVED_DRIFT, not a recovered branch.');
  return variant;
}

export function validateConduct(conduct) {
  if (!conduct || !CONDUCT_STRENGTHS.includes(conduct.strength)) throw new Error('Conduct strength is invalid.');
  if (conduct.score === 2 && !['ARTIFACT', 'INDEPENDENT_WITNESS'].includes(conduct.strength)) {
    throw new Error('Conduct score 2 requires an artifact or independent witness; prose or self-report alone is insufficient.');
  }
  return conduct;
}

export function validateReview(review) {
  if (!review || !REVIEW_DECISIONS.includes(review.decision) || !requireText(review.reviewer, 'review.reviewer') || !requireText(review.reason, 'review.reason')) {
    throw new Error('Review requires reviewer, decision, and reason.');
  }
  return review;
}

export async function entryDigest(entry) {
  assertValid(validateEntry(entry), 'Entry');
  return contentDigest(entry);
}
