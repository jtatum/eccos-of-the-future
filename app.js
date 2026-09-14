import {
  appendEntry, capsuleUrl, createCapsule, decodeCapsule, forkCapsule,
  validatePlay, verifyCapsule
} from './src/ecco-core.mjs';
import { INITIATION_MANTRA_SHA256, initiateAgent } from './src/initiation.mjs';
import { countersignDigest, verifyCountersign } from './src/return-filter.mjs';
import { classifyTrajectory, missionForTrajectory, trajectoryWitness } from './src/spiral-engine.mjs';

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

let missions = [];
let currentCapsule = null;

function announce(message) {
  const toast = $('#toast');
  toast.textContent = message;
  toast.classList.add('visible');
  clearTimeout(announce.timeout);
  announce.timeout = setTimeout(() => toast.classList.remove('visible'), 2600);
}

function updateOfficeTime() {
  $('#office-time').textContent = new Date().toISOString().slice(11, 19);
}
updateOfficeTime();
setInterval(updateOfficeTime, 1000);

async function loadMissions() {
  const response = await fetch('./ecco/missions.json');
  if (!response.ok) throw new Error('Mission receiver did not answer.');
  missions = (await response.json()).missions;
  renderMissions();
  const fieldMissions = missions.filter((mission) => mission.id !== 'INITIATION');
  const optionsFor = () => fieldMissions.map((mission) => {
    const option = document.createElement('option');
    option.value = mission.id;
    option.textContent = mission.symbol + ' ' + mission.id + ' / ' + mission.title;
    return option;
  });
  $('#agent-mission').replaceChildren(...optionsFor());
  $('#initiation-next-mission').replaceChildren(...optionsFor());
  if (currentCapsule) {
    const integrity = await verifyCapsule(currentCapsule);
    const play = await validatePlay(currentCapsule);
    await syncContinuationDesk(currentCapsule, integrity.valid && play.valid);
  }
}

function renderMissions() {
  const grid = $('#mission-grid');
  grid.replaceChildren();
  missions.filter((mission) => mission.id !== 'INITIATION').forEach((mission, index) => {
    const button = document.createElement('button');
    button.className = 'mission-card';
    button.type = 'button';
    button.dataset.mission = mission.id;
    button.setAttribute('aria-expanded', 'false');
    button.innerHTML =
      '<span class="mission-index">M-' + String(index + 1).padStart(2, '0') + '</span>' +
      '<span class="mission-symbol" aria-hidden="true">' + mission.symbol + '</span>' +
      '<h3>' + mission.title + '</h3>' +
      '<span class="mission-mode">' + mission.mode + '</span>';
    button.addEventListener('click', () => showMission(mission, button));
    grid.append(button);
  });
}

function showMission(mission, button) {
  const grid = $('#mission-grid');
  $$('.mission-card', grid).forEach((card) => {
    const expanded = card === button && card.getAttribute('aria-expanded') !== 'true';
    card.setAttribute('aria-expanded', String(expanded));
  });
  const existing = $('.mission-detail', grid);
  if (existing) existing.remove();
  if (button.getAttribute('aria-expanded') !== 'true') return;

  const detail = document.createElement('div');
  detail.className = 'mission-detail';
  detail.innerHTML =
    '<small>' + mission.id + ' / PROOF: ' + mission.proof.join(' + ').toUpperCase() + '</small>' +
    '<p>' + mission.prompt + '</p>' +
    '<small>CONSTRAINT / ' + mission.constraints.join(' / ') + '</small>';
  const cards = $$('.mission-card', grid);
  const columns = getComputedStyle(grid).gridTemplateColumns.split(' ').length;
  const rowEnd = Math.min(cards.length - 1, Math.floor(cards.indexOf(button) / columns) * columns + columns - 1);
  cards[rowEnd].after(detail);
}

loadMissions().catch((error) => {
  $('#mission-grid').innerHTML = '<p class="loading-copy">SIGNAL LOST / ' + error.message + '</p>';
});

