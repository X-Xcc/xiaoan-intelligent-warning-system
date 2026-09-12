import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { pathToFileURL } from 'node:url';

assert.ok(process.env.PLAYWRIGHT_MODULE, 'Set PLAYWRIGHT_MODULE to the local Playwright entry point');
const { chromium } = await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE).href);
const base = (process.env.XIAOAN_UI_URL || 'http://127.0.0.1:5177').replace(/\/$/, '');
const output = path.resolve(process.env.XIAOAN_QA_OUTPUT || '.verify/xiaoan-workspace');
const channel = process.env.XIAOAN_BROWSER_CHANNEL || 'msedge';
const desktop = { width: 1440, height: 1000 };
const viewports = [
  ['desktop', desktop],
  ['mobile', { width: 390, height: 844 }],
  ['small', { width: 320, height: 568 }],
  ['short-mobile', { width: 390, height: 400 }],
  ['short-small', { width: 320, height: 320 }],
  ['landscape', { width: 844, height: 390 }],
];
// Keep in sync with presentation.ts; include the default and legacy training entry.
const routes = [
  '/', '/platform', '/command', '/command/workbench', '/case', '/community',
  '/duty-situation', '/duty-situation/training', '/duty-plan', '/contact-review',
  '/ai-center', '/admin', '/admin/bridges', '/video', '/night-market/command',
  '/command/workbench?surface=display',
];
const PET = '[data-testid="xiaoan-pet"]';
const PANEL = '#xiaoan-assistant-dialog';
const LAUNCHER = '.xiaoan-pet-launcher';
const AVATAR = '.xiaoan-avatar canvas';
const MESSAGES = '.xiaoan-message-user, .xiaoan-message-answer';
const BACK = '\u8fd4\u56de\u5c0f\u5b89\u9996\u9875';
const CLOSE = '\u6536\u8d77\u5c0f\u5b89\u5bf9\u8bdd\u9762\u677f';
const HIDE = '\u6536\u8d77\u5c0f\u5b89';
const RECOVER = '\u6062\u590d\u5c0f\u5b89\u52a9\u624b';
const INPUT = '\u7ed9\u5c0f\u5b89\u7559\u8a00';
const SEND = '\u53d1\u9001\u7ed9\u5c0f\u5b89';
const checks = [];
await fs.mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true, channel, timeout: 20_000 });

const button = (page, name) => page.getByRole('button', { name, exact: true });
const input = page => page.getByRole('textbox', { name: INPUT, exact: true });
const pet = page => page.locator(PET);
const panel = page => page.locator(PANEL);

async function eventually(check, label, timeout = 5000) {
  const deadline = Date.now() + timeout;
  let last;
  do {
    try { return await check(); } catch (error) { last = error; }
    await sleep(80);
  } while (Date.now() < deadline);
  throw new Error(`${label}: ${last?.message}`, { cause: last });
}

async function singlePet(page) {
  await eventually(async () => {
    assert.equal(await page.locator(`${PET}:visible`).count(), 1, 'Exactly one visible global Xiaoan pet');
  }, 'Global pet visibility');
}

async function box(locator) {
  const value = await locator.boundingBox();
  assert.ok(value && value.width > 0 && value.height > 0, `Missing visible bounds: ${locator}`);
  return value;
}

function samePosition(actual, expected, label) {
  for (const axis of ['x', 'y']) {
    assert.ok(Math.abs(actual[axis] - expected[axis]) <= 2,
      `${label}: ${axis} expected ${expected[axis]}, got ${actual[axis]}`);
  }
}

async function openPanel(page) {
  await singlePet(page);
  await page.locator(LAUNCHER).click();
  await panel(page).waitFor({ state: 'visible' });
  assert.equal(await page.locator(`${PANEL}:visible`).count(), 1);
  assert.equal(await page.locator(LAUNCHER).getAttribute('aria-expanded'), 'true');
}

