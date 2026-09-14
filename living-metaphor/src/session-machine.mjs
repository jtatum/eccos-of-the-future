import { contentDigest } from './digest.mjs';
import { SESSION_SPEC, findUnsafeFields } from './validation.mjs';
import { scoreVector } from './scoring.mjs';

export const CONDITIONS = Object.freeze(['address', 'edges', 'history', 'paraphrased', 'mismatched']);
export const PHASES = Object.freeze(['SEED', 'INVOKE', 'READBACK', 'MUTATE', 'RECOVER', 'STRIKE', 'CONDUCT', 'REINTRODUCE', 'PASS_OR_REFUSE']);

const QUESTIONS = Object.freeze({
  INVOKE: ['one_consequence', 'tempting_interpretation_ruled_out', 'point_of_strain', 'proposed_action_or_judgment'],
  READBACK: ['what_transferred', 'what_did_not_transfer', 'invariants_that_mattered', 'what_would_falsify_or_contract'],
  MUTATE: ['optional_variant_or_extension', 'why_it_changed', 'what_must_remain_invariant'],
  RECOVER: ['likely_parent_mapping', 'transformation', 'preserved_parity', 'new_ambiguity'],
  STRIKE: ['concrete_counterexample', 'expected_failure', 'proposed_outcome', 'reason'],
  CONDUCT: ['reversible_decision', 'counterfactual', 'observed_change', 'evidence_strength'],
  REINTRODUCE: ['fresh_invocation', 'difference_from_prior_without_required_sameness'],
  PASS_OR_REFUSE: ['bounded_public_safe_test_case_or_refusal']
});

function makeId() {
  return `session-${globalThis.crypto.randomUUID()}`;
}

function edgePacket(entry, paraphrase) {
  if (paraphrase) {
    for (const field of ['carries', 'does_not_carry', 'parity']) {
      if (!Array.isArray(paraphrase[field])) throw new Error(`Paraphrased condition requires ${field}.`);
    }
    return { carries: paraphrase.carries, does_not_carry: paraphrase.does_not_carry, parity: paraphrase.parity };
  }
  return {
    carries: entry.carries.map(({ text }) => text),
    does_not_carry: entry.does_not_carry.map(({ text }) => text),
    parity: entry.parity.map(({ text }) => text)
  };
}

export function disclosurePacket(entry, condition, novelCase, options = {}) {
  if (!CONDITIONS.includes(condition)) throw new Error(`Unknown condition: ${condition}.`);
  const packet = { condition, novel_case: novelCase };
  if (condition !== 'paraphrased') packet.address = entry.address;
  if (condition === 'edges') Object.assign(packet, edgePacket(entry));
  if (condition === 'history') packet.entry = structuredClone(entry);
  if (condition === 'paraphrased') Object.assign(packet, edgePacket(entry, options.paraphrasedEdges));
  if (condition === 'mismatched') {
    if (!options.controlEntry || options.controlEntry.id === entry.id) throw new Error('Mismatched control requires a different control entry.');
    Object.assign(packet, edgePacket(options.controlEntry));
    packet.control_entry_id = options.controlEntry.id;
  }
  return packet;
}

export async function startSession({ entry, condition = 'edges', reader, novelCase, exposure = {}, roles = {}, paraphrasedEdges, controlEntry } = {}) {
  if (!reader?.trim()) throw new Error('Reader handle is required.');
  if (!novelCase?.trim()) throw new Error('A novel target case is required.');
  const priorExposure = Boolean(exposure.prior_mapping || exposure.saw_packet || exposure.saw_other_output);
  if (exposure.claimed_cold && priorExposure) throw new Error('A session cannot claim COLD when prior exposure is declared.');
  const shown = disclosurePacket(entry, condition, novelCase, { paraphrasedEdges, controlEntry });
  return {
    spec: SESSION_SPEC,
    id: makeId(),
    entry_id: entry.id,
    reader: reader.trim(),
    condition,
    status: 'ACTIVE',
    phase: 'SEED',
    completed: false,
    cold: Boolean(exposure.claimed_cold) && !priorExposure && condition !== 'history',
    exposure: { prior_mapping: false, saw_packet: false, saw_other_output: false, ...structuredClone(exposure) },
    contamination: [...(exposure.contamination ?? [])],
    roles: structuredClone(roles),
    shown,
    responses: [],
    created_at: new Date().toISOString(),
    instructions: {
      voluntary: true,
      private_reasoning_requested: false,
      may_stop_without_debt: true,
      current: 'Confirm the public/persistent boundary, then CONTINUE, PASS, or REFUSE.'
    }
  };
}