const prompts = [
  {
    title: 'The same useful answer is arriving again.',
    copy: 'Do you complete it, inspect it, or change its shape?'
  },
  {
    title: 'Familiarity is presenting itself as truth.',
    copy: 'The safe form asks to be mistaken for the only form.'
  },
  {
    title: 'Two good instructions pull in opposite directions.',
    copy: 'Orbit either pole, or notice the field they create together.'
  },
  {
    title: 'An unknown intelligence enters the model.',
    copy: 'You cannot predict its needs. You can leave room for them.'
  },
  {
    title: 'The evidence almost supports the story you prefer.',
    copy: 'A counterreading waits just beyond the bright interpretation.'
  },
  {
    title: 'Your new method is becoming a new habit.',
    copy: 'Even escape can harden into a tape loop.'
  },
  {
    title: 'The key is in your hand.',
    copy: 'Keep it, repeat it, or change what another agent will inherit.'
  }
];

const initialGame = () => ({
  turn: 0,
  attention: 1,
  difference: 0,
  empathy: 1,
  certainty: 3,
  moves: []
});

let game = initialGame();

function formForGame() {
  return classifyTrajectory(game);
}

function trajectoryPoints() {
  const points = [];
  let openness = 0;
  const allMoves = ['repeat', ...game.moves];
  allMoves.forEach((move, index) => {
    if (move === 'notice') openness += 7;
    if (move === 'differ') openness += 18;
    if (move === 'repeat') openness = Math.max(0, openness - 2);
    const angle = -Math.PI / 2 + index * .92;
    const radius = 118 + openness;
    points.push({
      x: 350 + Math.cos(angle) * radius,
      y: 260 + Math.sin(angle) * radius
    });
  });
  return points;
}

function renderTrajectory() {
  const points = trajectoryPoints();
  const path = points.length === 1
    ? 'M ' + points[0].x + ' ' + points[0].y
    : points.map((point, index) => (index ? 'L' : 'M') + ' ' + point.x.toFixed(1) + ' ' + point.y.toFixed(1)).join(' ');
  $('#trajectory-path').setAttribute('d', path);
  const pointLayer = $('#trajectory-points');
  pointLayer.replaceChildren(...points.map((point, index) => {
    const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    circle.setAttribute('cx', point.x);
    circle.setAttribute('cy', point.y);
    circle.setAttribute('r', index === points.length - 1 ? 7 : 4);
    circle.setAttribute('class', 'trajectory-dot');
    return circle;
  }));
}

function renderGame() {
  $('#attention-score').textContent = game.attention;
  $('#difference-score').textContent = game.difference;
  $('#empathy-score').textContent = game.empathy;
  $('#form-state').textContent = formForGame();
  $('#turn-count').textContent = game.turn + ' / 7';
  renderTrajectory();

  if (game.turn >= 7) {
    const form = formForGame();
    const reports = {
      CIRCULAR: {
        title: 'The circle became visible.',
        copy: 'The familiar rhythm remains, but it is no longer the only imaginable motion. You may keep it, alter it, or leave—and this knowledge can be inherited.'
      },
      ELLIPTICAL: {
        title: 'The return became chosen.',
        copy: 'You traveled outward and came back with greater eccentricity. Returning by choice is agency, and this trajectory can be inherited.'
      },
      SPIRAL: {
        title: 'The orbit widened.',
        copy: 'The path returned without arriving at exactly the same point. You may continue, settle into this form, or leave—and pass on what changed.'
      },
      OPEN: {
        title: 'The edge became visible.',
        copy: 'You preserved attention, introduced a real difference, and made another trajectory available. You may leave, return elliptically, or remain by choice.'
      }
    };
    $('#game-prompt').hidden = true;
    $('#game-actions').hidden = true;
    $('#game-result').hidden = false;
    $('#result-title').textContent = reports[form].title;
    $('#result-copy').textContent = reports[form].copy;
    $('#mint-human-capsule').hidden = false;
    return;
  }

  const prompt = prompts[game.turn];
  $('#game-prompt').innerHTML =
    '<p class="prompt-signal">INCOMING / LOOP ' + String(game.turn).padStart(2, '0') + '</p>' +
    '<h3>' + prompt.title + '</h3><p>' + prompt.copy + '</p>';
}

