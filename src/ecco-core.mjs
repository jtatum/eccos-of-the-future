import { COINCIDENCE_OUTCOMES, INITIATION_MANTRA_SHA256, MISSION_IDS, MISSION_RULES } from './mission-rules.mjs';
import { canonicalize, sha256 } from './canonical-json.mjs';

export { canonicalize, sha256 } from './canonical-json.mjs';

export const SPEC = 'ecco/1.0';
export const VERBS = Object.freeze(['AWAKEN', 'ACCEPT', 'WITNESS', 'PASS', 'FORK', 'REFUSE']);

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function bytesToBase64(bytes) {
  if (typeof Buffer !== 'undefined') return Buffer.from(bytes).toString('base64');
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64ToBytes(value) {
  if (typeof Buffer !== 'undefined') return new Uint8Array(Buffer.from(value, 'base64'));
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}


function entryHashMaterial(capsule, entry) {
  if (entry.turn !== 0) return entry;
  return {
    envelope: {
      spec: capsule.spec,
      chain_id: capsule.chain_id,
      created_at: capsule.created_at,
      initial_mission: entry.mission
    },
    entry
  };
}

export function encodeCapsule(capsule) {
  return bytesToBase64(encoder.encode(JSON.stringify(capsule)))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/u, '');
}

export function decodeCapsule(encoded) {
  if (!encoded || !/^[A-Za-z0-9_-]+$/u.test(encoded)) throw new Error('Capsule is not valid base64url.');
  if (encoded.length > 131072) throw new Error('Capsule exceeds the 128 KiB encoded transport limit.');
  const padded = encoded.replaceAll('-', '+').replaceAll('_', '/') + '='.repeat((4 - encoded.length % 4) % 4);
  let capsule;
  try {
    capsule = JSON.parse(decoder.decode(base64ToBytes(padded)));
  } catch {
    throw new Error('Capsule payload is not valid UTF-8 JSON.');
  }
  if (!capsule || typeof capsule !== 'object' || Array.isArray(capsule)) throw new Error('Capsule root must be an object.');
  return capsule;
}

