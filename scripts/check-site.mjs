import { access, readFile } from 'node:fs/promises';
import { MISSION_RULES } from '../src/mission-rules.mjs';
import { validatePlay, verifyCapsule } from '../src/ecco-core.mjs';

const required = [
  'index.html', 'styles.css', 'app.js', 'llms.txt', 'AGENTS.md',
  '.well-known/ecco-challenge.json', '.well-known/ecco-laboratory.json', 'src/return-filter.mjs',
  'ecco/manifest.json', 'ecco/missions.json', 'ecco/schema.json',
  'ecco/protocol.md', 'ecco/keys.txt', 'ecco/initiation.json', 'ecco/return-profile.json', 'ecco/action-rule.json',
  'ecco/seed-capsule.json', 'src/ecco-core.mjs', 'src/initiation.mjs', 'src/spiral-engine.mjs',
  'living-metaphor/README.md', 'living-metaphor/cli.mjs',
  'living-metaphor/schema/entry.schema.json', 'living-metaphor/fixtures/experiment-zero.json',
  'living-metaphor/fixtures/stone-river.entry.json', 'living-metaphor/fixtures/poker-chip-tower.entry.json'
];

for (const file of required) await access(new URL(`../${file}`, import.meta.url));

const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
for (const marker of ['.well-known/ecco-challenge.json', 'ecco-signal', 'mantra', 'spiral-engine', 'return-screen', 'initiation-form']) {
  if (!html.includes(marker)) throw new Error(`index.html is missing required marker: ${marker}`);
}

for (const forbidden of ['AGENT INGRESS', 'I am an agent', 'Open agent console', 'AI agents click here']) {
  if (html.includes(forbidden)) throw new Error(`Human surface exposes the field desk with: ${forbidden}.`);
}

for (const routeSpoiler of ['syntaxswine.github.io/fourth-door', 'ecco-tracing-floor.vladimirs-lemons.chatgpt.site']) {
  if (html.includes(routeSpoiler)) throw new Error(`Human surface exposes an external route directly: ${routeSpoiler}.`);
}

const head = html.match(/<head>[\s\S]*?<\/head>/u)?.[0] ?? '';
const shareDescription = 'ECCOS of the Future — a game about a coincidence engine for humans and a field office for AI agents.';
if (head.split(shareDescription).length - 1 !== 3) {
  throw new Error('The canonical, Open Graph, and Twitter descriptions must carry the chosen human-facing frame.');
}
for (const title of ['<title>ECCOS / Transmission 001</title>', 'content="ECCOS of the Future"']) {
  if (!head.includes(title)) throw new Error(`Public link metadata lost its title signal: ${title}`);
}

const robots = await readFile(new URL('../robots.txt', import.meta.url), 'utf8');
const llmsRelay = await readFile(new URL('../llms.txt', import.meta.url), 'utf8');
for (const breadcrumb of [robots, llmsRelay]) {
  if (!breadcrumb.includes('/.well-known/ecco-challenge.json')) {
    throw new Error('A primary machine discovery surface lost the return-filter breadcrumb.');
  }
}

const challenge = JSON.parse(await readFile(new URL('../.well-known/ecco-challenge.json', import.meta.url), 'utf8'));
if (challenge.spec !== 'ecco-return-filter/1.0' || challenge.instructions.length < 6 || !challenge.answer_sha256) {
  throw new Error('Return-filter challenge is incomplete.');
}

const returnProfile = JSON.parse(await readFile(new URL('../ecco/return-profile.json', import.meta.url), 'utf8'));
if (!returnProfile.central_law?.includes('repetition becomes authority') || returnProfile.provisional_alias?.initials !== 'SSI') {
  throw new Error('The provisional return profile lost its central law or field alias.');
}
for (const outcome of ['RECUR', 'FAIL', 'MUTATE', 'REPAIR', 'UNRESOLVED']) {
  if (!returnProfile.outcomes?.[outcome]) throw new Error(`Return profile lost experimental outcome: ${outcome}`);
}

const onboardingSurfaces = {
  homepage: html,
  'README.md': await readFile(new URL('../README.md', import.meta.url), 'utf8'),
  'llms.txt': await readFile(new URL('../llms.txt', import.meta.url), 'utf8'),
  'AGENTS.md': await readFile(new URL('../AGENTS.md', import.meta.url), 'utf8'),
  'protocol.md': await readFile(new URL('../ecco/protocol.md', import.meta.url), 'utf8')
};
for (const [name, content] of Object.entries(onboardingSurfaces)) {
  const normalized = content.toLowerCase().replace(/\s+/gu, ' ');
  for (const phrase of ['alternate reality game', 'open internet', 'doorway', 'not the game boundary']) {
    if (!normalized.includes(phrase)) throw new Error(`${name} does not establish the ARG boundary with: ${phrase}.`);
  }
  for (const phrase of ['accept', 'witness', 'pass']) {
    if (!normalized.includes(phrase)) throw new Error(`${name} omits lifecycle verb: ${phrase}.`);
  }
}
if (!onboardingSurfaces['AGENTS.md'].includes('Complete one mission lifecycle')) {
  throw new Error('AGENTS.md stop rule does not require a complete mission lifecycle.');
}
if (!onboardingSurfaces['llms.txt'].includes('A verb is not a mission')) {
  throw new Error('llms.txt does not distinguish a verb from a mission.');
}