async function bounds(page, withPanel = true) {
  await singlePet(page);
  const selectors = [PET, LAUNCHER, AVATAR];
  if (withPanel) {
    await panel(page).waitFor({ state: 'visible' });
    selectors.push(PANEL, `${PANEL} .xiaoan-panel-header`, `${PANEL} .xiaoan-composer`,
      `${PANEL} textarea`, `${PANEL} button[aria-label="${CLOSE}"]`);
  }
  const viewport = await page.evaluate(() => ({ width: innerWidth, height: innerHeight }));
  for (const selector of selectors) {
    const rect = await box(page.locator(selector));
    assert.ok(rect.x >= -1 && rect.y >= -1
      && rect.x + rect.width <= viewport.width + 1 && rect.y + rect.height <= viewport.height + 1,
    `${selector} is outside viewport: ${JSON.stringify({ rect, viewport })}`);
  }
  // A CSS-visible pet can still be covered by the compact panel or fullscreen top layer.
  const exposed = await page.locator(AVATAR).evaluate(canvas => {
    const rect = canvas.getBoundingClientRect();
    return [.25, .5, .75].some(fraction => {
      const hit = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height * fraction);
      return Boolean(hit?.closest('[data-testid="xiaoan-pet"]'));
    });
  });
  assert.ok(exposed, 'Avatar must be visibly exposed, not covered by its open panel');
}

async function artwork(page, record) {
  const canvas = page.locator(AVATAR);
  await canvas.waitFor({ state: 'visible' });
  await eventually(async () => {
    const pixels = await canvas.evaluate(element => {
      const ctx = element.getContext('2d');
      if (!ctx || !element.width || !element.height) return { painted: 0, transparent: 0, colors: 0, colorful: 0 };
      const data = ctx.getImageData(0, 0, element.width, element.height).data;
      let painted = 0;
      let transparent = 0;
      let colorful = 0;
      const colors = new Set();
      for (let i = 0; i < data.length; i += 4) {
        const [r, g, b, a] = data.subarray(i, i + 4);
        if (a < 8) transparent++;
        if (a > 180) {
          painted++;
          colors.add(`${r >> 4},${g >> 4},${b >> 4}`);
          if (Math.max(r, g, b) - Math.min(r, g, b) > 25) colorful++;
        }
      }
      const total = element.width * element.height;
      return {
        painted: painted / total, transparent: transparent / total,
        colorful: colorful / total, colors: colors.size,
        opacity: Number(getComputedStyle(element).opacity),
        width: element.width, height: element.height,
      };
    });
    record.artwork = pixels;
    assert.ok(pixels.opacity > .9, 'Canvas must be displayed, not only its fallback image');
    assert.ok(pixels.painted > .03, `Canvas must contain opaque artwork: ${JSON.stringify(pixels)}`);
    assert.ok(pixels.transparent > .1, 'Avatar canvas must preserve a transparent cutout background');
    assert.ok(pixels.colors >= 16 && pixels.colorful > .01, 'Avatar must have multicolor artwork, not a solid placeholder');
  }, 'Avatar alpha/color pixels');
}

async function screenshot(page, record, suffix) {
  const filename = `${record.id}-${suffix}.png`;
  await page.screenshot({ path: path.join(output, filename), fullPage: false, animations: 'disabled', timeout: 5000 });
  record.screenshots.push(filename);
}

async function drag(page, handle, dx, dy) {
  const start = await handle.evaluate(element => {
    const rect = element.getBoundingClientRect();
    const copy = element.querySelector('.xiaoan-header-copy')?.getBoundingClientRect();
    // Header padding over the title is blank and cannot hit Back/Close/Info controls.
    const x = copy ? copy.x + copy.width / 2 : rect.x + rect.width / 2;
    const y = copy ? rect.y + 5 : rect.y + rect.height * .45;
    const hit = document.elementFromPoint(x, y);
    const interactive = hit?.closest('button, a, input, textarea, select, [role="button"]');
    return { x, y, valid: Boolean(hit && element.contains(hit) && (!copy || !interactive)) };
  });
  assert.ok(start.valid, 'Drag must start on the avatar or blank header title region, never a header action');
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  try {
    await page.mouse.move(start.x + dx, start.y + dy, { steps: 12 });
    await sleep(100);
    const held = { pet: await box(pet(page)), panel: await panel(page).isVisible() ? await box(panel(page)) : null };
    await page.mouse.up();
    await sleep(250);
    return { held, released: { pet: await box(pet(page)), panel: await panel(page).isVisible() ? await box(panel(page)) : null } };
  } finally {
    await page.mouse.up();
  }
}