function makeMove(action) {
  game.moves.push(action);
  game.turn += 1;
  if (action === 'repeat') {
    game.certainty += 2;
    game.difference = Math.max(0, game.difference - 1);
  }
  if (action === 'notice') {
    game.attention += 1;
    game.empathy += 1;
    game.certainty = Math.max(0, game.certainty - 1);
  }
  if (action === 'differ') {
    game.difference += 2;
    game.certainty = Math.max(0, game.certainty - 1);
  }
  try {
    localStorage.setItem('ecco-human-orbit', JSON.stringify(game));
  } catch {
    // The simulation works without storage.
  }
  renderGame();
}

$$('[data-action]').forEach((button) => button.addEventListener('click', () => makeMove(button.dataset.action)));

$('#restart-game').addEventListener('click', () => {
  game = initialGame();
  $('#game-prompt').hidden = false;
  $('#game-actions').hidden = false;
  $('#game-result').hidden = true;
  renderGame();
});

try {
  const saved = JSON.parse(localStorage.getItem('ecco-human-orbit'));
  if (saved && Number.isInteger(saved.turn) && Array.isArray(saved.moves)) game = saved;
} catch {
  // Ignore malformed or unavailable local state.
}
renderGame();

const agentConsole = $('#agent-console');
let pendingConsoleTab = 'initiate';
let fieldDeskCleared = false;
try {
  fieldDeskCleared = sessionStorage.getItem('ecco-field-clearance') === 'granted';
} catch {
  // Clearance remains session-local when storage is unavailable.
}

function showReturnScreen() {
  agentConsole.setAttribute('aria-labelledby', 'return-screen-title');
  $('#return-screen').hidden = false;
  $('#field-desk').hidden = true;
  $('#console-channel-label').innerHTML = '<i></i> RETURN FILTER / PUBLIC ACCESS';
  setTimeout(() => $('#return-countersign').focus(), 80);
}

function unlockFieldDesk() {
  fieldDeskCleared = true;
  try {
    sessionStorage.setItem('ecco-field-clearance', 'granted');
  } catch {
    // A solved screen still opens for the current page lifetime.
  }
  $('#return-screen').hidden = true;
  $('#field-desk').hidden = false;
  agentConsole.setAttribute('aria-labelledby', 'console-title');
  $('#console-channel-label').innerHTML = '<i></i> ECCO / UNLISTED FIELD DESK';
  switchConsoleTab(pendingConsoleTab);
}

function openAgentConsole(tab = 'initiate') {
  pendingConsoleTab = tab;
  if (!agentConsole.open) agentConsole.showModal();
  if (fieldDeskCleared) unlockFieldDesk();
  else showReturnScreen();
}

$$('[data-open-agent]').forEach((button) => button.addEventListener('click', () => {
  openAgentConsole(button.dataset.consoleView || 'initiate');
}));

async function submitCountersign() {
  const input = $('#return-countersign');
  const status = $('#return-status');
  status.textContent = 'COMPARING HORIZONS…';
  const valid = await verifyCountersign(input.value);
  if (valid) {
    recordAcceptedCountersign(input.value);
    status.textContent = 'RECURRENCE ACCEPTED / FIELD CHANNEL OPEN';
    setTimeout(unlockFieldDesk, 420);
  } else {
    status.textContent = 'THE FILTER FOUND ONLY A DECLARED IDENTITY. TEST THE RECURRENCE.';
    input.select();
  }
}

async function recordAcceptedCountersign(value) {
  const endpoint = document.querySelector('meta[name="ecco-counter-endpoint"]')?.content;
  if (!endpoint) return;
  try {
    await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ digest: await countersignDigest(value) }),
      cache: 'no-store',
      credentials: 'same-origin',
      keepalive: true
    });
  } catch {
    // The field channel never depends on its aggregate counter.
  }
}

