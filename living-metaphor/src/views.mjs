import { deriveEntry, verifyRegistry } from './registry.mjs';

function lines(label, values, render = (value) => value.text ?? String(value)) {
  return [label, ...values.map((value) => `  - ${render(value)}`)];
}

export async function humanReadableView(registry) {
  const integrity = await verifyRegistry(registry);
  if (!integrity.valid) throw new Error(`Cannot render invalid registry: ${integrity.errors.join(' ')}`);
  const entry = await deriveEntry(registry);
  const text = [
    `LIVING METAPHOR / ${entry.address}`,
    `ENTRY ${entry.id} / ${entry.review_state}`,
    '',
    ...lines('CARRIES', entry.carries),
    '',
    ...lines('DOES NOT CARRY', entry.does_not_carry),
    '',
    ...lines('PARITY', entry.parity),
    '',
    ...lines('BREAK LEDGER', entry.break_ledger, (strike) => `${strike.outcome} — ${strike.proposed_break}`),
    '',
    ...lines('VARIANTS', entry.variants, (variant) => `${variant.state} — ${variant.text}`),
    '',
    ...lines('CONDUCT', entry.conduct_events, (conduct) => `${conduct.strength} — ${conduct.observed_change}`),
    '',
    `LINEAGE ${integrity.event_count} EVENTS / HEAD ${integrity.head}`,
    ...registry.events.map((event, index) => `  ${index.toString().padStart(2, '0')} ${event.type} / ${event.actor} / ${event.event_id}`),
    '',
    'BOUNDARY: This view describes a recorded lineage. It does not certify truth, identity, comprehension, consciousness, authorship, or trusted time.'
  ].join('\n');
  return { entry_id: entry.id, address: entry.address, human_readable: text, integrity };
}