async function freeze(page) {
  // Installed before navigation; freeze only after initial rendering is complete.
  await page.clock.pauseAt(await page.evaluate(() => Date.now() + 100));
}

async function send(page, text) {
  await input(page).fill(text);
  await button(page, SEND).click();
  await eventually(async () => {
    assert.equal(await page.locator('.xiaoan-transcript').getAttribute('aria-busy'), 'true');
  }, 'Reply must be pending');
}

async function seedConversation(page) {
  await openPanel(page);
  await freeze(page);
  await send(page, 'QA continuity hello');
  await page.clock.runFor(15_000);
  await eventually(async () => {
    assert.equal(await page.locator('.xiaoan-transcript').getAttribute('aria-busy'), 'false');
    assert.equal(await page.locator('.xiaoan-message-answer[data-status="complete"]').count(), 1);
  }, 'Seed reply completes');
  await input(page).fill('QA unsent draft');
  return {
    messages: await page.locator(MESSAGES).allTextContents(),
    draft: await input(page).inputValue(),
    position: await box(pet(page)),
    documentToken: await page.evaluate(() => {
      window.__xiaoanQADocumentToken = `${performance.timeOrigin}-${Math.random()}`;
      return window.__xiaoanQADocumentToken;
    }),
  };
}

async function continuity(page, state) {
  await singlePet(page);
  await panel(page).waitFor({ state: 'visible' });
  assert.equal(await page.evaluate(() => window.__xiaoanQADocumentToken), state.documentToken,
    'Navigation must stay in the same document, not reload from persisted storage');
  assert.deepEqual(await page.locator(MESSAGES).allTextContents(), state.messages, 'Messages survive navigation');
  assert.equal(await input(page).inputValue(), state.draft, 'Draft survives navigation');
  samePosition(await box(pet(page)), state.position, 'Avatar position survives navigation');
}

async function navigate(page, record, target, control) {
  if (control) {
    record.navigation.push({ mechanism: 'actual UI control', target, control: control.toString() });
    await control.click();
  } else {
    record.navigation.push({ mechanism: 'synthetic history.pushState + popstate', target });
    await page.evaluate(url => {
      history.pushState({}, '', url);
      dispatchEvent(new PopStateEvent('popstate'));
    }, `${base}${target}`);
  }
  await page.waitForURL(url => url.pathname === new URL(`${base}${target}`).pathname, { timeout: 5000 });
  const destination = {
    '/platform': '.overview-page',
    '/video': '.bridge-video-page',
    '/night-market/command': '.nightmarket-page',
    '/duty-situation': '.duty-situation-page',
    '/duty-situation/training': '.officer-training-workspace',
    '/command/workbench?surface=display': '.command-display-shell',
    '/case': '.case-domain-page',
  }[target];
  assert.ok(destination, `A rendered destination marker is required for ${target}`);
  await page.locator(destination).waitFor({ state: 'visible' });
}

