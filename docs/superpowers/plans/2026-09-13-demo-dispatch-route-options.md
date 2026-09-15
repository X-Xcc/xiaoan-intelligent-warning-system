# 脱敏警力调度多路线 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 `/command` 的脱敏警力地图中展示多条可达路线、系统推荐的最优路线，以及非推荐路线上的一处拥堵。

**Architecture:** 继续使用本地虚构底图资源和百分比画布坐标，不接入任何真实地图服务。将候选路线、推荐路线和拥堵状态放入 `demo-dispatch-data.ts`，由 `DemoDispatchMap.tsx` 统一绘制 SVG 路线、标签和图例，CSS 只负责视觉层级和响应式布局。

**Tech Stack:** React 19, TypeScript, Vite, SVG, CSS, Node test runner.

---

### Task 1: 扩展脱敏数据契约

**Files:**
- Modify: `apps/dashboard/src/lib/demo-dispatch-data.ts`
- Test: `apps/dashboard/src/lib/demo-dispatch-data.test.mjs`

- [ ] **Step 1: Write the failing source-contract tests**

在现有数据测试中增加以下断言，明确必须有至少 3 条候选路线、推荐路线 id 和非推荐路线拥堵信息：

```js
assert.match(source, /routeOptions:\s*\[/);
assert.match(source, /recommendedRouteId/);
assert.match(source, /congestion/);
assert.match(source, /status:\s*'congested'/);
assert.ok((source.match(/id:\s*'demo-route-/g) ?? []).length >= 3);
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run:

```powershell
node --test apps/dashboard/src/lib/demo-dispatch-data.test.mjs
```

Expected: FAIL because the current data has only `routePoints` and no `routeOptions`, `recommendedRouteId`, or `congestion`.

- [ ] **Step 3: Add the minimal typed route model and fictional values**

Add these types and fields without latitude, longitude, URLs, real place names, or external service identifiers:

```ts
export type DemoDispatchRoute = {
  id: string;
  label: string;
  points: Array<{ x: number; y: number }>;
  status: 'candidate' | 'recommended' | 'congested';
  congestionSegment?: Array<{ x: number; y: number }>;
};

export type DemoDispatchData = {
  incident: DemoDispatchPoint;
  routePoints: Array<{ x: number; y: number }>;
  routeOptions: DemoDispatchRoute[];
  recommendedRouteId: string;
  congestion: {
    routeId: string;
    x: number;
    y: number;
    label: string;
  };
  units: Array<{ id: string; name: string; x: number; y: number }>;
};
```

Populate three routes from `demo-unit-01` to the incident. Make `demo-route-01` the recommended route and make `demo-route-02` contain a separate congestion segment. Keep `routePoints` equal to the recommended route points for compatibility with existing tests.

- [ ] **Step 4: Run the focused test and verify it passes**

Run:

```powershell
node --test apps/dashboard/src/lib/demo-dispatch-data.test.mjs
```

Expected: PASS.

- [ ] **Step 5: Commit the data contract**

```powershell
git add apps/dashboard/src/lib/demo-dispatch-data.ts apps/dashboard/src/lib/demo-dispatch-data.test.mjs
git commit -m "feat: add desensitized dispatch route options"
```

### Task 2: Add route and congestion rendering

**Files:**
- Modify: `apps/dashboard/src/components/DemoDispatchMap.tsx`
- Test: `apps/dashboard/src/lib/demo-dispatch-map.test.mjs`

- [ ] **Step 1: Write the failing rendering-contract tests**

Add assertions for multiple route rendering and the two labels:

```js
assert.match(source, /routeOptions\.map/);
assert.match(source, /推荐路线|系统推荐/);
assert.match(source, /前方拥堵|拥堵/);
assert.match(source, /demo-map-candidate-route/);
assert.match(source, /demo-map-congestion/);
assert.match(source, /候选路线/);
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run:

```powershell
node --test apps/dashboard/src/lib/demo-dispatch-map.test.mjs
```

Expected: FAIL because the component currently renders one `polyline` and has no candidate or congestion layers.

- [ ] **Step 3: Render all route options and their state-specific overlays**

Add a small helper in `DemoDispatchMap.tsx`:

```tsx
const toRoutePoints = (points: Array<{ x: number; y: number }>) =>
  points.map((point) => `${point.x},${point.y}`).join(' ');
```

Render candidate routes before the recommended route so the recommended line remains visually dominant:

```tsx
<svg className="demo-map-routes" viewBox="0 0 100 100" preserveAspectRatio="none" aria-label="多路线可达示意">
  {data.routeOptions
    .filter((routeOption) => routeOption.id !== data.recommendedRouteId)
    .map((routeOption) => (
      <polyline
        className={`demo-map-candidate-route${routeOption.status === 'congested' ? ' has-congestion' : ''}`}
        key={routeOption.id}
        points={toRoutePoints(routeOption.points)}
      />
    ))}
  {data.routeOptions
    .filter((routeOption) => routeOption.id === data.recommendedRouteId)
    .map((routeOption) => (
      <polyline className="demo-map-recommended-route" key={routeOption.id} points={toRoutePoints(routeOption.points)} />
    ))}
  {data.routeOptions
    .filter((routeOption) => routeOption.congestionSegment)
    .map((routeOption) => (
      <polyline
        className="demo-map-congestion"
        key={`${routeOption.id}-congestion`}
        points={toRoutePoints(routeOption.congestionSegment ?? [])}
      />
    ))}
</svg>
```

