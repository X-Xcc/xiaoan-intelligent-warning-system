# 下线执法办案系统 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the case-handling product surface from the dashboard UI, route model, platform overview data, and regression checks.

**Architecture:** Keep the existing dashboard shell and platform overview intact, removing only the `case` view and data entries. Unknown `/case` URLs will use the existing `viewForPath` fallback to `platform`; shared event, training, and analysis infrastructure remains available.

**Tech Stack:** React 19, TypeScript, Vite, Node test runner, FastAPI, Python unittest, Playwright.

---

### Task 1: Lock the retired route and navigation contract

**Files:**
- Modify: `apps/dashboard/src/lib/dashboard-navigation.test.mjs`
- Modify: `apps/dashboard/src/lib/dashboard-regressions.test.mjs`

- [ ] **Step 1: Write the failing assertions**

Assert that the navigation views do not contain `case`, the expected navigation list omits `case`, `/case` resolves to `platform`, and the dashboard source no longer exposes the case page or case entry.

- [ ] **Step 2: Run the focused tests**

Run: `node --test apps/dashboard/src/lib/dashboard-navigation.test.mjs apps/dashboard/src/lib/dashboard-regressions.test.mjs`

Expected: FAIL because the current navigation and route table still contain `case`.

### Task 2: Remove the dashboard case surface

**Files:**
- Modify: `apps/dashboard/src/pages/DashboardApp.tsx`
- Modify: `apps/dashboard/src/pages/PublicSecurityPlatformPage.tsx`
- Modify: `apps/dashboard/src/lib/presentation.ts`
- Modify: `apps/dashboard/src/pages/PoliceDomainPages.tsx`

- [ ] **Step 1: Remove the case nav item, demo business system, data catalog entry, route branch, and imports.**
- [ ] **Step 2: Remove the case homepage card and unused `FileCheck2` imports.**
- [ ] **Step 3: Remove the `case` route mapping and delete `CaseHandlingPage`.**
- [ ] **Step 4: Re-run the focused tests and dashboard type/build checks.**

### Task 3: Remove case-only platform API display data

**Files:**
- Modify: `server/app/api/routes/platform.py`

- [ ] **Step 1: Remove the case data domain, business system, case workspace, and case event-chain display entry.**
- [ ] **Step 2: Keep shared `open_cases` calculation available for other consumers.**
- [ ] **Step 3: Run the relevant Python platform route/import checks.**

### Task 4: Remove browser verification coverage for the retired page

**Files:**
- Modify: `tools/verify_xiaoan_workspace.mjs`

- [ ] **Step 1: Remove `/case` from the route matrix and navigation loop.**
- [ ] **Step 2: Remove the `.case-domain-page` destination marker.**
- [ ] **Step 3: Run the workspace browser verification script against the local dashboard.**

### Task 5: Verify the complete change

**Files:**
- Inspect: all modified files and git diff

- [ ] **Step 1: Search source files for user-facing `执法办案系统`, `执法办案` entry labels, `case-domain-page`, and route-only `case` references.**
- [ ] **Step 2: Run dashboard tests and build.**
- [ ] **Step 3: Run the relevant server tests.**
- [ ] **Step 4: Review the diff and report any unrelated pre-existing changes without reverting them.**