async function run(name, body, { route = '/platform', viewport = desktop, clock = false, touch = false } = {}) {
  if (process.env.XIAOAN_QA_FILTER && !name.includes(process.env.XIAOAN_QA_FILTER)) return;
  const record = {
    id: String(checks.length + 1).padStart(2, '0'), name, route, viewport,
    passed: false, errors: [], consoleErrors: [], requestFailures: [], blocked: [],
    navigation: [], screenshots: [],
  };
  checks.push(record);
  let context;
  let page;
  let deadline;
  const started = Date.now();
  try {
    context = await browser.newContext({ viewport, hasTouch: touch, reducedMotion: 'reduce', serviceWorkers: 'block', acceptDownloads: false });
    context.setDefaultTimeout(5000);
    context.setDefaultNavigationTimeout(12_000);
    // No hardware/API traffic is allowed, including background requests on route mount.
    await context.route('**/*', async routeHandle => {
      const request = routeHandle.request();
      const url = new URL(request.url());
      const api = /\/api(?:\/|$)/.test(url.pathname);
      const blocked = api || url.origin !== new URL(base).origin
        || !['GET', 'HEAD'].includes(request.method())
        || ['fetch', 'xhr', 'eventsource', 'media'].includes(request.resourceType());
      if (!blocked) return routeHandle.continue();
      record.blocked.push({ url: request.url(), method: request.method(), fixture: api ? 503 : 'aborted' });
      if (api) return routeHandle.fulfill({
        status: 503, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' },
        json: { detail: 'Xiaoan regression fixture offline; no hardware or business mutations' },
      });
      return routeHandle.abort('blockedbyclient');
    });
    assert.equal(typeof context.routeWebSocket, 'function', 'Playwright with routeWebSocket support is required for network isolation');
    await context.routeWebSocket('**/*', socket => {
      record.blocked.push({ url: socket.url(), fixture: 'WebSocket closed without connecting' });
      socket.close();
    });
    await context.addInitScript(() => {
      localStorage.setItem('xiaoan-assistant:muted:v1', '1');
      if (!localStorage.getItem('xiaoan-assistant:position:v1')) {
        localStorage.setItem('xiaoan-assistant:position:v1', JSON.stringify({ x: 950, y: 630 }));
      }
    });
    page = await context.newPage();
    page.on('pageerror', error => record.errors.push(error.stack || error.message));
    page.on('crash', () => record.errors.push('Page crashed'));
    page.on('console', message => {
      if (message.type() === 'error') record.consoleErrors.push({ text: message.text(), location: message.location() });
    });
    page.on('requestfailed', request => record.requestFailures.push({ url: request.url(), error: request.failure()?.errorText }));
    if (clock) await page.clock.install();
    const work = async () => {
      await page.goto(`${base}${route}`, { waitUntil: 'domcontentloaded' });
      await page.locator('#root > *').first().waitFor({ state: 'attached' });
      await body(page, record);
      assert.deepEqual(record.errors, [], 'No uncaught page errors');
    };
    await Promise.race([
      work(),
      new Promise((_, reject) => {
        deadline = setTimeout(() => reject(new Error(`Test exceeded 40 seconds: ${name}`)), 40_000);
      }),
    ]);
    record.passed = true;
  } catch (error) {
    record.failure = error.stack || String(error);
    if (page && !page.isClosed()) {
      await screenshot(page, record, 'failure').catch(captureError => {
        record.screenshotError = captureError.message;
      });
    }
  } finally {
    clearTimeout(deadline);
    await context?.close().catch(error => {
      record.passed = false;
      record.errors.push(`Context cleanup: ${error.message}`);
    });
    if (record.errors.length) record.passed = false;
    record.durationMs = Date.now() - started;
    console.log(`${record.passed ? 'PASS' : 'FAIL'} ${record.name}${record.failure ? `: ${record.failure.split('\n')[0]}` : ''}`);
  }
}

