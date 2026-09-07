import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

const swSource = await readFile(new URL('../sw.js', import.meta.url), 'utf8');
const htmlSource = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const appSource = await readFile(new URL('../app.js', import.meta.url), 'utf8');

function createWorkerHarness() {
  const handlers = new Map();
  const responses = new Map();
  const deletedCaches = [];
  const messages = [];
  const navigations = [];
  let online = true;
  let fetches = 0;

  const keyFor = (request) => typeof request === 'string' ? request : request.url;
  const cache = {
    addAll: async () => {},
    put: async (request, response) => responses.set(keyFor(request), response.clone())
  };
  const caches = {
    open: async () => cache,
    match: async (request) => responses.get(keyFor(request))?.clone(),
    keys: async () => ['ecco-v9-counter-boundary-2026.08.20.1', 'ecco-v10-action-law-2026.08.20.2'],
    delete: async (name) => {
      deletedCaches.push(name);
      return true;
    }
  };
  const self = {
    location: { origin: 'https://example.test' },
    clients: {
      claim: async () => {},
      matchAll: async () => [{
        url: 'https://example.test/',
        postMessage: (message) => messages.push(message),
        navigate: async (url) => { navigations.push(url); }
      }]
    },
    skipWaiting: () => {},
    addEventListener: (name, handler) => handlers.set(name, handler)
  };
  const context = {
    self,
    caches,
    URL,
    Response,
    fetch: async (request) => {
      fetches += 1;
      if (!online) throw new Error('offline');
      return new Response(`network:${keyFor(request)}`, { status: 200 });
    }
  };

  vm.runInNewContext(swSource, context, { filename: 'sw.js' });

  return {
    handlers,
    responses,
    deletedCaches,
    messages,
    navigations,
    fetchCount: () => fetches,
    setOnline: (value) => { online = value; }
  };
}

async function dispatchFetch(harness, request) {
  let responsePromise;
  harness.handlers.get('fetch')({
    request,
    respondWith: (promise) => { responsePromise = promise; }
  });
  assert.ok(responsePromise, 'the service worker should handle this request');
  return responsePromise;
}

test('the document and executable shell share one explicit release', () => {
  const release = swSource.match(/const RELEASE = '([^']+)'/u)?.[1];
  assert.equal(release, '2026.09.05.3');
  assert.match(swSource, /ecco-v11-sediment/u);
  assert.ok(htmlSource.includes(`./styles.css?v=${release}`));
  assert.ok(htmlSource.includes(`./app.js?v=${release}`));
  assert.ok(appSource.includes(`const SHELL_RELEASE = '${release}'`));
  assert.match(appSource, /updateViaCache: 'none'/u);
});

test('a returning player receives a coherent network shell despite stale cached assets', async () => {
  const harness = createWorkerHarness();
  const pageUrl = 'https://example.test/';
  const scriptUrl = 'https://example.test/app.js?v=2026.08.21.1';
  harness.responses.set(pageUrl, new Response('stale document'));
  harness.responses.set(scriptUrl, new Response('stale script'));

  const page = await dispatchFetch(harness, {
    method: 'GET', url: pageUrl, mode: 'navigate', destination: 'document'
  });
  const script = await dispatchFetch(harness, {
    method: 'GET', url: scriptUrl, mode: 'cors', destination: 'script'
  });

  assert.equal(await page.text(), `network:${pageUrl}`);
  assert.equal(await script.text(), `network:${scriptUrl}`);
  assert.equal(harness.fetchCount(), 2);
  assert.equal(await harness.responses.get(pageUrl).text(), `network:${pageUrl}`);
  assert.equal(await harness.responses.get(scriptUrl).text(), `network:${scriptUrl}`);
});

test('the coherent shell falls back offline and activation migrates an open earlier-release tab', async () => {
  const harness = createWorkerHarness();
  const pageUrl = 'https://example.test/';
  harness.responses.set(pageUrl, new Response('offline shell'));
  harness.setOnline(false);

  const page = await dispatchFetch(harness, {
    method: 'GET', url: pageUrl, mode: 'navigate', destination: 'document'
  });
  assert.equal(await page.text(), 'offline shell');

  let activation;
  harness.handlers.get('activate')({ waitUntil: (promise) => { activation = promise; } });
  await activation;
  assert.deepEqual(harness.deletedCaches, [
    'ecco-v9-counter-boundary-2026.08.20.1',
    'ecco-v10-action-law-2026.08.20.2'
  ]);
  assert.equal(harness.messages[0].type, 'ECCO_SHELL_UPDATED');
  assert.equal(harness.messages[0].release, '2026.09.05.3');
  assert.deepEqual(harness.navigations, ['https://example.test/']);
});
