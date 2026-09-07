# Officer Training and Duty Situation Implementation Plan

> **For agentic workers:** Use subagent-driven-development for the disjoint A1 and API tasks; the coordinating agent owns the training page, shared client, routing and browser acceptance.

**Goal:** Deliver the two user-selected experiences: a usable individual-officer training workspace and the A1 duty situation screen specified in the supplied image.

**Architecture:** Preserve the existing platform and persisted training service. Replace the `/duty-plan` landing experience with a focused training workspace, and add `/duty-situation` as a separate full-viewport screen. Both consume the same training task identities and truthful sample-mode metadata. Do not alter unrelated business pages.

**Tech Stack:** Existing React, TypeScript, Ant Design, Lucide, modular CSS, FastAPI and SQLAlchemy. Local Node tests and isolated-database API tests, followed by actual-browser screenshots and interaction checks.

## Approved Scope

- Single-officer tasks are filtered by trainee identity, with task-ID navigation, explicit preparation, timer/manual elapsed entry, optional local video recording or import, persisted completion, assessment recovery, named instructor review and archive/retraining.
- Separate task status from the currently viewed tab. Never create business records by merely browsing.
- Local video is never uploaded or represented as motion-model input. Scoring remains explicitly the existing desensitized sample rule service.
- A1 uses a 1:2:1 desktop grid: 41/28/27/4 percent incident donut; existing night-market map with B-area hotspot and directional flow; hourly bars highlighting 20:00-23:00. The full-width lower banner links to the three real sample task IDs.
- A1's deliberate generate action has a 500 ms transition, one-second donut reveal, one-second hotspot reveal, then a moving training banner. The motion can be paused/replayed and respects reduced-motion settings. Voice acknowledgement may enhance the explicit action but is never the only entry.
- Date, data source and API connectivity are distinct. Example percentages are not relabeled as live incidents.
- Mobile stacks the A1 regions. Desktop worklists scroll within the workspace; no long sidebars determine the page's height.

## Tasks

### 1. Shared Client and Navigation (Coordinator)

Files: `apps/dashboard/src/lib/training-api.ts`, `apps/dashboard/src/lib/presentation.ts`, `scripts/verify_training_workspace.mjs`.

- [x] Write failing tests for `/duty-situation`, trainee-scoped task selection, server-status-derived workflow steps, elapsed bounds and failed API responses.
- [x] Implement typed tasks, assessments, archives and A1 snapshot contracts; explicit `GET` versus mutation calls; request timeout and error messages.
- [x] Use `/duty-plan?officer=...&task=...` for recoverable selection.

### 2. API Reliability (API Worker)

Files: `server/app/services/training_pilot.py`, `server/app/api/routes/training.py`, `scripts/verify_training_workspace_api.py`.

- [x] Add isolated-database regressions for premature assessment/completion, repeat review conflicts, concurrent sample retry identities and read-only assessment retrieval.
- [x] Correct collisions by deriving new assessment/archive/exception identifiers from full task IDs while preserving existing stored rows.
- [x] Expose persisted assessment reads and a backward-compatible `dutySituation` field in readiness.
- [x] Preserve existing pilot tests and avoid changing authentication or production configuration.

### 3. A1 Duty Situation (A1 Worker)

Files: `apps/dashboard/src/pages/DutySituationPage.tsx`, `apps/dashboard/src/styles/duty-situation.css`, `scripts/verify_duty_situation.mjs`.

- [x] Test composition, high-risk emphasis, peak-hour range and all three task links before implementation.
- [x] Build the standalone responsive screen from the supplied layout, existing bitmap map and shared readiness contract.
- [x] Implement controlled generation/replay, pause, fullscreen, refresh, zone selection and training handoff; all controls must have observable behavior.
- [x] Keep content inspectable, readable and nonoverlapping at 1366x768, 1920x1080 and 390x844.

### 4. Single Officer Workspace (Coordinator)

Files: `apps/dashboard/src/pages/OfficerTrainingPage.tsx`, `apps/dashboard/src/styles/officer-training.css`, `apps/dashboard/src/pages/DashboardApp.tsx`, `apps/dashboard/src/styles.css`.

- [x] Build a compact officer selector, task list and focused training surface with preparation/training/assessment/archive tabs.
- [x] Scope all derived state, drafts and media to the selected task; stop recording on leave and prevent overlapping mutations.
- [x] Begin only after equipment confirmation. Complete only a started task. Require reviewer identity and a substantive review reason.
- [x] Display server errors, stale data, retry actions and successful empty states without fabricated task fallbacks.
- [x] Keep refresh non-destructive to drafts; re-read persisted assessments after reload.
- [x] Add clearly named navigation entries and links between A1 and training without moving unrelated routes.

### 5. Acceptance (Coordinator and Reviewer)

- [x] Run `node --test scripts/verify_training_workspace.mjs scripts/verify_duty_situation.mjs`.
- [x] Run isolated API regression and existing pilot verification with the bundled server Python.
- [x] Run existing dashboard/helper/frontend contract tests and `npm run build --workspace apps/dashboard`.
- [x] Inspect screenshots at 1920x1080, 1366x768, 1280x720, 768x1024 and 390x844, including long queues and 125% equivalent sizing.
- [x] Exercise actual browser navigation, selection, preparation, started-task timing, completion, assessment reload, review/return and archive against an isolated service. Verify no success after API failure.
- [x] Verify the user's running URL serves the new code; leave the development service available and document any remaining sample/model/camera limitations.

## Verification Result

Verified on 2026-09-06: 57 frontend/media/contract tests, 17 API regressions,
the existing pilot smoke test, production build, 13 browser geometry checks,
and the complete isolated training workflow passed.
The actual localhost services were then checked read-only without request mocking.
See `docs/superpowers/verification/2026-09-06-officer-training-duty-situation.md`.

## Boundaries

This is an implementation request for two modules, not authorization to rewrite all other business domains, change global machine settings, publish private data to Figma, or deploy to an external host. Existing uncommitted changes are preserved. No commits are made implicitly.