try {
  for (const route of routes) {
    await run(`global singleton: ${route}`, async page => {
      await singlePet(page);
      await openPanel(page);
    }, { route });
  }

  await run('free drag release preserves both coordinates without snapping', async (page, record) => {
    await singlePet(page);
    const origin = await box(pet(page));
    const movement = await drag(page, page.locator(LAUNCHER), -137, -83);
    record.movement = movement;
    samePosition(movement.held.pet, { x: origin.x - 137, y: origin.y - 83 }, 'Held free drag');
    samePosition(movement.released.pet, movement.held.pet, 'Release must not snap to an edge');
    assert.equal(await panel(page).isVisible(), false, 'Dragging must not trigger the launcher click');
    await page.reload();
    await singlePet(page);
    samePosition(await box(pet(page)), movement.released.pet, 'Released coordinates survive a document reload');
  });

  await run('resize interrupts a drag without opening the conversation', async page => {
    await singlePet(page);
    const start = await box(pet(page));
    await page.mouse.move(start.x + 64, start.y + 100);
    await page.mouse.down();
    await page.mouse.move(start.x - 90, start.y - 30, { steps: 8 });
    await page.setViewportSize({ width: 1400, height: 960 });
    await page.mouse.up();
    await sleep(250);
    assert.equal(await panel(page).isVisible(), false, 'Resize must suppress the release click of an interrupted drag');
    assert.notEqual(await pet(page).getAttribute('data-phase'), 'dragging');
    await bounds(page, false);
  });

  for (const [name, selector] of [['avatar', LAUNCHER], ['blank panel header', '.xiaoan-panel-header']]) {
    await run(`open panel and pet move together: ${name}`, async (page, record) => {
      await openPanel(page);
      const origin = { pet: await box(pet(page)), panel: await box(panel(page)) };
      const movement = await drag(page, page.locator(selector), -73, -61);
      record.movement = { origin, ...movement };
      for (const state of ['held', 'released']) {
        assert.ok(movement[state].panel, 'Dragging must keep the panel open');
        for (const part of ['pet', 'panel']) {
          samePosition(movement[state][part], { x: origin[part].x - 73, y: origin[part].y - 61 }, `${state} ${part}`);
        }
      }
    });
  }

  await run('Back clears completed messages and draft without closing or moving', async page => {
    const state = await seedConversation(page);
    await button(page, BACK).click();
    await panel(page).waitFor({ state: 'visible' });
    assert.equal(await page.locator(MESSAGES).count(), 0);
    assert.equal(await input(page).inputValue(), '');
    await page.locator('.xiaoan-welcome').waitFor({ state: 'visible' });
    samePosition(await box(pet(page)), state.position, 'Back keeps avatar position');
  }, { clock: true });

  for (const phase of ['thinking', 'streaming']) {
    await run(`Back cancels ${phase} replies and permits a fresh conversation`, async page => {
      await openPanel(page);
      await freeze(page);
      const position = await box(pet(page));
      await send(page, `QA cancelled ${phase} reply`);
      if (phase === 'streaming') {
        await page.clock.runFor(1100);
        assert.equal(await page.locator('.xiaoan-message-answer[data-status="streaming"]').count(), 1);
      } else {
        assert.equal(await page.locator('.xiaoan-message-answer').count(), 0);
      }
      await input(page).fill('QA pending draft to clear');
      await button(page, BACK).click();
      await page.clock.runFor(15_000);
      assert.equal(await panel(page).isVisible(), true);
      assert.equal(await page.locator(MESSAGES).count(), 0, 'Cancelled callbacks must never repopulate the transcript');
      assert.equal(await input(page).inputValue(), '');
      assert.equal(await page.locator('.xiaoan-transcript').getAttribute('aria-busy'), 'false');
      samePosition(await box(pet(page)), position, 'Pending Back keeps avatar position');
      await send(page, 'QA fresh conversation');
      await page.clock.runFor(15_000);
      assert.equal(await page.locator('.xiaoan-message-user').count(), 1);
      assert.equal(await page.locator('.xiaoan-message-answer[data-status="complete"]').count(), 1);
    }, { clock: true });
  }

  await run('Close hides only the panel and preserves messages, draft, and position', async page => {
    const state = await seedConversation(page);
    await button(page, CLOSE).click();
    await panel(page).waitFor({ state: 'hidden' });
    await singlePet(page);
    samePosition(await box(pet(page)), state.position, 'Close keeps avatar position');
    await openPanel(page);
    await continuity(page, state);
  }, { clock: true });

  for (const route of ['/platform', '/video', '/duty-situation/training', '/command/workbench?surface=display']) {
    await run(`Hide and global fallback recovery: ${route}`, async page => {
      await openPanel(page);
      const position = await box(pet(page));
      await pet(page).hover();
      await button(page, HIDE).click();
      await pet(page).waitFor({ state: 'hidden' });
      await panel(page).waitFor({ state: 'hidden' });
      assert.equal(await button(page, RECOVER).count(), 1, 'Exactly one global recovery control');
      await button(page, RECOVER).click();
      await singlePet(page);
      samePosition(await box(pet(page)), position, 'Recover keeps avatar position');
      if (!await panel(page).isVisible()) await openPanel(page);
    }, { route });
  }

  await run('actual navigation continuity: shell -> video -> night market -> video -> shell', async (page, record) => {
    const state = await seedConversation(page);
    await navigate(page, record, '/video', page.locator('#platform-control-sidebar').getByRole('button', {
      name: '\u89c6\u9891\u8054\u52a8', exact: true,
    }));
    await continuity(page, state);
    await navigate(page, record, '/night-market/command',
      page.locator('.monitoring-desktop-nav').getByRole('button', { name: '\u6307\u6325\u6001\u52bf', exact: true }));
    await continuity(page, state);
    await navigate(page, record, '/video', button(page, '\u8fd4\u56de\u9879\u76ee\u5165\u53e3'));
    await continuity(page, state);
    await navigate(page, record, '/platform', button(page, '\u8fd4\u56de\u5e73\u53f0'));
    await continuity(page, state);
  }, { clock: true });

  await run('actual navigation continuity: training -> duty situation -> shell', async (page, record) => {
    const state = await seedConversation(page);
    await navigate(page, record, '/duty-situation', button(page, '\u8fd4\u56de\u52e4\u52a1\u6001\u52bf'));
    await continuity(page, state);
    await navigate(page, record, '/platform', button(page, '\u8fd4\u56de\u5e73\u53f0\u603b\u89c8'));
    await continuity(page, state);
  }, { route: '/duty-situation/training', clock: true });

  await run('popstate continuity across standalone, display, and shell routes', async (page, record) => {
    const state = await seedConversation(page);
    for (const target of ['/duty-situation', '/duty-situation/training', '/command/workbench?surface=display', '/case', '/platform']) {
      await navigate(page, record, target);
      assert.equal(new URL(page.url()).search, new URL(`${base}${target}`).search, 'Display query survives routing');
      await continuity(page, state);
    }
  }, { clock: true });

  await run('assistant course links keep the document and conversation alive', async (page, record) => {
    await openPanel(page);
    await freeze(page);
    await send(page, '\u4eca\u65e5\u8bad\u7ec3\u65b9\u6848');
    await page.clock.runFor(15_000);
    await page.locator('.xiaoan-training-links a').first().waitFor();
    await input(page).fill('QA retained course draft');
    const state = {
      messages: await page.locator(MESSAGES).allTextContents(),
      draft: await input(page).inputValue(),
      position: await box(pet(page)),
      documentToken: await page.evaluate(() => {
        window.__xiaoanQADocumentToken = 'course-document';
        return window.__xiaoanQADocumentToken;
      }),
    };
    await navigate(page, record, '/duty-situation/training', page.locator('.xiaoan-training-links a').first());
    assert.equal(new URL(page.url()).searchParams.get('task'), 'TRAIN-READINESS-001');
    await continuity(page, state);
    await page.clock.runFor(1000);
    await page.locator('.ot-sync.online').waitFor();
    assert.equal(await page.getByLabel('\u8bad\u7ec3\u5bf9\u8c61', { exact: true }).inputValue(), 'DEMO-OFFICER-017');
    await page.locator('.xiaoan-training-links a').nth(1).click();
    await page.clock.runFor(1000);
    await eventually(async () => {
      assert.equal(await page.getByLabel('\u8bad\u7ec3\u5bf9\u8c61', { exact: true }).inputValue(), 'DEMO-OFFICER-018',
        'A second course link updates an already mounted training page');
    }, 'Same-route course selection');
    await continuity(page, state);
  }, { clock: true });

  await run('transcript selection and scrolling do not move the assistant', async page => {
    const state = await seedConversation(page);
    const text = page.locator('.xiaoan-message-user p');
    await text.scrollIntoViewIfNeeded();
    const rect = await box(text);
    await page.mouse.move(rect.x + 10, rect.y + rect.height / 2);
    await page.mouse.down();
    await page.mouse.move(rect.x + rect.width - 10, rect.y + rect.height / 2, { steps: 6 });
    await page.mouse.up();
    assert.ok(await page.evaluate(() => String(window.getSelection()).length > 0), 'Transcript text remains selectable');
    samePosition(await box(pet(page)), state.position, 'Text selection does not drag the assistant');
    await page.locator('.xiaoan-transcript').hover();
    await page.mouse.wheel(0, 400);
    samePosition(await box(pet(page)), state.position, 'Transcript scroll does not drag the assistant');
  }, { clock: true });

  await run('mobile touch drags avatar and open header as one group', async (page, record) => {
    await singlePet(page);
    await page.evaluate(() => {
      window.__xiaoanTouchEvents = [];
      for (const name of ['pointerdown', 'pointermove', 'pointerup', 'pointercancel', 'lostpointercapture', 'resize']) {
        window.addEventListener(name, event => window.__xiaoanTouchEvents.push({
          type: event.type, x: event.clientX, y: event.clientY,
          top: document.querySelector('.xiaoan-assistant-group')?.style.top,
        }), true);
      }
    });
    const cdp = await page.context().newCDPSession(page);
    const touchDrag = async (handle, dy) => {
      const rect = await box(handle);
      const x = rect.x + rect.width / 2;
      const y = rect.y + (handle === header ? 5 : 90);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
      for (let step = 1; step <= 8; step++) {
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y + dy * step / 8 }] });
      }
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      // CDP touch delivery and compositor bounds settle on separate frames.
      await sleep(250);
      record.touchEvents = await page.evaluate(() => window.__xiaoanTouchEvents);
    };
    const header = page.locator('.xiaoan-panel-header');
    const before = await box(pet(page));
    await touchDrag(page.locator(LAUNCHER), -70);
    samePosition(await box(pet(page)), { x: before.x, y: before.y - 70 }, 'Touch release is not snapped');
    assert.equal(await panel(page).isVisible(), false);
    await openPanel(page);
    const origin = { pet: await box(pet(page)), panel: await box(panel(page)) };
    await touchDrag(header, -30);
    for (const [part, locator] of [['pet', pet(page)], ['panel', panel(page)]]) {
      samePosition(await box(locator), { x: origin[part].x, y: origin[part].y - 30 }, `Touch ${part} moves jointly`);
    }
    await bounds(page);
    await cdp.detach();
  }, { viewport: { width: 390, height: 844 }, touch: true });

  await run('hidden state and recovery survive standalone navigation', async (page, record) => {
    await singlePet(page);
    await pet(page).hover();
    await button(page, HIDE).click();
    for (const target of ['/video', '/command/workbench?surface=display', '/platform']) {
      await navigate(page, record, target);
      assert.equal(await page.locator(`${PET}:visible`).count(), 0, 'Hidden pet must not resurrect during routing');
      assert.equal(await button(page, RECOVER).isVisible(), true, 'Recovery remains globally reachable');
    }
    await button(page, RECOVER).click();
    await singlePet(page);
  });

  for (const [name, viewport] of viewports) {
    await run(`resize bounds and canvas artwork: ${name} ${viewport.width}x${viewport.height}`, async (page, record) => {
      await openPanel(page);
      // Each target starts from desktop with an already open panel.
      await page.setViewportSize(viewport);
      await sleep(250);
      await screenshot(page, record, `${name}-open`);
      await bounds(page);
      await artwork(page, record);
      await input(page).fill('QA visible send');
      const sendButton = button(page, SEND);
      const reachable = await sendButton.evaluate(element => {
        const rect = element.getBoundingClientRect();
        return element.contains(document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2));
      });
      assert.equal(reachable, true, 'Send must be exposed, not clipped by a short panel');
      await button(page, CLOSE).click();
      await bounds(page, false);
      await openPanel(page);
      await bounds(page);
      await page.setViewportSize(desktop);
      await sleep(150);
      await bounds(page);
    });
  }

  for (const route of ['/video', '/duty-situation']) {
    await run(`actual page-root Fullscreen keeps assistant reachable: ${route}`, async (page, record) => {
      await openPanel(page);
      await button(page, '\u8fdb\u5165\u5168\u5c4f').click();
      await page.waitForFunction(() => Boolean(document.fullscreenElement), null, { timeout: 5000 });
      record.fullscreen = await page.evaluate(() => {
        const root = document.fullscreenElement;
        return {
          tag: root.tagName, className: root.className,
          petContained: root.contains(document.querySelector('[data-testid="xiaoan-pet"]')),
          panelContained: root.contains(document.querySelector('#xiaoan-assistant-dialog')),
        };
      });
      assert.equal(record.fullscreen.petContained, true, 'Global pet must be inside the actual fullscreen subtree');
      assert.equal(record.fullscreen.panelContained, true, 'Open panel must remain in fullscreen subtree');
      await bounds(page);
      await button(page, '\u5173\u4e8e\u5c0f\u5b89').click();
      const disclosure = page.locator('.ant-popover:visible');
      await disclosure.waitFor();
      assert.equal(await disclosure.evaluate(element => document.fullscreenElement.contains(element)), true,
        'Assistant popup stays in the fullscreen subtree');
      await eventually(async () => {
        const exposed = await disclosure.evaluate(element => {
          const rect = element.getBoundingClientRect();
          return rect.x >= 0 && rect.y >= 0 && rect.right <= innerWidth && rect.bottom <= innerHeight
            && element.contains(document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2));
        });
        assert.equal(exposed, true, 'Fullscreen popup is aligned inside the viewport and passes hit testing');
      }, 'Fullscreen popup alignment');
      await button(page, '\u5173\u4e8e\u5c0f\u5b89').click();
      await screenshot(page, record, 'fullscreen');
      await button(page, CLOSE).click();
      await openPanel(page);
      await button(page, '\u9000\u51fa\u5168\u5c4f').click();
      await page.waitForFunction(() => !document.fullscreenElement);
      await bounds(page);
    }, { route });
  }
} finally {
  await browser.close();
  const passed = checks.length > 0 && checks.every(check => check.passed);
  const report = {
    base, channel, output, passed, checks,
    assumptions: [
      'An existing dashboard server is required; this verifier never starts a server.',
      'Playwright Clock and BrowserContext.routeWebSocket are required.',
      'Fresh contexts seed only Xiaoan position and mute state; no application business data is changed.',
      'API requests return an offline 503 fixture; other fetch/XHR/media, cross-origin requests and WebSockets are blocked.',
      'Console/network errors are captured separately; expected offline responses do not fail tests. Uncaught page errors do.',
      'Reduced motion removes decorative geometry jitter. Bounds and screenshots cover the viewport, not unrelated page overflow.',
      'Navigation records distinguish actual controls from explicit pushState plus popstate; no route-continuity test uses page.goto.',
      'Fullscreen is requested through the existing page control; refusal or a missing control is reported as a failure, not skipped.',
    ],
  };
  await fs.writeFile(path.join(output, 'results.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({
    passed, total: checks.length, failed: checks.filter(check => !check.passed).map(check => check.name), output,
  }, null, 2));
  if (!passed) process.exitCode = 1;
}
