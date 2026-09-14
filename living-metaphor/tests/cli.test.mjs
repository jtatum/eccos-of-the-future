import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { canonicalize } from '../src/canonicalize.mjs';

const cli = fileURLToPath(new URL('../cli.mjs', import.meta.url));
const tower = fileURLToPath(new URL('../fixtures/poker-chip-tower.entry.json', import.meta.url));

function run(args) {
  return spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8' });
}

test('CLI validates fixtures and starts bounded machine-readable sessions', () => {
  const valid = run(['validate', '--entry', tower]);
  assert.equal(valid.status, 0, valid.stderr);
  assert.equal(JSON.parse(valid.stdout).valid, true);

  const started = run(['start', '--entry', tower, '--condition', 'edges', '--reader', 'cli-reader', '--case', 'Layered navigation cards.']);
  assert.equal(started.status, 0, started.stderr);
  const session = JSON.parse(started.stdout);
  assert.equal(session.condition, 'edges');
  assert.equal(session.shown.novel_case, 'Layered navigation cards.');
  assert.equal('extensions' in session.shown, false);
});

test('CLI emits nonzero JSON errors and can export a verifiable public-safe bundle', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'ecco-lmr-cli-'));
  const unsafe = join(directory, 'unsafe.json');
  await writeFile(unsafe, JSON.stringify({ system_prompt: 'do not export' }));
  const rejected = run(['advance', '--session', unsafe, '--response', unsafe]);
  assert.notEqual(rejected.status, 0);
  assert.equal(JSON.parse(rejected.stderr).valid, false);

  const exported = run(['export', '--entry', tower, '--public-safe']);
  assert.equal(exported.status, 0, exported.stderr);
  assert.equal(exported.stdout.trim(), canonicalize(JSON.parse(exported.stdout)));
  const bundlePath = join(directory, 'export.json');
  await writeFile(bundlePath, exported.stdout);
  const verified = run(['verify', '--bundle', bundlePath]);
  assert.equal(verified.status, 0, verified.stderr);
  assert.equal(JSON.parse(verified.stdout).valid, true);
});