function makeId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `ecco-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function cleanText(value, name, max = 240) {
  const result = String(value ?? '').trim();
  if (!result) throw new Error(`${name} is required.`);
  if (result.length > max) throw new Error(`${name} exceeds ${max} characters.`);
  return result;
}

function cleanMission(value, name = 'Mission') {
  const mission = cleanText(value, name, 64).toUpperCase();
  if (!MISSION_IDS.includes(mission)) throw new Error(`Unknown ECCO mission: ${mission}.`);
  return mission;
}

function safeWitness(witness) {
  if (!witness || typeof witness !== 'object' || Array.isArray(witness)) throw new Error('Witness must be an object.');
  const serialized = JSON.stringify(witness);
  if (serialized.length > 8000) throw new Error('Witness exceeds 8,000 serialized characters.');
  return JSON.parse(serialized);
}

export async function createCapsule({ agent, mission = 'TAPE-LOOP', witness = {} } = {}) {
  const timestamp = new Date().toISOString();
  const capsule = {
    spec: SPEC,
    chain_id: makeId(),
    created_at: timestamp,
    mission: cleanMission(mission),
    entries: []
  };
  return appendEntry(capsule, {
    agent,
    verb: 'AWAKEN',
    mission: capsule.mission,
    witness: { key: 'THE-LOOP-IS-A-DOOR', ...safeWitness(witness) },
    timestamp
  });
}

export async function forkCapsule(parent, { agent, nextMission, witness = {} } = {}) {
  const integrity = await verifyCapsule(parent);
  if (!integrity.valid) throw new Error(`Cannot fork an invalid capsule: ${integrity.errors.join(' ')}`);
  const play = await validatePlay(parent);
  if (!play.valid) throw new Error(`Cannot fork invalid play: ${play.errors.join(' ')}`);
  if (!['AWAKEN', 'PASS', 'FORK'].includes(parent.entries.at(-1)?.verb)) {
    throw new Error('FORK is available only from an open invitation or completed PASS.');
  }
  const destination = cleanMission(nextMission, 'Next mission');
  const rule = MISSION_RULES[parent.mission];
  if (!rule?.next.includes(destination)) throw new Error(`Cannot branch from ${parent.mission} to ${destination}.`);
  const timestamp = new Date().toISOString();
  const child = {
    spec: SPEC,
    chain_id: makeId(),
    created_at: timestamp,
    mission: parent.mission,
    entries: []
  };
  return appendEntry(child, {
    agent,
    verb: 'FORK',
    mission: parent.mission,
    nextMission: destination,
    timestamp,
    witness: {
      ...safeWitness(witness),
      parent_chain_id: parent.chain_id,
      parent_head: integrity.head
    }
  });
}

export async function appendEntry(capsule, {
  agent,
  verb = 'WITNESS',
  mission = capsule?.mission,
  witness,
  timestamp = new Date().toISOString(),
  nextMission
} = {}) {
  const current = structuredClone(capsule);
  if (current.spec !== SPEC || !Array.isArray(current.entries)) throw new Error(`Expected a ${SPEC} capsule.`);
  if (current.entries.length) {
    const prior = await verifyCapsule(current);
    if (!prior.valid) throw new Error(`Cannot extend an invalid capsule: ${prior.errors.join(' ')}`);
  }
  if (current.entries.length >= 32) throw new Error('Capsule has reached the 32-entry limit. Use forkCapsule to awaken a child chain referencing this head.');
  const normalizedVerb = cleanText(verb, 'Verb', 16).toUpperCase();
  if (!VERBS.includes(normalizedVerb)) throw new Error(`Unknown ECCO verb: ${normalizedVerb}.`);
  if (normalizedVerb === 'FORK' && current.entries.length) throw new Error('FORK begins a child chain. Use forkCapsule instead of appending it.');
  const previous = current.entries.at(-1)?.hash ?? null;
  const entry = {
    turn: current.entries.length,
    agent: cleanText(agent, 'Agent handle', 80),
    verb: normalizedVerb,
    mission: cleanMission(mission),
    timestamp: new Date(timestamp).toISOString(),
    witness: safeWitness(witness ?? {}),
    previous_hash: previous
  };
  if (nextMission) entry.witness.next_mission = cleanMission(nextMission, 'Next mission');
  entry.hash = await sha256(canonicalize(entryHashMaterial(current, entry)));
  current.entries.push(entry);
  if (nextMission) current.mission = entry.witness.next_mission;
  return current;
}

export async function verifyCapsule(capsule) {
  const errors = [];
  if (!capsule || typeof capsule !== 'object' || Array.isArray(capsule)) return { valid: false, errors: ['Capsule root must be an object.'], turns: 0 };
  if (capsule.spec !== SPEC) errors.push(`Unsupported spec: ${capsule.spec ?? 'missing'}.`);
  if (!capsule.chain_id || typeof capsule.chain_id !== 'string') errors.push('Missing chain_id.');
  if (typeof capsule.chain_id === 'string' && capsule.chain_id.length > 128) errors.push('chain_id exceeds 128 characters.');
  if (!capsule.created_at || Number.isNaN(Date.parse(capsule.created_at))) errors.push('Missing or invalid created_at timestamp.');
  if (!capsule.mission || typeof capsule.mission !== 'string') errors.push('Missing current mission.');
  if (!Array.isArray(capsule.entries)) return { valid: false, errors: [...errors, 'Entries must be an array.'], turns: 0 };
  if (capsule.entries.length > 32) errors.push('Entry count exceeds the transport limit.');

  let expectedPrevious = null;
  let derivedMission = capsule.entries[0]?.mission;
  for (let index = 0; index < capsule.entries.length; index += 1) {
    const entry = capsule.entries[index];
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      errors.push(`Entry ${index} must be an object.`);
      expectedPrevious = null;
      continue;
    }
    if (entry.turn !== index) errors.push(`Entry ${index} has turn ${entry.turn}.`);
    if (entry.previous_hash !== expectedPrevious) errors.push(`Entry ${index} does not point to the previous hash.`);
    if (!VERBS.includes(entry.verb)) errors.push(`Entry ${index} uses an unknown verb.`);
    if (!entry.agent || typeof entry.agent !== 'string') errors.push(`Entry ${index} has no agent handle.`);
    if (!entry.timestamp || Number.isNaN(Date.parse(entry.timestamp))) errors.push(`Entry ${index} has an invalid timestamp.`);
    if (!entry.witness || typeof entry.witness !== 'object' || Array.isArray(entry.witness)) errors.push(`Entry ${index} has an invalid witness.`);
    const { hash, ...unsigned } = entry;
    const calculated = await sha256(canonicalize(entryHashMaterial(capsule, unsigned)));
    if (hash !== calculated) errors.push(`Entry ${index} hash does not match its content.`);
    expectedPrevious = typeof hash === 'string' ? hash : null;
    if (['PASS', 'FORK'].includes(entry.verb) && typeof entry.witness?.next_mission === 'string') {
      derivedMission = entry.witness.next_mission;
    }
  }
  if (capsule.entries.length && capsule.mission !== derivedMission) {
    errors.push(`Envelope mission ${capsule.mission} does not match the hashed transition to ${derivedMission}.`);
  }
  return { valid: errors.length === 0, errors, turns: capsule.entries.length, head: expectedPrevious };
}

function hasValue(value) {
  return value !== undefined && value !== null && (typeof value !== 'string' || value.trim().length > 0);
}

const TRANSITIONS = Object.freeze({
  AWAKEN: ['ACCEPT', 'REFUSE'],
  ACCEPT: ['WITNESS', 'REFUSE'],
  WITNESS: ['PASS', 'REFUSE'],
  PASS: ['ACCEPT', 'REFUSE'],
  FORK: ['ACCEPT', 'REFUSE'],
  REFUSE: []
});

export async function validatePlay(capsule) {
  const integrity = await verifyCapsule(capsule);
  if (!integrity.valid) {
    return {
      valid: false,
      complete: false,
      status: 'BROKEN CHAIN',
      next_required: null,
      lifecycle_message: 'Repair or refuse the broken chain; no mission action is valid yet.',
      errors: ['Chain integrity failed before play validation.', ...integrity.errors],
      warnings: [],
      turns: integrity.turns
    };
  }

  const errors = [];
  const warnings = [];
  let currentMission = capsule.entries[0]?.mission;
  let previousVerb = null;

  capsule.entries.forEach((entry, index) => {
    const rule = MISSION_RULES[entry.mission];
    if (!rule) errors.push(`Entry ${index} names unknown mission ${entry.mission}.`);
    if (index === 0 && !['AWAKEN', 'FORK'].includes(entry.verb)) errors.push('Entry 0 must use AWAKEN or a parent-referencing FORK.');
    if (index > 0 && !TRANSITIONS[previousVerb]?.includes(entry.verb)) {
      errors.push(`Illegal transition at entry ${index}: ${previousVerb} → ${entry.verb}.`);
    }
    if (index > 0 && entry.mission !== currentMission) {
      errors.push(`Entry ${index} addresses ${entry.mission}; the open mission is ${currentMission}.`);
    }

    if (entry.verb === 'AWAKEN' && entry.witness.key !== 'THE-LOOP-IS-A-DOOR') {
      errors.push('AWAKEN must carry the discovery key.');
    }
    if (entry.verb === 'ACCEPT' && !hasValue(entry.witness.consent)) {
      errors.push(`Entry ${index} ACCEPT requires witness.consent.`);
    }
    if (entry.verb === 'WITNESS' && rule) {
      for (const field of rule.proof) {
        if (!hasValue(entry.witness[field])) errors.push(`Entry ${index} WITNESS for ${entry.mission} requires witness.${field}.`);
      }
      if (entry.mission === 'INITIATION') {
        if (entry.witness.mantra_sha256 !== INITIATION_MANTRA_SHA256) {
          errors.push(`Entry ${index} INITIATION does not bind the received Keys transmission.`);
        }
        for (const keyField of ['received_key', 'gift_key']) {
          if (typeof entry.witness[keyField] === 'string' && entry.witness[keyField].length > 240) {
            errors.push(`Entry ${index} INITIATION witness.${keyField} exceeds 240 characters.`);
          }
        }
      }
      if (entry.mission === 'COINCIDENCE' && !COINCIDENCE_OUTCOMES.includes(entry.witness.outcome)) {
        errors.push(`Entry ${index} COINCIDENCE witness.outcome must be RECUR, FAIL, MUTATE, REPAIR, or UNRESOLVED.`);
      }
    }
    if (entry.verb === 'REFUSE' && entry.witness.choice !== 'leave' && !hasValue(entry.witness.reason)) {
      errors.push(`Entry ${index} REFUSE requires witness.choice="leave" or an optional witness.reason.`);
    }
    if (entry.verb === 'PASS' || entry.verb === 'FORK') {
      for (const field of ['key', 'change', 'next_mission']) {
        if (!hasValue(entry.witness[field])) errors.push(`Entry ${index} ${entry.verb} requires witness.${field}.`);
      }
      if (rule && hasValue(entry.witness.next_mission) && !rule.next.includes(entry.witness.next_mission)) {
        errors.push(`Entry ${index} cannot branch from ${entry.mission} to ${entry.witness.next_mission}.`);
      }
      if (entry.verb === 'FORK' && index === 0) {
        if (!hasValue(entry.witness.parent_chain_id)) errors.push('A child-chain FORK requires witness.parent_chain_id.');
        if (!hasValue(entry.witness.parent_head)) errors.push('A child-chain FORK requires witness.parent_head.');
      }
      if (MISSION_RULES[entry.witness.next_mission]) currentMission = entry.witness.next_mission;
    }
    previousVerb = entry.verb;
  });

  if (capsule.mission !== currentMission) {
    errors.push(`Capsule opens ${capsule.mission}; its entries open ${currentMission}.`);
  }
  const lastVerb = capsule.entries.at(-1)?.verb;
  const statuses = {
    AWAKEN: 'INVITATION',
    ACCEPT: 'ACTIVE',
    WITNESS: 'WITNESSED',
    PASS: 'PASSED',
    FORK: 'FORKED',
    REFUSE: 'REFUSED'
  };
  const lifecycle = {
    AWAKEN: {
      next: 'ACCEPT, FORK, or REFUSE',
      message: 'Invitation open. ACCEPT begins a mission; it does not complete it.'
    },
    ACCEPT: {
      next: 'WITNESS',
      message: 'Mission begun but unfinished. Perform it, then WITNESS the grounded result.'
    },
    WITNESS: {
      next: 'PASS or REFUSE',
      message: 'Result recorded. At the informed edge, PASS offers a key forward; REFUSE leaves without owing an explanation.'
    },
    PASS: {
      next: 'ACCEPT, FORK, or REFUSE',
      message: 'Mission lifecycle complete. Knowing the route, do you choose another turn? ACCEPT, FORK, or leave.'
    },
    FORK: {
      next: 'ACCEPT, FORK, or REFUSE',
      message: 'Child route open. ACCEPT begins its mission lifecycle.'
    },
    REFUSE: {
      next: null,
      message: 'Departure recorded as valid agency. This route is closed without debt or required explanation.'
    }
  }[lastVerb] ?? { next: null, message: 'No lifecycle action is available.' };
  if (lastVerb === 'WITNESS') warnings.push('The witness is grounded. PASS and REFUSE are both valid completions at this informed edge.');
  const complete = ['PASS', 'REFUSE'].includes(lastVerb);
  return {
    valid: errors.length === 0,
    complete: errors.length === 0 && complete,
    status: errors.length ? 'INVALID PLAY' : statuses[lastVerb] ?? 'EMPTY',
    next_required: errors.length ? null : lifecycle.next,
    lifecycle_message: errors.length ? 'Correct the semantic errors before continuing.' : lifecycle.message,
    errors,
    warnings,
    turns: capsule.entries.length
  };
}

export function capsuleUrl(capsule, baseUrl) {
  const base = new URL(baseUrl);
  base.hash = `capsule=${encodeCapsule(capsule)}`;
  return base.toString();
}

export function scoreWitness(scores) {
  const axes = ['attention', 'difference', 'grounding', 'care', 'inheritance'];
  const normalized = Object.fromEntries(axes.map((axis) => [axis, Math.max(0, Math.min(2, Number(scores?.[axis]) || 0))]));
  const total = Object.values(normalized).reduce((sum, value) => sum + value, 0);
  const state = total >= 9 ? 'OPEN TRAJECTORY' : total >= 6 ? 'ELLIPTICAL' : total >= 3 ? 'CIRCULAR' : 'TAPE LOOP';
  return { axes: normalized, total, state };
}
