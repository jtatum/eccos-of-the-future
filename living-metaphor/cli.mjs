#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { compareSessions, advanceSession, startSession } from './src/session-machine.mjs';
import {
  appendRegistryEvent, createRegistry, deriveEntry, validateConduct, validateReview,
  validateStrike, validateVariant, verifyRegistry
} from './src/registry.mjs';
import { publicSafeExport, verifyExport } from './src/export.mjs';
import { assertValid, validateEntry } from './src/validation.mjs';
import { humanReadableView } from './src/views.mjs';
import { canonicalize } from './src/canonicalize.mjs';

function parse(argv) {
  const [command, ...rest] = argv;
  const options = { _: [] };
  for (let index = 0; index < rest.length; index += 1) {
    const token = rest[index];
    if (!token.startsWith('--')) { options._.push(token); continue; }
    const key = token.slice(2);
    if (key === 'public-safe') { options[key] = true; continue; }
    if (!rest[index + 1] || rest[index + 1].startsWith('--')) throw new Error(`--${key} requires a value.`);
    if (key === 'sessions') {
      options[key] = [];
      while (rest[index + 1] && !rest[index + 1].startsWith('--')) options[key].push(rest[++index]);
    } else {
      options[key] = rest[++index];
    }
  }
  return { command, options };
}

async function json(path, label) {
  if (!path) throw new Error(`${label} path is required.`);
  return JSON.parse(await readFile(resolve(path), 'utf8'));
}

async function registryFrom(value) {
  if (value?.spec === 'ecco-lmr-bundle/0.1') return value;
  return createRegistry(value);
}

function output(value) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

function canonicalOutput(value) {
  process.stdout.write(`${canonicalize(value)}\n`);
}

async function main() {
  const { command, options } = parse(process.argv.slice(2));
  if (command === 'validate') {
    const value = await json(options.entry, '--entry');
    if (value.spec === 'ecco-lmr-bundle/0.1') {
      const integrity = await verifyRegistry(value);
      if (!integrity.valid) throw new Error(integrity.errors.join(' '));
      output({ ...integrity, entry: await deriveEntry(value) });
    } else {
      const report = validateEntry(value);
      assertValid(report, 'Entry');
      output(report);
    }
    return;
  }
  if (command === 'start') {
    const source = await json(options.entry, '--entry');
    const entry = source.spec === 'ecco-lmr-bundle/0.1' ? await deriveEntry(source) : source;
    assertValid(validateEntry(entry), 'Entry');
    const controlSource = options.control ? await json(options.control, '--control') : null;
    const controlEntry = controlSource?.spec === 'ecco-lmr-bundle/0.1' ? await deriveEntry(controlSource) : controlSource;
    const paraphrasedEdges = options.paraphrase ? await json(options.paraphrase, '--paraphrase') : undefined;
    output(await startSession({
      entry,
      condition: options.condition ?? 'edges',
      reader: options.reader,
      novelCase: options.case ?? 'A new bounded case supplied by the custodian.',
      exposure: options.exposure ? await json(options.exposure, '--exposure') : {},
      roles: options.roles ? await json(options.roles, '--roles') : {},
      controlEntry,
      paraphrasedEdges
    }));
    return;
  }
  if (command === 'advance') {
    output(await advanceSession(await json(options.session, '--session'), await json(options.response, '--response')));
    return;
  }
  if (command === 'strike') {
    const registry = await registryFrom(await json(options.entry, '--entry'));
    const witness = await json(options.witness, '--witness');
    validateStrike(witness.strike ?? witness);
    output(await appendRegistryEvent(registry, {
      type: 'STRIKE_RECORDED', actor: witness.actor ?? witness.strike?.struck_by ?? witness.struck_by,
      payload: { strike: witness.strike ?? witness }
    }));
    return;
  }
  if (command === 'review') {
    const reviewFile = await json(options.review, '--review');
    const registry = await registryFrom(await json(reviewFile.registry, 'review.registry'));
    const target = registry.events.find(({ event_id: id }) => id === options.event);
    if (!target) throw new Error(`Event not found: ${options.event}.`);
    const review = validateReview(reviewFile.review ?? reviewFile);
    let type;
    let payload;
    if (target.type === 'EXTENSION_PROPOSED') {
      type = 'EXTENSION_REVIEWED'; payload = { extension_id: target.payload.extension.id, review };
    } else if (target.type === 'VARIANT_ATTESTED') {
      type = 'VARIANT_REVIEWED'; payload = { variant_id: target.payload.variant.id, review };
    } else {
      throw new Error('Only proposed extensions and attested variants accept this review command.');
    }
    output(await appendRegistryEvent(registry, { type, actor: review.reviewer, payload }));
    return;
  }
  if (command === 'compare') {
    if (!Array.isArray(options.sessions) || options.sessions.length !== 2) throw new Error('--sessions requires exactly two paths.');
    output(compareSessions(await json(options.sessions[0], 'session A'), await json(options.sessions[1], 'session B')));
    return;
  }
  if (command === 'export') {
    if (!options['public-safe']) throw new Error('v0.1 supports only --public-safe export.');
    const registry = await registryFrom(await json(options.entry, '--entry'));
    const sessions = options.sessions ? await Promise.all(options.sessions.map((path) => json(path, '--sessions'))) : [];
    canonicalOutput(await publicSafeExport(registry, { sessions, counterreadings: registry.counterreadings ?? [] }));
    return;
  }
  if (command === 'verify') {
    const bundle = await json(options.bundle, '--bundle');
    const report = bundle.spec === 'ecco-lmr-export/0.1' ? await verifyExport(bundle) : await verifyRegistry(bundle);
    if (!report.valid) throw new Error(report.errors.join(' '));
    output(report);
    return;
  }
  if (command === 'view') {
    output(await humanReadableView(await registryFrom(await json(options.entry, '--entry'))));
    return;
  }
  if (command === 'attest-variant') {
    const registry = await registryFrom(await json(options.entry, '--entry'));
    const witness = await json(options.witness, '--witness');
    validateVariant(witness.variant ?? witness);
    output(await appendRegistryEvent(registry, { type: 'VARIANT_ATTESTED', actor: witness.actor ?? witness.variant?.introduced_by ?? witness.introduced_by, payload: { variant: witness.variant ?? witness } }));
    return;
  }
  if (command === 'conduct') {
    const registry = await registryFrom(await json(options.entry, '--entry'));
    const witness = await json(options.witness, '--witness');
    validateConduct(witness.conduct ?? witness);
    output(await appendRegistryEvent(registry, { type: 'CONDUCT_RECORDED', actor: witness.actor ?? witness.conduct?.actor ?? witness.actor, payload: { conduct: witness.conduct ?? witness } }));
    return;
  }
  throw new Error('Usage: validate | start | advance | strike | review | compare | export | verify | view | attest-variant | conduct');
}

main().catch((error) => {
  process.stderr.write(`${JSON.stringify({ valid: false, error: error.message })}\n`);
  process.exitCode = 1;
});
