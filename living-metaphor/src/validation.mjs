export const REGISTRY_SPEC = 'ecco-lmr/0.1';
export const EVENT_SPEC = 'ecco-lmr-event/0.1';
export const BUNDLE_SPEC = 'ecco-lmr-bundle/0.1';
export const SESSION_SPEC = 'ecco-lmr-session/0.1';

export const EVENT_TYPES = Object.freeze([
  'ENTRY_CREATED', 'EDGES_REVISED', 'EXTENSION_PROPOSED', 'EXTENSION_REVIEWED',
  'STRIKE_RECORDED', 'VARIANT_ATTESTED', 'VARIANT_REVIEWED', 'CONDUCT_RECORDED',
  'CUSTODIAN_INTERVENTION_RECORDED', 'REVIEW_STATE_CHANGED', 'CONTENT_TOMBSTONED'
]);
export const STRIKE_OUTCOMES = Object.freeze(['SURVIVED', 'SURRENDERED', 'REVISED', 'FRACTURED', 'UNRESOLVED']);
export const VARIANT_STATES = Object.freeze(['BRANCH', 'UNRESOLVED_DRIFT', 'DECAY']);
export const REVIEW_DECISIONS = Object.freeze(['PENDING', 'ACCEPTED', 'CONTESTED', 'REJECTED']);
export const REVIEW_STATES = Object.freeze(['ACTIVE', 'FOSSIL_WATCH', 'ARCHIVED', 'FRACTURED']);
export const CONDUCT_STRENGTHS = Object.freeze(['SELF_REPORT', 'ARTIFACT', 'INDEPENDENT_WITNESS']);
export const CUSTODIAN_ACTIONS = Object.freeze(['SELECTED', 'WITHHELD', 'CORRECTED', 'ATTRIBUTED', 'REORDERED', 'SUMMARIZED', 'CARRIED']);

const UNSAFE_KEYS = new Set([
  'system_prompt', 'hidden_prompt', 'chain_of_thought', 'credentials', 'credential',
  'password', 'api_key', 'access_token', 'private_memory', 'personal_data', 'proprietary_context'
]);

function object(value) {
  return value && typeof value === 'object' && !Array.isArray(value);
}

