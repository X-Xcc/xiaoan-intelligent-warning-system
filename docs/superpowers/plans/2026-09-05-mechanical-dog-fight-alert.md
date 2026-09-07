# Mechanical Dog Fight Alert Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a mechanical-dog channel 01 and an `Alt + M` fight-alert review modal with evidence capture, Qwen review, and simulation-only response actions.

**Architecture:** The change remains local to `VideoLinkagePage.tsx`, using the existing captured-frame and `/security-ai/judgements` flow. A fallback report makes the dialog useful without a configured model. Dialog styling is scoped to `styles.css`; a Node source-contract verifier checks the nonvisual feature boundary.

**Tech Stack:** React 19, TypeScript, Ant Design Modal, Lucide React, Vite, existing Qwen-compatible API.

---

### Task 1: Define the channel-01 source model

**Files:**
- Create: `scripts/verify_mechanical_dog_alert_frontend.mjs`
- Modify: `apps/dashboard/src/pages/VideoLinkagePage.tsx`

- [ ] **Step 1: Create the failing verifier**

```js
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const source = readFileSync('apps/dashboard/src/pages/VideoLinkagePage.tsx', 'utf8');
assert.match(source, /mechanicalDogFallbackFeed/);
assert.match(source, /fightAlertOpen/);
assert.match(source, /altKey && event\.key\.toLowerCase\(\) === 'm'/);
assert.match(source, /疑似肢体冲突/);
console.log('mechanical dog alert frontend contract passed');
```

- [ ] **Step 2: Confirm it fails**

Run: `node scripts/verify_mechanical_dog_alert_frontend.mjs`

Expected: `AssertionError` because no feature symbols exist yet.

- [ ] **Step 3: Add the source metadata and report type**

Add the constants `mechanicalDogFallbackFeed` and `mechanicalDogMeta`, a `FightAlertReport` type with time/source/risk/summary/observations/recommendations fields, and `buildFallbackFightReport()`. The fallback uses cautious wording: `疑似肢体冲突`, `暂未观察到明确倒地人员`, and `未见明确危险物`.

- [ ] **Step 4: Render 01 as the mechanical-dog identity**

Keep `channels[0]` bound to `local` and create a `displayCamera` only for tile-01 labels. When local camera permission is not granted, show `/night-market-cam-02.png`; when granted, show the live video. Keep the existing local-source guard for routes 02–16.

- [ ] **Step 5: Re-run and commit**

Run: `node scripts/verify_mechanical_dog_alert_frontend.mjs`

Expected: `mechanical dog alert frontend contract passed`.

Commit: `git add apps/dashboard/src/pages/VideoLinkagePage.tsx scripts/verify_mechanical_dog_alert_frontend.mjs && git commit -m "feat: add mechanical dog alert source model"`

### Task 2: Implement Alt+M analysis and the dialog

**Files:**
- Modify: `apps/dashboard/src/pages/VideoLinkagePage.tsx`
- Modify: `scripts/verify_mechanical_dog_alert_frontend.mjs`

- [ ] **Step 1: Extend the verifier with modal expectations**

```js
assert.match(source, /Modal/);
assert.match(source, /captureFrameForChannel\(0\)/);
assert.match(source, /setFightAlertOpen\(true\)/);
assert.match(source, /event\.key === 'Escape'/);
assert.match(source, /发起处置/);
assert.match(source, /保全证据/);
```

- [ ] **Step 2: Confirm the added assertions fail**

Run: `node scripts/verify_mechanical_dog_alert_frontend.mjs`

Expected: `AssertionError` for absent modal behavior.

- [ ] **Step 3: Add state and capture helper**

Add state for `fightAlertOpen`, `fightAlertFrame`, `fightAlertReport`, `fightAlertLoading`, and `fightAlertNotice`. Refactor capture to `captureFrameForChannel(channelIndex)` while preserving `captureSelectedFrame()` as the selected-channel wrapper.

- [ ] **Step 4: Add the keyboard and review request**

Add a page-level key listener that ignores form fields, calls `openFightAlert()` for `Alt + M`, and closes for `Escape`. `openFightAlert()` selects channel 0, captures its frame, immediately opens the fallback report, and posts this shape to the existing route:

```ts
{ cameraId: 'local', cameraName: mechanicalDogMeta.name, ...frame,
  detection: { people: formatCount(detection.people), fire: formatCount(detection.fire), abnormal: formatCount(detection.abnormal), distance: formatCount(detection.distance) } }
```

Map cloud output to the report. If the endpoint is absent or unconfigured, retain the fallback and show `本地演示研判`.

- [ ] **Step 5: Render the controlled dialog**

Import `Modal` and render a controlled dialog with a source-video column, an evidence-frame column, the complete report, and four actions: `发起处置`, `请求增援`, `保全证据`, `关闭`. Each action updates local feedback only; it must not issue a real dispatch or emergency call.

- [ ] **Step 6: Re-run and commit**

Run: `node scripts/verify_mechanical_dog_alert_frontend.mjs`

Expected: `mechanical dog alert frontend contract passed`.

Commit: `git add apps/dashboard/src/pages/VideoLinkagePage.tsx scripts/verify_mechanical_dog_alert_frontend.mjs && git commit -m "feat: add alt-m fight alert review modal"`

### Task 3: Style and validate

**Files:**
- Modify: `apps/dashboard/src/styles.css`
- Modify: `scripts/verify_mechanical_dog_alert_frontend.mjs`

- [ ] **Step 1: Extend the verifier for CSS boundaries**

```js
const css = readFileSync('apps/dashboard/src/styles.css', 'utf8');
assert.match(css, /\.fight-alert-modal/);
assert.match(css, /\.fight-alert-source/);
assert.match(css, /\.fight-alert-evidence/);
assert.match(css, /\.fight-alert-recommendation/);
```

- [ ] **Step 2: Confirm CSS assertions fail**

Run: `node scripts/verify_mechanical_dog_alert_frontend.mjs`

Expected: `AssertionError` for missing CSS classes.

- [ ] **Step 3: Add scoped monitoring styles**

Use a dark two-column dialog at desktop sizes, a stable evidence-image aspect ratio, amber risk labels, compact camera HUD overlays, stacked recommendations, and a single-column layout below 820px. Maintain 4–8px corner radii and prevent text/button overflow.

- [ ] **Step 4: Run build verification**

Run: `node scripts/verify_mechanical_dog_alert_frontend.mjs && npm run dashboard:build`

Expected: the verifier prints its pass message and Vite exits successfully.

- [ ] **Step 5: Check the live interaction**

Run: `npm run dashboard:dev`

Open `http://127.0.0.1:5177/video`, press `Alt + M`, then confirm 01 source/fallback, evidence frame, semantic report, cloud/fallback notice, all four actions, close control, and `Escape`.

- [ ] **Step 6: Commit the visual work**

Commit: `git add apps/dashboard/src/styles.css scripts/verify_mechanical_dog_alert_frontend.mjs && git commit -m "feat: style mechanical dog fight alert"`

## Plan Review

- Spec coverage: Task 1 sets the 01 identity without changing 02–16; Task 2 provides shortcut capture, Qwen review and safe action controls; Task 3 adds responsive monitoring presentation and verification.
- Placeholder scan: all files, state names, endpoints, commands and checks are specified.
- Type consistency: `FightAlertReport`, `buildFallbackFightReport`, `captureFrameForChannel`, `fightAlertOpen`, and CSS class names are used consistently.