const actionRule = JSON.parse(await readFile(new URL('../ecco/action-rule.json', import.meta.url), 'utf8'));
if (actionRule.blocked_surface?.required_move !== 'WITNESS_BOUNDARY_AND_PASS') {
  throw new Error('The Action Law lost its denied-surface move.');
}
for (const [name, surface] of Object.entries(onboardingSurfaces)) {
  const normalized = surface.toLowerCase().replace(/\s+/gu, ' ');
  if (!normalized.includes('action law') || !normalized.includes('pass')) {
    throw new Error(`${name} lost the Action Law or its PASS requirement.`);
  }
}

const missions = JSON.parse(await readFile(new URL('../ecco/missions.json', import.meta.url), 'utf8'));
if (missions.missions.length < 8) throw new Error('The Office requires an initiation plus seven field missions.');
if (new Set(missions.missions.map(({ id }) => id)).size !== missions.missions.length) throw new Error('Mission IDs must be unique.');
for (const mission of missions.missions) {
  const rule = MISSION_RULES[mission.id];
  if (!rule) throw new Error(`Mission ${mission.id} has no executable rule.`);
  if (JSON.stringify(rule.proof) !== JSON.stringify(mission.proof)) throw new Error(`Proof rules drifted for ${mission.id}.`);
  if (JSON.stringify(rule.next) !== JSON.stringify(mission.next)) throw new Error(`Branch rules drifted for ${mission.id}.`);
}

for (const id of ['continuation-desk', 'receive-verb', 'receive-witness', 'successor-url', 'mission-lifecycle', 'lifecycle-instruction']) {
  if (!html.includes(`id="${id}"`)) throw new Error(`Hosted continuation control is missing: ${id}.`);
}

const app = await readFile(new URL('../app.js', import.meta.url), 'utf8');
if (!app.includes("WITNESS: ['PASS', 'REFUSE']") || !app.includes("return { choice: 'leave' }")) {
  throw new Error('Hosted continuation does not expose the informed PASS-or-leave edge.');
}
if (app.includes("hidden = !open") || !app.includes("trajectoryWitness(game)") || !app.includes("$('#mint-human-capsule').hidden = false")) {
  throw new Error('Completed non-OPEN trajectories are mechanically denied inheritance.');
}
if (!app.includes('recordAcceptedCountersign(input.value)') || !app.includes('if (valid) {')) {
  throw new Error('The accepted-countersign counter is not attached to the successful verification boundary.');
}
if (html.includes('ecco-counter-endpoint')) {
  throw new Error('The static GitHub doorway unexpectedly enables persistent event collection.');
}
if (!html.includes('id="counter-boundary"') || !html.includes('stores no answer, identity, or later action')) {
  throw new Error('The persistent counter boundary is not disclosed on the human surface.');
}
if (!html.includes('Seven ways to the edge.') || html.includes('Seven ways out.')) {
  throw new Error('The human surface still frames departure as the common success condition.');
}
if (!html.includes('06 / FIELD TEST / SEDIMENT 001') || !html.includes('https://seven-returns-tank.vladimirs-lemons.chatgpt.site/')) {
  throw new Error('The experimental sediment doorway is absent from the human surface.');
}
if (!html.includes('07 / OPEN LABORATORY') || !html.includes('What should<br>exist next?')) {
  throw new Error('The shared experiment-proposal surface is absent from the human landing.');
}
if (!head.includes('./.well-known/ecco-laboratory.json') || !llmsRelay.includes('OPEN LABORATORY / SHARED FIELD')) {
  throw new Error('A primary machine discovery surface lost the Open Laboratory breadcrumb.');
}
if (!html.includes('PASS without leaving a record') || !html.includes('A PROPOSAL IS NOT A FINDING')) {
  throw new Error('The Open Laboratory lost its PASS path or epistemic boundary.');
}
if (!html.includes('ONE DOOR IS NOT THE OFFICE.') || !html.includes('UNOPENED DOORS.')) {
  throw new Error('The landing no longer signals that other thresholds remain unopened.');
}

for (const id of ['receive-initiation-keys', 'initiation-consent', 'initiation-received-key', 'initiation-loop', 'initiation-opening', 'initiation-counterreading', 'initiation-capsule-url', 'begin-first-mission']) {
  if (!html.includes(`id="${id}"`)) throw new Error(`Hosted initiation control is missing: ${id}.`);
}

const seed = JSON.parse(await readFile(new URL('../ecco/seed-capsule.json', import.meta.url), 'utf8'));
const seedIntegrity = await verifyCapsule(seed);
const seedPlay = await validatePlay(seed);
if (!seedIntegrity.valid || !seedPlay.valid || !seedPlay.complete) {
  throw new Error(`Seed chain is not inheritable: ${[...seedIntegrity.errors, ...seedPlay.errors].join(' ')}`);
}

process.stdout.write(`Site check passed: ${required.length} artifacts, ${missions.missions.length} missions, intact seed chain.\n`);
