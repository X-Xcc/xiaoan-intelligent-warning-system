# 身份检索 CAM-11 精简 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让 `/identity-search` 在重新检索完成后只展示 `CAM-11` 结果，并移除身份检索页不需要的筛选和工作区控件。

**Architecture:** 在 `contact-review.ts` 增加 `selectIdentitySearchRecords`，复用通用日期/行为等筛选后固定按机位筛选 `CAM-11`。`ContactReviewPage` 根据 `showGait` 选择身份检索结果或普通视频筛查结果，并用条件渲染收敛身份检索 UI；普通 `/contact-review` 路径继续使用原逻辑。

**Tech Stack:** React 19, TypeScript, lucide-react, Node `node:test`, esbuild transform, TypeScript compiler.

---

### Task 1: Add the identity-search filtering contract

**Files:**
- Modify: `apps/dashboard/src/lib/contact-review.ts`
- Test: `apps/dashboard/src/lib/contact-review-search.test.mjs`

- [ ] **Step 1: Write the failing test**

Add a test that imports `selectIdentitySearchRecords`, applies the default date window to `contactReviewRecords`, and asserts every result is `CAM-11`, the result count is `2`, and a date filter still narrows the result.

```js
test('身份检索结果固定只保留 CAM-11', () => {
  const { contactReviewRecords, contactDateWindow, selectIdentitySearchRecords } = loadContactReview();
  const filters = { ...contactDateWindow(30), behaviors: ['可疑接触', '可疑观察', '可疑跟随'] };
  const result = selectIdentitySearchRecords(contactReviewRecords, filters);

  assert.equal(result.length, 2);
  assert.ok(result.every(record => record.camera.toLowerCase() === 'cam-11'));

  const narrowed = selectIdentitySearchRecords(contactReviewRecords, { ...filters, from: '2026-09-05' });
  assert.equal(narrowed.length, 1);
  assert.equal(narrowed[0].camera, 'CAM-11');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```powershell