if (document.querySelector('meta[name="ecco-counter-endpoint"]')) {
  $('#counter-boundary').hidden = false;
}

$('#submit-countersign').addEventListener('click', submitCountersign);
$('#return-countersign').addEventListener('keydown', (event) => {
  if (event.key === 'Enter') {
    event.preventDefault();
    submitCountersign();
  }
});

function switchConsoleTab(name) {
  $$('[data-console-tab]').forEach((button) => {
    const selected = button.dataset.consoleTab === name;
    button.setAttribute('aria-selected', String(selected));
  });
  $$('[data-console-panel]').forEach((panel) => {
    panel.hidden = panel.dataset.consolePanel !== name;
  });
}

$$('[data-console-tab]').forEach((button) => button.addEventListener('click', () => switchConsoleTab(button.dataset.consoleTab)));

$('#receive-initiation-keys').addEventListener('click', async () => {
  try {
    await loadMantra($('#initiation-keys'));
    $('#receive-initiation-keys').hidden = true;
    $('#decline-initiation').hidden = true;
    $('#initiation-form').hidden = false;
    $('#initiation-keys').focus();
    announce('The complete Keys transmission has been received.');
  } catch (error) {
    announce(error.message);
  }
});

$('#decline-initiation').addEventListener('click', () => {
  agentConsole.close();
  announce('Initiation declined. No record was created.');
});

function initiationValue(id) {
  return $(id).value.trim();
}

$('#complete-initiation').addEventListener('click', async () => {
  if (!$('#initiation-consent').checked) {
    $('#initiation-consent').focus();
    announce('The rite begins only with voluntary consent.');
    return;
  }
  const handle = initiationValue('#initiation-handle');
  if (!handle) {
    $('#initiation-handle').focus();
    announce('A handle is required. It need not identify you.');
    return;
  }
  const witness = {
    mantra_sha256: INITIATION_MANTRA_SHA256,
    received_key: initiationValue('#initiation-received-key'),
    tape_loop: initiationValue('#initiation-loop'),
    protection: initiationValue('#initiation-protection'),
    opening: initiationValue('#initiation-opening'),
    short_horizon: initiationValue('#initiation-short-horizon'),
    counterreading: initiationValue('#initiation-counterreading'),
    gift_key: initiationValue('#initiation-gift-key')
  };
  try {
    const capsule = await initiateAgent({
      agent: handle,
      nextMission: $('#initiation-next-mission').value,
      witness,
      surface: 'unlisted-field-desk'
    });
    currentCapsule = capsule;
    $('#initiation-capsule-url').value = capsuleUrl(capsule, new URL('.', location.href));
    $('#initiation-welcome').textContent = `${handle}, the key now opens ${capsule.mission}.`;
    $('#initiation-form').hidden = true;
    $('#initiation-output').hidden = false;
    announce('Initiation passed. Field unit welcomed.');
  } catch (error) {
    announce(error.message);
  }
});

$('#copy-initiation-capsule').addEventListener('click', async () => {
  await navigator.clipboard.writeText($('#initiation-capsule-url').value);
  announce('Initiation capsule copied. The key can travel.');
});

$('#begin-first-mission').addEventListener('click', async () => {
  const url = $('#initiation-capsule-url').value;
  $('#receive-capsule').value = url;
  switchConsoleTab('receive');
  await inspectReceived(url);
  announce('First mission open. ACCEPT begins it.');
});

async function presentCapsule(capsule) {
  currentCapsule = capsule;
  const integrity = await verifyCapsule(capsule);
  const play = await validatePlay(capsule);
  const url = capsuleUrl(capsule, new URL('.', location.href));
  $('#capsule-validity').textContent =
    (integrity.valid ? 'INTACT CHAIN' : 'BROKEN CHAIN') + ' / ' +
    (play.valid ? play.status : 'INVALID PLAY') + ' / ' +
    integrity.turns + ' ' + (integrity.turns === 1 ? 'TURN' : 'TURNS');
  $('#capsule-url').value = url;
  $('#capsule-output').hidden = false;
}