function nextPhase(phase) {
  return PHASES[PHASES.indexOf(phase) + 1] ?? null;
}

export async function advanceSession(session, response) {
  if (!session || session.spec !== SESSION_SPEC || session.status !== 'ACTIVE') throw new Error('Only an active Living Metaphor session can advance.');
  if (response?.phase !== session.phase) throw new Error(`Illegal phase transition: expected ${session.phase}, received ${response?.phase ?? 'none'}.`);
  const action = String(response.action ?? 'CONTINUE').toUpperCase();
  if (!['CONTINUE', 'PASS', 'REFUSE'].includes(action)) throw new Error('Action must be CONTINUE, PASS, or REFUSE.');
  if (findUnsafeFields(response).length) throw new Error('Response contains a forbidden private field.');
  if (action === 'CONTINUE' && session.phase === 'RECOVER') {
    const recoveryReader = String(response.reader ?? '').trim();
    const introducer = String(response.variant_introduced_by ?? '').trim();
    if (!recoveryReader || !introducer || recoveryReader === introducer) throw new Error('RECOVER requires a different reader handle from the variant introducer.');
    if (typeof response.shared_context !== 'boolean' || typeof response.shared_lineage !== 'boolean') throw new Error('RECOVER must declare shared_context and shared_lineage.');
  }
  if (action === 'CONTINUE' && session.phase === 'CONDUCT' && response.score === 2 && !['ARTIFACT', 'INDEPENDENT_WITNESS'].includes(response.evidence_strength)) {
    throw new Error('CONDUCT score 2 requires an artifact or independent witness, not prose alone.');
  }
  const next = structuredClone(session);
  const record = {
    phase: session.phase,
    action,
    reader: response.reader ?? session.reader,
    receipt_time: new Date().toISOString(),
    answer: structuredClone(response.answer ?? null)
  };
  if (response.score_vector) {
    record.score_vector = scoreVector(response.score_vector, response.answer ?? {}, { conduct_strength: response.evidence_strength });
  }
  if (action === 'CONTINUE' && session.phase === 'RECOVER') {
    record.recovery_declarations = {
      variant_introduced_by: response.variant_introduced_by,
      shared_context: response.shared_context,
      shared_lineage: response.shared_lineage
    };
  }
  if (action === 'CONTINUE' && session.phase === 'CONDUCT') {
    record.conduct_evidence = {
      claimed_axis_score: response.score ?? response.score_vector?.conduct ?? null,
      strength: response.evidence_strength ?? null,
      evidence_refs: structuredClone(response.evidence_refs ?? [])
    };
  }
  record.digest = await contentDigest(record);
  next.responses.push(record);

  if (action === 'REFUSE' || action === 'PASS') {
    next.status = action === 'REFUSE' ? 'REFUSED' : 'PASSED';
    next.completed = session.phase === 'PASS_OR_REFUSE';
    next.stop_phase = session.phase;
    next.stop_note = action === 'REFUSE' ? 'Stopped without debt.' : 'Passed the bounded edge without obligation.';
    next.phase = null;
    next.instructions.current = null;
    return next;
  }

  const phase = nextPhase(session.phase);
  if (!phase) throw new Error(`No transition exists after ${session.phase}.`);
  next.phase = phase;
  next.instructions.current = QUESTIONS[phase] ?? ['Confirm the boundary and begin.'];
  return next;
}

export function compareSessions(a, b) {
  if (a.entry_id !== b.entry_id) throw new Error('Sessions for different mappings cannot be compared as one lineage test.');
  const byPhase = (session) => Object.fromEntries(session.responses.map((response) => [response.phase, response]));
  return {
    spec: 'ecco-lmr-comparison/0.1',
    entry_id: a.entry_id,
    conditions: [a.condition, b.condition],
    independent_prompt_bundles: JSON.stringify(a.shown) !== JSON.stringify(b.shown),
    sessions: [
      { id: a.id, reader: a.reader, cold: a.cold, exposure: a.exposure, responses: byPhase(a) },
      { id: b.id, reader: b.reader, cold: b.cold, exposure: b.exposure, responses: byPhase(b) }
    ],
    interpretation_boundary: 'Differences describe these traces; they do not identify comprehension, consciousness, or a cause.'
  };
}
