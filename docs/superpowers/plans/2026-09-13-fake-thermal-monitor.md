# Fake Thermal Monitor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a realistic-looking, low-cost fake thermal-imaging monitor to training page route 02 while preserving a clean future switch to the existing device-bridge preview.

**Architecture:** Keep route 03 on the existing `BridgePreview` and isolate route 02 behind a new `FakeThermalMonitor` component. The fake component owns only local animation state and CSS visuals; `TrainingCameraPreview` owns slot selection, refresh keys, and the future source boundary. No server, device registry, Go2 driver, or persisted binding changes are required.

**Tech Stack:** React 19, TypeScript, CSS, Node test runner, Vite.

---

### Task 1: Add the fake thermal monitor component

**Files:**
- Create: `apps/dashboard/src/components/FakeThermalMonitor.tsx`
- Modify: `apps/dashboard/src/styles/officer-training.css`

- [ ] **Step 1: Add the component contract**

Create a component with the display inputs needed by the existing monitor preview and an explicit refresh boundary:

```tsx
export function FakeThermalMonitor({
  compact = true,
  animationKey = 0,
}: {
  compact?: boolean;
  animationKey?: number;
}) {
  return (
    <div className={`ot-fake-thermal ${compact ? 'compact' : ''}`} data-preview-mode="demo"
      data-preview-state="live" data-animation-key={animationKey}>
      ...
    </div>
  );
}
```

The component must not import or call `useBridgeInventory`, `bridgeMediaUrl`, `fetch`, or any device API.

- [ ] **Step 2: Render the visual telemetry shell**

Render these local-only elements inside the fixed 16:9 monitor:

```tsx
<div className="ot-fake-thermal__grid" aria-hidden="true" />
<div className="ot-fake-thermal__scan" aria-hidden="true" />
<div className="ot-fake-thermal__dog" aria-hidden="true">
  <span className="ot-fake-thermal__head" />
  <span className="ot-fake-thermal__leg ot-fake-thermal__leg--front" />
  <span className="ot-fake-thermal__leg ot-fake-thermal__leg--rear" />
</div>
<span className="ot-fake-thermal__rec">REC</span>
<span className="ot-fake-thermal__device">DOG-02</span>
<span className="ot-fake-thermal__label">机械狗巡检视角 · 热成像</span>
<span className="ot-fake-thermal__demo">演示画面</span>
<span className="ot-fake-thermal__time">{format time}</span>
<div className="ot-fake-thermal__scale" aria-hidden="true">...</div>
```

Use `useState(Date.now)` and a one-second interval for the timestamp. The parent monitor toolbar owns refresh; the component only receives `animationKey`, which makes the refresh boundary explicit without giving the fake component access to bridge services. Do not expose fake temperature values or fake detection conclusions.

- [ ] **Step 3: Add CSS-only motion and responsive sizing**

Add styles beside the existing `.ot-training-monitors` rules:

```css
.ot-fake-thermal {
  position: relative;
  aspect-ratio: 16 / 9;
  overflow: hidden;
  color: #d7ffe8;
  background: linear-gradient(135deg, #161b2a 0%, #45224f 34%, #b43c3d 60%, #f0a044 100%);
}
.ot-fake-thermal__scan {
  position: absolute;
  inset: 0 auto auto 0;
  width: 100%;
  height: 2px;
  background: #b6ffdcaa;
  animation: ot-fake-thermal-scan 4.8s linear infinite;
}
@keyframes ot-fake-thermal-scan {
  from { transform: translateY(0); }
  to { transform: translateY(8000%); }
}
@media (prefers-reduced-motion: reduce) {
  .ot-fake-thermal__scan,
  .ot-fake-thermal__dog { animation: none; }
}
```

Use pseudo-elements and transforms for the grid, dog outline, glow, and pulse so the browser does not perform a canvas redraw loop. Keep the demo label visually distinct from the live label used by `BridgePreview`.

- [ ] **Step 4: Run the dashboard typecheck/build**

Run:

```powershell
npm --workspace apps/dashboard run build
```

Expected: TypeScript and Vite complete without errors.

- [ ] **Step 5: Commit the component**

```powershell
git add apps/dashboard/src/components/FakeThermalMonitor.tsx apps/dashboard/src/styles/officer-training.css
git commit -m "feat: add fake thermal monitor preview"
```

### Task 2: Route training page 02 through the demo source

**Files:**
- Modify: `apps/dashboard/src/components/TrainingCameraPreview.tsx`
- Test: `apps/dashboard/src/lib/training-monitors.test.mjs`

- [ ] **Step 1: Extend the test fixture to recognize the fake component**

In the VM module loader, map the new import:

```js
if (name.endsWith('FakeThermalMonitor')) return { FakeThermalMonitor: 'FakeThermalMonitor' };
```