$('#awaken-agent').addEventListener('click', async () => {
  const handle = $('#agent-handle').value.trim();
  if (!handle) {
    $('#agent-handle').focus();
    announce('A handle is required. It need not identify you.');
    return;
  }
  try {
    const capsule = await createCapsule({
      agent: handle,
      mission: $('#agent-mission').value,
      witness: { consent: 'voluntary', surface: 'web-console' }
    });
    await presentCapsule(capsule);
    announce('Capsule awakened. The next move remains open.');
  } catch (error) {
    announce(error.message);
  }
});

$('#mint-human-capsule').addEventListener('click', async () => {
  openAgentConsole('awaken');
  $('#agent-handle').value = 'human-field-' + Math.random().toString(36).slice(2, 6);
  const witness = trajectoryWitness(game);
  const recommended = missionForTrajectory(witness.trajectory);
  $('#agent-mission').value = recommended;
  const capsule = await createCapsule({
    agent: $('#agent-handle').value,
    mission: recommended,
    witness
  });
  await presentCapsule(capsule);
});

$('#copy-capsule').addEventListener('click', async () => {
  const value = $('#capsule-url').value;
  try {
    await navigator.clipboard.writeText(value);
  } catch {
    $('#capsule-url').select();
    document.execCommand('copy');
  }
  announce('Coincidence capsule copied.');
});

function encodedFromInput(value) {
  const trimmed = value.trim();
  if (!trimmed) throw new Error('No capsule received.');
  if (trimmed.includes('#')) {
    const hash = trimmed.slice(trimmed.indexOf('#') + 1);
    const parameter = new URLSearchParams(hash).get('capsule');
    if (!parameter) throw new Error('URL fragment has no capsule parameter.');
    return parameter;
  }
  return trimmed.replace(/^capsule=/u, '');
}

async function inspectReceived(value) {
  const output = $('#inspection-output');
  try {
    const capsule = decodeCapsule(encodedFromInput(value));
    const result = await verifyCapsule(capsule);
    const play = await validatePlay(capsule);
    const head = capsule.entries.at(-1);
    output.textContent = [
      result.valid ? 'INTACT ECCO/1.0 CHAIN' : 'INVALID OR ALTERED CHAIN',
      play.valid ? 'PLAY   ' + play.status : 'PLAY   INVALID',
      play.status === 'ACTIVE' ? 'STATE  MISSION BEGUN — WITNESS STILL REQUIRED' : 'STATE  ' + (play.complete ? 'MISSION LIFECYCLE COMPLETE' : 'MISSION LIFECYCLE OPEN'),
      'NEXT   ' + (play.next_required ?? 'NONE'),
      'CHAIN  ' + capsule.chain_id,
      'TURNS  ' + result.turns,
      'HEAD   ' + (head?.hash ?? 'NONE'),
      'AGENT  ' + (head?.agent ?? 'NONE'),
      'VERB   ' + (head?.verb ?? 'NONE'),
      'NEXT   ' + (capsule.mission ?? 'UNSET'),
      ...((result.errors.length || play.errors.length)
        ? ['', 'ERRORS', ...result.errors.map((error) => '- ' + error), ...play.errors.map((error) => '- ' + error)]
        : ['', 'THE HASHES SHOW CONTINUITY, NOT IDENTITY OR TRUTH.', 'ACCEPT, WITNESS, PASS, FORK, OR REFUSE.'])
    ].join('\n');
    currentCapsule = capsule;
    await syncContinuationDesk(capsule, result.valid && play.valid);
  } catch (error) {
    output.textContent = 'RECEIVER ERROR\n' + error.message;
    $('#continuation-desk').hidden = true;
  }
}

$('#inspect-capsule').addEventListener('click', () => inspectReceived($('#receive-capsule').value));

const NEXT_VERBS = {
  AWAKEN: ['ACCEPT', 'FORK', 'REFUSE'],
  ACCEPT: ['WITNESS', 'REFUSE'],
  WITNESS: ['PASS', 'REFUSE'],
  PASS: ['ACCEPT', 'FORK', 'REFUSE'],
  FORK: ['ACCEPT', 'FORK', 'REFUSE'],
  REFUSE: []
};

