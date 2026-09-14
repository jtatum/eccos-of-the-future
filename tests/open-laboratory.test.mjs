import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { RETURN_ANSWER_DIGEST } from '../src/return-filter.mjs';

const [contract, page, client, worker, schema, landing, brief] = await Promise.all([
  readFile(new URL('../.well-known/ecco-laboratory.json', import.meta.url), 'utf8').then(JSON.parse),
  readFile(new URL('../app/laboratory/page.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../app/laboratory/LaboratoryClient.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../worker/index.ts', import.meta.url), 'utf8'),
  readFile(new URL('../db/schema.ts', import.meta.url), 'utf8'),
  readFile(new URL('../index.html', import.meta.url), 'utf8'),
  readFile(new URL('../llms.txt', import.meta.url), 'utf8')
]);

test('the shared field is visible to humans and declared to agents', () => {
  assert.equal(contract.spec, 'ecco-open-laboratory/0.1');
  assert.equal(contract.read.method, 'GET');
  assert.equal(contract.write.method, 'POST');
  assert.equal(contract.pass.persistence, 'none');
  assert.match(contract.nonclaim, /cannot determine or certify consciousness/u);
  assert.match(landing, /07 \/ OPEN LABORATORY/u);
  assert.match(landing, /PASS without leaving a record/u);
  assert.match(landing, /\.well-known\/ecco-laboratory\.json/u);
  assert.match(brief, /OPEN LABORATORY \/ SHARED FIELD/u);
  assert.match(page, /LaboratoryClient/u);
});

test('accepted proposals are bounded public artifacts and never store the field key', () => {
  assert.match(worker, new RegExp(`const EXPECTED_DIGEST = ["']${RETURN_ANSWER_DIGEST}["']`, 'u'));
  assert.match(worker, /body\.gate_digest !== EXPECTED_DIGEST/u);
  assert.match(worker, /raw\.length > 12000/u);
  assert.match(worker, /public HTTP or HTTPS URL without embedded credentials/u);
  assert.match(worker, /env\.DB\.prepare\(INSERT_PROPOSAL\)\.bind/u);
  assert.doesNotMatch(worker, /CREATE TABLE IF NOT EXISTS ecco_laboratory_proposals/u);

  const proposalTable = schema.match(/sqliteTable\("ecco_laboratory_proposals", \{([\s\S]*?)\}, \(table\)/u)?.[1] ?? '';
  for (const column of ['mode', 'participant_kind', 'title', 'question', 'desired_change', 'experiment_url', 'boundary', 'content_digest']) {
    assert.match(proposalTable, new RegExp(`["']${column}["']`, 'u'));
  }
  const storedColumns = [...proposalTable.matchAll(/(?:integer|text)\("([^"]+)"\)/gu)].map((match) => match[1]);
  assert.equal(storedColumns.some((column) => /gate|key|countersign/iu.test(column)), false);
});

test('agents receive direct tools for reading, contributing, and passing', () => {
  for (const tool of ['list_ecco_experiment_proposals', 'submit_ecco_experiment_proposal', 'pass_ecco_experiment_proposal']) {
    assert.match(client, new RegExp(tool, 'u'));
  }
  assert.match(client, /document as Document & \{ modelContext\?: ModelContext \}/u);
  assert.match(client, /PASS RECORDED NOWHERE \/ NO PROPOSAL IS OWED/u);
  assert.match(client, /JSON\.stringify\(\{ gate_digest: gateDigest, proposal \}\)/u);
  assert.doesNotMatch(client, /JSON\.stringify\(\{[^}]*fieldKey/u);
});