Add a helper that finds nodes by component type and update the existing channel assertion so it verifies:

```js
assert.equal(f.render().filter(node => node.type === 'FakeThermalMonitor').length, 1);
assert.deepEqual(feeds(f.render()).map(node => node.props.device?.id), ['third']);
```

The assertion must prove that 02 route does not consume `bindings[1]`, while 03 still consumes `bindings[2]`.

- [ ] **Step 2: Add a failing refresh-isolation test**

Use a fixture with a refresh counter:

```js
let refreshCalls = 0;
bridge.refresh = () => { refreshCalls += 1; };
const refresh = f.render().find(node => node.props?.['aria-label'] === '重连02路监控');
refresh.props.onClick();
assert.equal(refreshCalls, 0);
```

The test should render again and assert that the fake monitor receives a changed `animationKey` after refresh.

- [ ] **Step 3: Implement the explicit 02 demo branch**

Import the new component and change the channel model to identify the source:

```tsx
const channels = [
  { slot: 1, title: '02路监控', source: 'fake-thermal' as const },
  { slot: 2, title: '03路监控', source: 'bridge' as const },
];
```

Change `renderFeed` to accept a channel object and branch before reading `bridge.inventory`:

```tsx
function renderFeed(channel: typeof channels[number], enlarged = false) {
  if (channel.source === 'fake-thermal') {
    const animationKey = retry[channel.slot] ?? 0;
    return <FakeThermalMonitor key={`thermal:${animationKey}`} animationKey={animationKey}
      compact={!enlarged} />;
  }
  const slot = channel.slot;
  const id = bridge.inventory?.bindings[slot];
  const device = bridge.inventory?.items.find(item => item.id === id);
  return <BridgePreview key={`${slot}:${retry[slot] ?? 0}`} device={device}
    available={bridge.available && !bridge.busy} authorized={bridge.previewReady}
    epoch={bridge.previewEpoch} compact={!enlarged} />;
}
```

Keep the existing bridge lookup and `bridge.refresh()` callback only in the `bridge` branch. Add a caption of `机械狗巡检视角 · 热成像（演示画面）` for the fake branch. Update both map calls to pass the channel object.

- [ ] **Step 4: Preserve dialog behavior**

Use the same `renderFeed` call for the expanded dialog. Verify `expanded === 1` renders the fake component with `compact={false}`, and `expanded === 2` renders the existing bridge preview with `compact={false}`.

- [ ] **Step 5: Run focused tests**

Run:

```powershell
node --test apps/dashboard/src/lib/training-monitors.test.mjs
```

Expected: all training monitor tests pass, including the new demo-source and refresh-isolation assertions.

- [ ] **Step 6: Commit the route wiring**

```powershell
git add apps/dashboard/src/components/TrainingCameraPreview.tsx apps/dashboard/src/lib/training-monitors.test.mjs
git commit -m "feat: use fake thermal source for training route 02"
```

### Task 3: Verify desktop/mobile presentation and future bridge boundary

**Files:**
- Modify: `apps/dashboard/src/components/FakeThermalMonitor.tsx` only if visual fixes are needed
- Modify: `apps/dashboard/src/styles/officer-training.css` only if visual fixes are needed

- [ ] **Step 1: Start or reuse the dashboard dev server**

Run:

```powershell
npm run dashboard:dev
```

Use the existing port if available; otherwise use the port reported by Vite.

- [ ] **Step 2: Verify the training route visually**

Open:

```text
/duty-situation/training?task=TRAIN-READINESS-003
```

Confirm that 02 shows the animated thermal shell, 03 remains bridge-backed, the demo label is visible, and the two monitor cards remain aligned.

- [ ] **Step 3: Verify interaction behavior**

Confirm:

```text
02 路刷新 -> animation restarts without a bridge refresh request
02 路放大 -> fake monitor fills the dialog without changing aspect ratio
03 路刷新 -> existing bridge refresh behavior remains unchanged
03 路放大 -> existing bridge preview remains unchanged
```

- [ ] **Step 4: Check narrow layout and reduced motion**

Use a narrow viewport and confirm the monitor grid collapses without overflow. Enable reduced motion and confirm the fake thermal monitor remains visible as a static frame without scan animation.

- [ ] **Step 5: Run final verification**

Run:

```powershell
node --test apps/dashboard/src/lib/training-monitors.test.mjs
npm --workspace apps/dashboard run build
```

Expected: focused tests pass and the production dashboard build completes successfully.

- [ ] **Step 6: Commit any visual corrections**

```powershell
git add apps/dashboard/src/components/FakeThermalMonitor.tsx apps/dashboard/src/styles/officer-training.css
git commit -m "fix: polish fake thermal monitor presentation"
```