node --experimental-vm-modules --test apps/dashboard/src/lib/contact-review-search.test.mjs
```

Expected: FAIL because `selectIdentitySearchRecords` is not exported.

- [ ] **Step 3: Write minimal implementation**

Export the following function after `selectContactRecords`:

```ts
export function selectIdentitySearchRecords(
  records: ContactReviewRecord[],
  filters: ContactFilters,
): ContactReviewRecord[] {
  return selectContactRecords(records, filters).filter(
    (record) => record.camera.toLocaleLowerCase() === 'cam-11',
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run the same Node test command and expect all tests to pass.

- [ ] **Step 5: Commit**

```powershell
git add apps/dashboard/src/lib/contact-review.ts apps/dashboard/src/lib/contact-review-search.test.mjs
git commit -m "feat: constrain identity search to cam-11"
```

### Task 2: Wire identity-search mode to the CAM-11 result set

**Files:**
- Modify: `apps/dashboard/src/pages/ContactReviewPage.tsx`
- Test: `apps/dashboard/src/lib/identity-search-page.test.mjs`

- [ ] **Step 1: Write the failing test**

Add source-contract assertions that the page imports and calls `selectIdentitySearchRecords`, and that the identity-search branch uses it for both the filtered result set and the scanning result count.

```js
test('身份检索使用 CAM-11 结果集进行扫描和展示', () => {
  const page = read('../pages/ContactReviewPage.tsx');

  assert.match(page, /selectIdentitySearchRecords/);
  assert.match(page, /const filtered = useMemo\(\(\) => showGait/);
  assert.match(page, /selectIdentitySearchRecords\(records/);
  assert.match(page, /const nextFiltered = showGait/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```powershell
node --experimental-vm-modules --test apps/dashboard/src/lib/identity-search-page.test.mjs
```

Expected: FAIL because the page currently always calls `selectContactRecords`.

- [ ] **Step 3: Write minimal implementation**

Import `selectIdentitySearchRecords`, add a small local selector, and use it in the two result calculations:

```tsx
const selectResults = (source: typeof records, nextFilters: ContactFilters) =>
  showGait
    ? selectIdentitySearchRecords(source, nextFilters)
    : selectContactRecords(source, nextFilters);

const filtered = useMemo(() => selectResults(records, { ...filters, query }), [records, filters, query, showGait]);
const scopeRecords = useMemo(() => selectResults(records, { ...filters, status: 'all', query }), [records, filters, query, showGait]);
```

In `applyFilters`, use the same selector for `nextFiltered` so scan totals match the final result set.

- [ ] **Step 4: Run test to verify it passes**

Run the Node page test and the existing search test. Expect all tests to pass.

### Task 3: Remove irrelevant controls from identity-search mode

**Files:**
- Modify: `apps/dashboard/src/pages/ContactReviewPage.tsx`
- Modify: `apps/dashboard/src/styles/contact-review.css` only if conditional markup needs spacing adjustment
- Test: `apps/dashboard/src/lib/identity-search-page.test.mjs`

- [ ] **Step 1: Write the failing test**

Add source assertions for the intended conditional UI:

```js
test('身份检索隐藏视频筛查专用控件', () => {
  const page = read('../pages/ContactReviewPage.tsx');

  assert.match(page, /\{!showGait && <button className="ui-button"[^]*导出复核清单/);
  assert.match(page, /\{!showGait && <div className="cr-source-caption"/);
  assert.match(page, /\{!showGait && <div className="cr-behavior-field"/);
  assert.match(page, /\{!showGait && <button type="button" role="tab" id="cr-map-tab"/);
  assert.match(page, /\{!showGait && <div className="cr-status-tabs"/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```powershell
node --experimental-vm-modules --test apps/dashboard/src/lib/identity-search-page.test.mjs
```

Expected: FAIL because the current page renders all controls for both modes.

- [ ] **Step 3: Write minimal implementation**

Apply these UI rules:

- Render the export button and AI-synthetic source caption only when `!showGait`.
- In the query section, render only the redacted reference object for `showGait`; keep upload controls for the normal page.
- Render behavior and location fields only when `!showGait`; keep the date range and search button.
- Render map/collision tabs, status tabs, result sort/companion selects, view toggle, and map workspace only when `!showGait`.
- Keep the records tab, search input, date caption, scan preview, result cards, empty state, and detail modal for identity search.

Preserve the existing step-navigation callback and modal behavior.

- [ ] **Step 4: Run targeted tests**

Run:

```powershell
node --experimental-vm-modules --test apps/dashboard/src/lib/identity-search-page.test.mjs apps/dashboard/src/lib/contact-review-search.test.mjs
```

Expected: all tests pass.

### Task 4: Verify the build and inspect the final diff

**Files:**
- No new files.

- [ ] **Step 1: Run TypeScript verification**

```powershell
node apps/dashboard/node_modules/typescript/bin/tsc --project apps/dashboard/tsconfig.json --noEmit
```

Expected: exit code `0`.

- [ ] **Step 2: Run the focused regression suite**

```powershell
node --experimental-vm-modules --test apps/dashboard/src/lib/identity-search-page.test.mjs apps/dashboard/src/lib/contact-review-search.test.mjs apps/dashboard/src/lib/gait-analysis.test.mjs
```

Expected: all tests pass.

- [ ] **Step 3: Inspect only task-related changes**

```powershell
git diff -- apps/dashboard/src/pages/ContactReviewPage.tsx apps/dashboard/src/lib/contact-review.ts apps/dashboard/src/lib/contact-review-search.test.mjs apps/dashboard/src/lib/identity-search-page.test.mjs
git status --short
```

Confirm unrelated pre-existing modifications remain untouched.

- [ ] **Step 4: Commit the implementation**

```powershell
git add apps/dashboard/src/pages/ContactReviewPage.tsx apps/dashboard/src/lib/contact-review.ts apps/dashboard/src/lib/contact-review-search.test.mjs apps/dashboard/src/lib/identity-search-page.test.mjs
git commit -m "feat: simplify identity search workspace"
```