function text(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function time(value) {
  return text(value) && !Number.isNaN(Date.parse(value));
}

function allText(values) {
  return Array.isArray(values) && values.every(text);
}

function idTextArray(values, label, errors) {
  if (!Array.isArray(values) || values.length === 0) {
    errors.push(`${label} must be a non-empty array.`);
    return;
  }
  values.forEach((item, index) => {
    if (!object(item) || !text(item.id) || !text(item.text)) errors.push(`${label}[${index}] requires id and text.`);
  });
}

export function findUnsafeFields(value, path = '$', found = []) {
  if (Array.isArray(value)) {
    value.forEach((item, index) => findUnsafeFields(item, `${path}[${index}]`, found));
  } else if (object(value)) {
    for (const [key, child] of Object.entries(value)) {
      const normalized = key.toLowerCase().replaceAll('-', '_');
      if (UNSAFE_KEYS.has(normalized) || normalized.endsWith('_password') || normalized.endsWith('_secret')) {
        found.push(`${path}.${key}`);
      }
      findUnsafeFields(child, `${path}.${key}`, found);
    }
  }
  return found;
}

export function validateEntry(entry) {
  const errors = [];
  if (!object(entry)) return { valid: false, errors: ['Entry must be an object.'] };
  if (entry.spec !== REGISTRY_SPEC) errors.push(`Entry spec must be ${REGISTRY_SPEC}.`);
  for (const field of ['id', 'address', 'created_at', 'updated_at']) if (!text(entry[field])) errors.push(`Entry requires ${field}.`);
  if (entry.created_at && !time(entry.created_at)) errors.push('created_at must be RFC3339-compatible.');
  if (entry.updated_at && !time(entry.updated_at)) errors.push('updated_at must be RFC3339-compatible.');
  if (!Array.isArray(entry.kind_pressure) || !entry.kind_pressure.length || entry.kind_pressure.some((kind) => !['RULE', 'STANCE'].includes(kind))) {
    errors.push('kind_pressure must contain RULE and/or STANCE.');
  }
  if (!object(entry.origin_scene) || !text(entry.origin_scene.summary) || !text(entry.origin_scene.occurred_at) || !allText(entry.origin_scene.contributors)) {
    errors.push('origin_scene requires summary, occurred_at, and contributor handles.');
  }
  idTextArray(entry.carries, 'carries', errors);
  idTextArray(entry.does_not_carry, 'does_not_carry', errors);
  idTextArray(entry.parity, 'parity', errors);
  for (const field of ['extensions', 'break_ledger', 'variants', 'conduct_events', 'custodian_interventions']) {
    if (!Array.isArray(entry[field])) errors.push(`${field} must be an array.`);
  }
  if (!REVIEW_STATES.includes(entry.review_state)) errors.push(`review_state must be ${REVIEW_STATES.join(', ')}.`);
  entry.extensions?.forEach((extension, index) => {
    if (!object(extension) || !text(extension.id) || !text(extension.novel_case) || !text(extension.consequence)) errors.push(`extensions[${index}] is incomplete.`);
    if (!REVIEW_DECISIONS.includes(extension.review)) errors.push(`extensions[${index}].review is invalid.`);
    if (!allText(extension.parity_readback) || !Array.isArray(extension.scope_readback)) errors.push(`extensions[${index}] requires parity and scope readback.`);
  });
  entry.break_ledger?.forEach((strike, index) => {
    if (!object(strike) || !text(strike.id) || !text(strike.proposed_break) || !text(strike.reason)) errors.push(`break_ledger[${index}] is incomplete.`);
    if (!STRIKE_OUTCOMES.includes(strike.outcome)) errors.push(`break_ledger[${index}].outcome is invalid.`);
    if (strike.outcome === 'SURRENDERED' && (!allText(strike.territory_before) || !allText(strike.territory_after))) {
      errors.push(`break_ledger[${index}] SURRENDERED requires territory_before and territory_after.`);
    }
  });
  entry.variants?.forEach((variant, index) => {
    if (!object(variant) || !text(variant.id) || !text(variant.text) || !text(variant.parent_text) || !text(variant.introduced_by)) errors.push(`variants[${index}] is incomplete.`);
    if (!VARIANT_STATES.includes(variant.state)) errors.push(`variants[${index}].state is invalid.`);
    if (variant.state === 'DECAY' && !text(variant.consequential_misapplication)) errors.push(`variants[${index}] DECAY requires consequential_misapplication.`);
    if (variant.state === 'UNRESOLVED_DRIFT' && text(variant.recovered_transformation)) errors.push(`variants[${index}] unresolved drift cannot claim a recovered transformation.`);
  });
  entry.conduct_events?.forEach((conduct, index) => {
    if (!object(conduct) || !text(conduct.id) || !text(conduct.actor) || !text(conduct.decision_context) || !text(conduct.observed_change)) errors.push(`conduct_events[${index}] is incomplete.`);
    if (!CONDUCT_STRENGTHS.includes(conduct.strength)) errors.push(`conduct_events[${index}].strength is invalid.`);
    if (conduct.score === 2 && !['ARTIFACT', 'INDEPENDENT_WITNESS'].includes(conduct.strength)) errors.push(`conduct_events[${index}] score 2 requires inspectable evidence.`);
  });
  entry.custodian_interventions?.forEach((intervention, index) => {
    if (!object(intervention) || !text(intervention.id) || !text(intervention.custodian) || !text(intervention.description) || !text(intervention.possible_effect)) errors.push(`custodian_interventions[${index}] is incomplete.`);
    if (!CUSTODIAN_ACTIONS.includes(intervention.action)) errors.push(`custodian_interventions[${index}].action is invalid.`);
  });
  const expectedFailure = [...(entry.break_ledger ?? [])].reverse().find(({ outcome }) => ['SURRENDERED', 'REVISED', 'FRACTURED'].includes(outcome))?.struck_at ?? null;
  if ((entry.last_failed_at ?? null) !== expectedFailure) errors.push('last_failed_at must derive from the latest SURRENDERED, REVISED, or FRACTURED strike.');
  const unsafe = findUnsafeFields(entry);
  if (unsafe.length) errors.push(`Unsafe private fields are forbidden: ${unsafe.join(', ')}.`);
  return { valid: errors.length === 0, errors };
}

export function validateEvent(event) {
  const errors = [];
  if (!object(event)) return { valid: false, errors: ['Event must be an object.'] };
  if (event.spec !== EVENT_SPEC) errors.push(`Event spec must be ${EVENT_SPEC}.`);
  for (const field of ['entry_id', 'event_id', 'actor', 'receipt_time', 'digest']) if (!text(event[field])) errors.push(`Event requires ${field}.`);
  if (!time(event.receipt_time)) errors.push('receipt_time must be RFC3339-compatible and is only a receipt time.');
  if (!EVENT_TYPES.includes(event.type)) errors.push('Event type is invalid.');
  if (!(event.parent_event_digest === null || text(event.parent_event_digest))) errors.push('parent_event_digest must be null or a digest.');
  if (!object(event.payload)) errors.push('Event payload must be a public-safe object.');
  const unsafe = findUnsafeFields(event.payload);
  if (unsafe.length) errors.push(`Unsafe private fields are forbidden: ${unsafe.join(', ')}.`);
  return { valid: errors.length === 0, errors };
}

export function assertValid(report, label = 'Artifact') {
  if (!report.valid) throw new Error(`${label} invalid: ${report.errors.join(' ')}`);
  return report;
}
