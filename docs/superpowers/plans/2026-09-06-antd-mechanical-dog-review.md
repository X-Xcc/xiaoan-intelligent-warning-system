# Ant Design Mechanical Dog Review Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the monitoring side rail and custom fight dialog with a full-width video wall and an Ant Design-based 01-route mechanical-dog review modal.

**Architecture:** `VideoLinkagePage.tsx` owns the fixed channel-01 review state and reuses `/security-ai/judgements`. The modal is composed from Ant Design primitives; CSS is limited to video layout and evidence framing. The existing static frontend verifier is extended to prevent reintroducing the deleted side rail.

**Tech Stack:** React 19, TypeScript, Ant Design 6, Lucide React, Vite.

---

### Task 1: Guard the full-width and fixed-source contract

**Files:**
- Modify: `scripts/verify_mechanical_dog_alert_frontend.mjs`
- Modify: `apps/dashboard/src/pages/VideoLinkagePage.tsx`

- [ ] **Step 1: Add failing assertions**

Assert that `VideoLinkagePage.tsx` imports `Card`, `Descriptions`, `Steps`, `Tag`, and `Spin`; uses `cameraId: 'local'`; and does not contain `monitoring-side-rail`.

- [ ] **Step 2: Run the verifier and confirm failure**

Run: `node scripts/verify_mechanical_dog_alert_frontend.mjs`

Expected: an assertion fails because the page still contains the side rail and lacks the required Ant Design imports.

- [ ] **Step 3: Remove the right rail and make the wall full-width**

Delete the `selected-feed-panel`, `qwen-panel`, and `monitoring-device-panel` JSX. Remove their state-only references. Change the workspace layout to one column and use four equal video-wall columns on desktop.

- [ ] **Step 4: Verify the source contract**

Run: `node scripts/verify_mechanical_dog_alert_frontend.mjs`

Expected: the checks related to source locking and deleted rail pass after the modal import step is complete.

### Task 2: Replace the dialog interior with Ant Design components

**Files:**
- Modify: `apps/dashboard/src/pages/VideoLinkagePage.tsx`
- Modify: `apps/dashboard/src/styles.css`

- [ ] **Step 1: Add a loading-aware review state**

Keep opening the dialog before the request completes. Initialise the report as an `awaitingReview` state and set `fightAlertLoading` to true. On cloud success, update report and status; on a configured-false or request failure response, show the existing local demonstration result with a visible warning.

- [ ] **Step 2: Implement Ant Design modal composition**

Use `Modal` for shell, `Tag` for risk/model status, `Card` for video/evidence/report sections, `Descriptions` for structured incident data, `Steps` for recommendations, `Spin` while reviewing, and Ant Design `Button` for the four actions.

- [ ] **Step 3: Simplify scoped styling**

Delete custom card-like internals that duplicate Ant Design. Preserve only media aspect ratios, target bounding box, compact video-wall metadata, and deep-blue token overrides under `.fight-alert-modal`.

- [ ] **Step 4: Verify the page contract and build**

Run: `node scripts/verify_mechanical_dog_alert_frontend.mjs && npm run dashboard:build`

Expected: verifier pass and successful Vite build.

### Task 3: Check the local workflow

**Files:**
- Modify: `apps/dashboard/src/pages/VideoLinkagePage.tsx` only if validation reveals a defect.

- [ ] **Step 1: Start the local dashboard**

Run: `npm run dashboard:dev`

- [ ] **Step 2: Verify the page responds**

Run: `Invoke-WebRequest -UseBasicParsing http://127.0.0.1:5177/video`

Expected: HTTP 200.

- [ ] **Step 3: Manually inspect**

Refresh the monitoring page, press `Alt + M`, and confirm: the 16-wall spans the work area; the modal starts in review state; the fixed 01 source appears on both video and evidence; result/fallback status is clear; `Escape` and the four actions work.

## Plan Review

- The plan covers full-width layout, fixed 01 review, Ant Design composition, fallback status, four actions, and verification.
- No action creates a real dispatch or emergency request.