Add compact map labels:

```tsx
<div className="demo-map-route-label">系统推荐</div>
<div className="demo-map-congestion-label" style={{ left: `${data.congestion.x}%`, top: `${data.congestion.y}%` }}>
  <span />{data.congestion.label}
</div>
```

Update the footer legend to include `候选路线`, `系统推荐`, and `拥堵路段`; preserve the existing desensitization disclaimer.

- [ ] **Step 4: Run the focused test and verify it passes**

Run:

```powershell
node --test apps/dashboard/src/lib/demo-dispatch-map.test.mjs
```

Expected: PASS.

- [ ] **Step 5: Commit the rendering change**

```powershell
git add apps/dashboard/src/components/DemoDispatchMap.tsx apps/dashboard/src/lib/demo-dispatch-map.test.mjs
git commit -m "feat: render dispatch route recommendation and congestion"
```

### Task 3: Make the fictional bottom map show more junctions

**Files:**
- Modify: `apps/dashboard/src/assets/demo-dispatch-map-v2.svg`
- Modify: `apps/dashboard/src/styles/command-dispatch.css`

- [ ] **Step 1: Add junction geometry to the local artwork**

Add several thin secondary roads that branch from the existing main roads, plus small round junction nodes at visible intersections. Keep the art free of text, logos, coordinates, real geographic silhouettes, and map provider marks. Use the existing pale green, grey-blue, and white palette.

- [ ] **Step 2: Style route layers and labels**

Add CSS rules with stable z-index ordering:

```css
.demo-map-routes { position: absolute; inset: 0; z-index: 3; width: 100%; height: 100%; pointer-events: none; }
.demo-map-candidate-route { fill: none; stroke: #8194a4; stroke-width: 1; stroke-dasharray: 1.8 2; opacity: .72; vector-effect: non-scaling-stroke; }
.demo-map-recommended-route { fill: none; stroke: #2458d3; stroke-width: 2.2; vector-effect: non-scaling-stroke; filter: drop-shadow(0 1px 1px #fff); }
.demo-map-congestion { fill: none; stroke: #e36a2f; stroke-width: 3.4; stroke-linecap: round; vector-effect: non-scaling-stroke; }
.demo-map-route-label,
.demo-map-congestion-label { position: absolute; z-index: 6; }
```

Place the recommendation label near the middle of the blue route and the congestion label near the orange segment. Make the congestion label orange-red with a small dot, and ensure labels switch or remain within the canvas at narrow widths.

- [ ] **Step 3: Run the focused tests**

Run:

```powershell
node --test apps/dashboard/src/lib/command-dispatch-view.test.mjs apps/dashboard/src/lib/demo-dispatch-data.test.mjs apps/dashboard/src/lib/demo-dispatch-map.test.mjs
```

Expected: PASS with no real-map provider or location-token matches.

- [ ] **Step 4: Commit the visual layer**

```powershell
git add apps/dashboard/src/assets/demo-dispatch-map-v2.svg apps/dashboard/src/styles/command-dispatch.css
git commit -m "style: enrich fictional dispatch road network"
```

### Task 4: Verify production behavior in browser

**Files:**
- Verify: `apps/dashboard/src/components/DemoDispatchMap.tsx`
- Verify: `apps/dashboard/src/lib/demo-dispatch-data.ts`
- Verify: `apps/dashboard/src/assets/demo-dispatch-map-v2.svg`

- [ ] **Step 1: Run TypeScript verification**

```powershell
cd apps/dashboard
.\node_modules\.bin\tsc.cmd -p tsconfig.json --noEmit
```

Expected: exit code 0.

- [ ] **Step 2: Run direct Vite production build**

```powershell
.\node_modules\.bin\vite.cmd build
```

Expected: build succeeds and emits the local `demo-dispatch-map-v2` asset. If `pnpm run build` is blocked by the repository's ignored `esbuild` install script, record that environment limitation and rely on the direct binary result.

- [ ] **Step 3: Inspect the page at the existing local URL**

Open `http://127.0.0.1:5173/command`, advance to the dispatch map, and verify at approximately 529px width:

- at least three route lines are visible;
- the blue route is labeled `系统推荐`;
- the orange congestion segment is on a non-recommended route;
- multiple small junctions are visible in the bottom map;
- alarm and unit labels remain inside the viewport;
- the footer remains concise and keeps the desensitization disclaimer.

- [ ] **Step 4: Commit only if verification passes**

```powershell
git status --short
git log -1 --oneline
```

Do not stage or modify unrelated user changes.
