# Workspace Redesign Verification

Date: 2026-09-06

## Implemented Scope

The existing React application now uses seven scoped style modules instead of
the legacy cascade. The previous stylesheet is preserved in
`apps/dashboard/src/styles/legacy-unused.css` and is not imported.

Light enterprise workspaces:

- `/platform`: operational overview, metrics, business entries, searchable
  incident queue, current-record drawer, service links.
- `/command`, `/case`, `/community`, `/duty-plan`, `/mobile`, `/ai-center`:
  compact page headings, consistent object/work areas, controls, review panels,
  responsive training catalog and assessment layouts.
- `/admin`: governance tabs with keyboard navigation, scoped table scrolling,
  organized settings, access-key and audit surfaces.

Dark operations workspaces:

- `/video`: responsive 16:9 camera grid, readable source selectors, distinct
  live/demo/unavailable states, manual incident-review dialog.
- `/night-market/command`: queue/map/details layout, complete market selection,
  responsive stacking and filter-aligned event details.

Shared changes include Ant Design tokens, system fonts, focus styles, mobile
navigation, consistent route mapping and explicit offline states. Existing
API endpoints, manual review, evidence, recording and training workflows
were retained.

## Verified

The combined Node test run passed 19/19 tests:

- Ten route mappings and server-rendered React page contents.
- Event filtering and missing-value handling.
- Active CSS parsing and style constraints.
- Overview filtering, detail drawer, navigation and browser-history state.
- Live refresh updates the open record; successful empty results stay empty.
- Mobile menu Escape and desktop-breakpoint scroll release.
- Governance keyboard tabs and training catalog navigation.
- Local media asset presence and existing training/video source contracts.

The tests use the actual dashboard React version, Ant Design application
context and theme. This is DOM/component verification, not browser layout
or video-device verification.

`npm run build --workspace apps/dashboard` passed. Vite emitted the existing
large-JavaScript-chunk warning; the main JavaScript bundle is about 1.35 MB
before gzip. The active CSS bundle is about 116 KB before gzip.

The PowerShell launcher test passed:

- Cold start waits for the dashboard's service identity.
- An occupied unrelated port is left alone and the next port is used.
- A repeated launch reuses the ready process.
- Test-created servers are removed after the test.

The desktop launcher at `D:\xx\Desktop\启动公安AI平台.cmd` points to
`scripts/start_public_security.ps1`. It reuses healthy services, writes logs
under `.codex/runtime`, and opens the default browser only after readiness.
It does not change machine security settings or force a demo database.
The existing dashboard at `http://127.0.0.1:5177/` was identified successfully.

## Reproduce

```powershell
# Optional isolated DOM test dependency when the workspace copy is incomplete.
npm install --prefix .verify/dom-runtime --no-save --no-package-lock --ignore-scripts jsdom@26.1.0

node --test scripts/verify_dashboard_redesign.mjs scripts/verify_dashboard_ui.mjs scripts/verify_readiness_training_frontend.mjs scripts/verify_mechanical_dog_alert_frontend.mjs
powershell.exe -NoProfile -File scripts/verify_dashboard_launcher.ps1
npm run build --workspace apps/dashboard
powershell.exe -NoProfile -File scripts/start_public_security.ps1 -NoBrowser
```

## Outstanding Acceptance

Chrome and Edge selection both reported that the browser was unavailable.
The user's requested external-browser connection is therefore still needed
for visual acceptance at desktop and mobile sizes. No screenshot acceptance,
pixel-level overflow check, live camera permission, real map-key rendering,
or end-to-end backend mutation is claimed by this report.

The source was checked for responsive constraints and interaction regressions.
These checks do not substitute for opening each route and reviewing the
rendered layout in the requested browser.

Independent source review found four shell/overview issues, all addressed:
successful empty API results, mobile-menu resize scroll locking, stale open
incident details, and filter-button keyboard semantics. The final domain
markup/style review found no additional high-confidence regressions.
