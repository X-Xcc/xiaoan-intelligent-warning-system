# Mini Program Redesign Implementation Plan

> **For agentic workers:** Use subagent-driven-development with disjoint file
> ownership. User has approved implementation; do not request another design gate.

**Goal:** Deliver the approved blue/white mini program with real help and staff workflows.

**Architecture:** Small Taro screens share a native-friendly component and icon
system. Citizen receipts use a session-scoped local index, while staff tasks and
training use their dedicated current Web endpoints. API mutations are verified
before UI state is advanced.

**Tech Stack:** Taro 4.2.1, React 18, TypeScript, Sass, generated Lucide PNG assets,
FastAPI, node:test, mocked-browser Playwright checks.

## Ownership and Contracts

- Core worker: `src/utils/api.ts`, `src/hooks/useSafetyEvents.ts`,
  `src/utils/event-state.ts`, `src/types/events.ts`, corresponding tests,
  `server/app/api/routes/events.py`, focused event-store changes/tests.
- Staff worker: `src/features/staff/**`, `src/utils/training-api.ts`, staff tests.
- Detail worker: `src/pages/detail/**`, `src/data/detail.ts`, detail tests.
- Integrator: shared components/styles/icons, main and login integration,
  citizen/alarm screens, build configuration, browser verification.

Shared UI imports are `@/components/ui`:

```ts
Icon({ name, tone = 'muted', size = 40 })
PageHeader({ title, subtitle, eyebrow, brand, onBack, children })
Section({ title, action, onAction, children })
EmptyState({ title, description, onRetry })
BottomSheet({ title, onClose, children })
EventCard({ event, onClick })
```

Icons: `home, report, siren, mapPin, chevronRight, chevronDown, search, shield,
book, clock, user, arrowLeft, arrowUpRight, camera, mic, phone, check, close,
refresh, send, navigation, tasks, briefcase, flag, location, image, info,
logout, eye, eyeOff, link, plus, video, settings, volume`.
Tones: `blue, muted, danger, green, amber, white, ink`.

Staff export: `StaffWorkspace({ staffName: string, onExit: () => void })`.
Request export: `requestApi<T>(path, Taro.request options)`.
Hook export: `useSafetyEvents()` retains existing methods; `createHelp` accepts
optional coordinates and explicit bay and returns `SafetyEvent`; additional
`attachmentError`, `retryHelpEvidence`, and `pendingEvidenceCount`.
`createReport(form, files)` uploads actual selected media.

## Tasks

- [x] Inspect current UI, API schemas, Web training and role boundaries.
- [x] Record approved design and disjoint implementation contracts.
- [x] Write failing core workflow and presentation tests.
- [ ] Implement receipt index, event-first help creation, evidence supplement,
  manual location metadata, bounded requests and validation.
- [x] Generate native PNG icons from the existing Lucide library.
- [x] Implement shared headers, sections, actions, sheets, status, and tab bars.
- [x] Replace main with citizen screens and explicit staff access.
- [ ] Implement staff tasks, real transitions, routes, duty and Web training.
- [ ] Replace detail pages and remove old fake-success actions.
- [ ] Typecheck and build WeChat, Alipay compatibility, and isolated H5 output.
- [ ] Verify mocked flows and screenshots at 390px, 320px, and desktop.
- [ ] Review changes and publish the running local H5 URL.

## Verification Commands

```text
node --test apps/miniprogram/tests/*.test.cjs
npm --workspace apps/miniprogram run typecheck
npm --workspace apps/miniprogram run build:weapp
npm --workspace apps/miniprogram run build:alipay
npm --workspace apps/miniprogram run build:h5
node scripts/verify_miniprogram_redesign.cjs
```

Browser mutations target intercepted fixture responses only. Backend route tests
patch the event service or use an isolated temporary database, not live alarms.