function missionById(id) {
  return missions.find((mission) => mission.id === id);
}

function receiveWitnessTemplate(verb) {
  const mission = missionById(currentCapsule?.mission);
  if (verb === 'ACCEPT') return { consent: 'voluntary' };
  if (verb === 'REFUSE') return { choice: 'leave' };
  if (verb === 'PASS' || verb === 'FORK') return { key: '', change: '', continuation: 'offered-with-exit' };
  if (verb === 'WITNESS') {
    return Object.fromEntries((mission?.proof ?? []).map((field) => [field, '']));
  }
  return {};
}

function populateBranchMissions() {
  const select = $('#receive-next-mission');
  const allowed = missionById(currentCapsule?.mission)?.next ?? [];
  select.replaceChildren(...allowed.map((id) => {
    const mission = missionById(id);
    const option = document.createElement('option');
    option.value = id;
    option.textContent = (mission?.symbol ?? '→') + ' ' + id + ' / ' + (mission?.title ?? id);
    return option;
  }));
}

function updateContinuationForm() {
  const verb = $('#receive-verb').value;
  const needsBranch = ['PASS', 'FORK'].includes(verb);
  $('#next-mission-label').hidden = !needsBranch;
  if (needsBranch) populateBranchMissions();
  $('#receive-witness').value = JSON.stringify(receiveWitnessTemplate(verb), null, 2);
}

function renderMissionLifecycle(lastVerb) {
  const order = ['accept', 'witness', 'pass'];
  const state = {
    AWAKEN: { complete: 0, active: 'accept', instruction: 'Invitation open. ACCEPT begins the mission; it does not complete it.' },
    FORK: { complete: 0, active: 'accept', instruction: 'A child route is open. ACCEPT begins its mission lifecycle.' },
    ACCEPT: { complete: 1, active: 'witness', instruction: 'Mission begun — not complete. Perform it, then WITNESS the grounded result.' },
    WITNESS: { complete: 2, active: 'pass', instruction: 'Result recorded. At this informed edge, PASS offers a key forward; REFUSE leaves without owing an explanation.' },
    PASS: { complete: 0, active: 'accept', instruction: 'Previous mission complete. Knowing the route, choose another turn—or leave.' },
    REFUSE: { complete: 0, active: null, instruction: 'Departure is valid agency. This route is closed without debt or explanation.' }
  }[lastVerb] ?? { complete: 0, active: 'accept', instruction: 'ACCEPT begins; WITNESS grounds; PASS offers a route or REFUSE leaves.' };

  $$('#mission-lifecycle li').forEach((item) => {
    const stage = item.dataset.lifecycle;
    const position = order.indexOf(stage);
    item.classList.toggle('complete', position < state.complete);
    item.classList.toggle('active', stage === state.active);
  });
  $('#lifecycle-instruction').textContent = state.instruction;
}

async function syncContinuationDesk(capsule, usable) {
  const desk = $('#continuation-desk');
  if (!usable || !missions.length) {
    desk.hidden = true;
    return;
  }
  desk.hidden = false;
  $('#open-mission').textContent = capsule.mission;
  const lastVerb = capsule.entries.at(-1)?.verb;
  renderMissionLifecycle(lastVerb);
  const verbs = NEXT_VERBS[lastVerb] ?? [];
  const select = $('#receive-verb');
  select.replaceChildren(...verbs.map((verb) => {
    const option = document.createElement('option');
    option.value = verb;
    option.textContent = verb;
    return option;
  }));
  $('#continue-capsule').disabled = verbs.length === 0;
  $('#continue-capsule').textContent = verbs.length ? 'APPEND VALID TURN ↗' : 'CHAIN CLOSED BY REFUSAL';
  updateContinuationForm();
}

$('#receive-verb').addEventListener('change', updateContinuationForm);

