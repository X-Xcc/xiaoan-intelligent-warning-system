# Workspace Redesign Implementation Plan

> **For agentic workers:** Use subagent-driven-development for independent page groups; root integrates and verifies.

**Goal:** Deliver the approved light enterprise workspace and dark operations surfaces across all existing routes.

**Architecture:** Replace the active legacy CSS with a small import entry and scoped styles by page responsibility. Shared theme tokens and shell own typography, navigation, spacing and focus; existing pages retain business state and API ownership.

**Tech Stack:** React 19, TypeScript, Ant Design 6, Lucide, Vite, Node test runner, PostCSS.

## Tasks

- [x] Audit page components and legacy cascade; confirm user-approved visual direction.
- [x] Add failing tests for route normalization, event filters, and the active CSS constraints.
- [x] Root: implement route/data helpers, theme, shell and operational overview.
- [x] Business worker: implement scoped workspace CSS and reorganize domain pages without changing API contracts.
- [x] Operations worker: implement scoped monitoring/map CSS and responsive media workflows.
- [x] Administration worker: implement scoped admin CSS with coherent tables, forms and tabs.
- [x] Root: switch stylesheet entry point, integrate all page groups and run static/behavioral checks.
- [x] Root: verify and repair launcher readiness and port handling.
- [x] Review changes independently, fix findings, run final build and document verification limits.

## Contracts

Route navigation uses one mapping, including `night-market-command` to `/night-market/command`.

```ts
routePath('night-market-command') === '/night-market/command'
viewForPath('/night-market/command') === 'night-market-command'
```

Event filtering accepts a status category and text query, does not mutate the input, and uses only received fields. Offline and demo data remain visibly distinguished.

Active CSS uses:

```css
:root {
  --ui-bg: #f5f6f8;
  --ui-surface: #fff;
  --ui-text: #202938;
  --ui-muted: #667085;
  --ui-line: #e5e8ee;
  --ui-primary: #2458d3;
  --ui-radius: 8px;
}
```

## Verification Commands

```text
node --test scripts/verify_dashboard_redesign.mjs
node --test scripts/verify_readiness_training_frontend.mjs
node --test scripts/verify_mechanical_dog_alert_frontend.mjs
npm run build --workspace apps/dashboard
```

Expected: zero failed tests and successful type check/build. Browser checks additionally require real route screenshots and interaction/overflow checks; compilation alone is not visual acceptance.

## Acceptance Status

- [x] Route, data-state, style, and existing training/video contracts verified.
- [x] React component interactions verified in a DOM test environment.
- [x] Launcher cold start, port conflict, and server reuse verified.
- [ ] External browser screenshots and responsive visual acceptance: blocked by the unavailable Chrome/Edge connection.
