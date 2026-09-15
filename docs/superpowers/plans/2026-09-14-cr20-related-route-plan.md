# CR-20 关联点位褐色对比路线 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a brown comparison route to the CR-20 related-points map, intersecting the existing route only at point 3, and show a 5% overlap label at the map's upper right.

**Architecture:** Keep route geometry and the fixed overlap metric in `lib/contact-case-map.ts`. Render the second route and its legend/metric in `ContactGaitMap.tsx`, with isolated styles in `contact-case-map.css`. Preserve the existing collision workspace and all point-selection behavior.

**Tech Stack:** React 19, TypeScript, SVG polylines, Node's built-in test runner, Vite.

---

### Task 1: Add the route model regression tests

**Files:**
- Modify: `apps/dashboard/src/lib/contact-case-map.test.mjs`
- Test: `apps/dashboard/src/lib/contact-case-map.test.mjs`

- [ ] **Step 1: Add a failing test for the comparison route contract**

Add assertions that `getCaseComparisonRoute()` exists, `caseRouteOverlapRate` equals `5`, the route contains the point-3 anchor `[640, 365]`, and the route does not contain points 1, 2, 4, or 5.

- [ ] **Step 2: Run the focused test**

Run: `node --test apps/dashboard/src/lib/contact-case-map.test.mjs`
Expected: FAIL because the new exports do not exist.

- [ ] **Step 3: Commit the failing test**

```powershell
git add apps/dashboard/src/lib/contact-case-map.test.mjs
git commit -m "test: define CR-20 comparison route contract"
```

### Task 2: Implement the route model

**Files:**
- Modify: `apps/dashboard/src/lib/contact-case-map.ts`
- Test: `apps/dashboard/src/lib/contact-case-map.test.mjs`

- [ ] **Step 1: Add the minimal model exports**

Export `caseRouteOverlapRate = 5` and a `caseComparisonRoute` coordinate list containing `[640, 365]`. Add `getCaseComparisonRoute(pointCount)` that returns the route only when the third point is available and truncates safely for fewer than three points.

- [ ] **Step 2: Run the focused test**

Run: `node --test apps/dashboard/src/lib/contact-case-map.test.mjs`
Expected: PASS for the new route contract and all existing map-model tests.

- [ ] **Step 3: Commit the model**

```powershell
git add apps/dashboard/src/lib/contact-case-map.ts apps/dashboard/src/lib/contact-case-map.test.mjs
git commit -m "feat: add CR-20 comparison route model"
```

### Task 3: Render the brown route and 5% indicator

**Files:**
- Modify: `apps/dashboard/src/components/ContactGaitMap.tsx`
- Modify: `apps/dashboard/src/styles/contact-case-map.css`

- [ ] **Step 1: Render the comparison route**

Import the model route and rate, convert both route coordinate lists to SVG point strings, and add a brown polyline after the existing blue route. Add legend entries for the original route and the brown comparison route.

- [ ] **Step 2: Add the upper-right metric**

Render a compact upper-right map badge with visible text `路线重合率 5%` and an `aria-label` describing the CR-20 route overlap rate.

- [ ] **Step 3: Add isolated styles**

Style the comparison route with a brown stroke and dashed pattern, keep the existing route styling unchanged, and position the metric badge without covering the north indicator or point labels at the existing desktop and mobile breakpoints.

- [ ] **Step 4: Run the focused test/build checks**

Run: `node --test apps/dashboard/src/lib/contact-case-map.test.mjs`
Expected: PASS.

Run: `npm run build --prefix apps/dashboard`
Expected: TypeScript and Vite build exit with code 0.

- [ ] **Step 5: Commit the UI**

```powershell
git add apps/dashboard/src/components/ContactGaitMap.tsx apps/dashboard/src/styles/contact-case-map.css
git commit -m "feat: show CR-20 brown comparison route"
```

### Task 4: Verify the visible CR-20 workflow

**Files:**
- No source changes expected.

- [ ] **Step 1: Open the running dashboard**

Use the existing local page at `http://127.0.0.1:5179/contact-review`.

- [ ] **Step 2: Open CR-020 and choose “查看关联点位”**

Confirm the route map renders with both blue and brown lines.

- [ ] **Step 3: Verify the geometry and label**

Confirm the brown route intersects the blue route only at marker 3 and the upper-right badge reads `路线重合率 5%`.

- [ ] **Step 4: Inspect the final diff**

Run: `git diff HEAD~3..HEAD --check`
Expected: no whitespace errors.