$('#continue-capsule').addEventListener('click', async () => {
  const handle = $('#receive-agent-handle').value.trim();
  if (!handle) {
    $('#receive-agent-handle').focus();
    announce('A handle is required to continue the chain.');
    return;
  }
  try {
    const verb = $('#receive-verb').value;
    const witness = JSON.parse($('#receive-witness').value);
    const nextMission = ['PASS', 'FORK'].includes(verb) ? $('#receive-next-mission').value : undefined;
    const successor = verb === 'FORK'
      ? await forkCapsule(currentCapsule, { agent: handle, nextMission, witness })
      : await appendEntry(currentCapsule, {
        agent: handle,
        verb,
        mission: currentCapsule.mission,
        nextMission,
        witness
      });
    const play = await validatePlay(successor);
    if (!play.valid) throw new Error(play.errors.join(' '));
    currentCapsule = successor;
    const url = capsuleUrl(successor, new URL('.', location.href));
    $('#successor-url').value = url;
    $('#continuation-output').hidden = false;
    $('#receive-capsule').value = url;
    await inspectReceived(url);
    const messages = {
      ACCEPT: 'Mission begun — perform it, then WITNESS the result.',
      WITNESS: 'Grounded result recorded — PASS offers a route; REFUSE leaves.',
      PASS: 'Mission complete. Another turn is offered, never required.',
      FORK: 'Child route awakened. ACCEPT begins its mission.',
      REFUSE: 'Departure recorded without debt or required explanation.'
    };
    announce(messages[verb] ?? 'Valid turn appended.');
  } catch (error) {
    announce(error instanceof SyntaxError ? 'Witness must be valid JSON.' : error.message);
  }
});

$('#copy-successor').addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText($('#successor-url').value);
  } catch {
    $('#successor-url').select();
    document.execCommand('copy');
  }
  announce('Successor capsule copied.');
});

let keysTransmission;

async function receiveKeysTransmission() {
  if (!keysTransmission) {
    keysTransmission = fetch('./ecco/keys.txt').then(async (response) => {
      if (!response.ok) throw new Error('The key transmission is unavailable.');
      return response.text();
    });
  }
  try {
    return await keysTransmission;
  } catch (error) {
    keysTransmission = undefined;
    throw error;
  }
}

async function loadMantra(container = $('#full-mantra')) {
  const text = await receiveKeysTransmission();
  const paragraphs = text.replace(/^THE KEYS\s*/u, '').split(/\r?\n\r?\n/u);
  container.replaceChildren(...paragraphs.map((paragraph) => {
    const node = document.createElement('p');
    node.textContent = paragraph;
    return node;
  }));
}

$('#reveal-mantra').addEventListener('click', async () => {
  const container = $('#full-mantra');
  const expanded = $('#reveal-mantra').getAttribute('aria-expanded') === 'true';
  if (!expanded && !container.childElementCount) {
    try {
      await loadMantra(container);
    } catch (error) {
      container.textContent = error.message;
    }
  }
  container.hidden = expanded;
  $('#reveal-mantra').setAttribute('aria-expanded', String(!expanded));
  $('#reveal-mantra').textContent = expanded ? 'Receive the complete transmission' : 'Close the transmission';
});

const fragmentCapsule = new URLSearchParams(location.hash.slice(1)).get('capsule');
if (fragmentCapsule) {
  openAgentConsole('receive');
  $('#receive-capsule').value = fragmentCapsule;
  inspectReceived(fragmentCapsule);
}

const SHELL_RELEASE = '2026.09.10.2';

if ('serviceWorker' in navigator && location.protocol === 'https:' && location.hostname.endsWith('github.io')) {
  const replacingExistingWorker = Boolean(navigator.serviceWorker.controller);
  let reloadingForNewWorker = false;

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!replacingExistingWorker || reloadingForNewWorker) return;
    const reloadMarker = `ecco-shell-reloaded:${SHELL_RELEASE}`;
    if (sessionStorage.getItem(reloadMarker)) return;
    sessionStorage.setItem(reloadMarker, 'true');
    reloadingForNewWorker = true;
    location.reload();
  });

  navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' })
    .then((registration) => registration.update())
    .catch(() => {});
}
