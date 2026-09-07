# A1 Training Entry Implementation Plan

**Goal:** Make individual training a child of A1, entered from the footer courses, with a reliable return path.

**Architecture:** Retain the two existing React pages and persisted API. Use the canonical training route `/duty-situation/training` with `/duty-plan` retained as a legacy alias. Store only view state and the last selected task/officer in tab-scoped session storage. Refresh course status through read-only task retrieval independently of the situation snapshot.

**Tech Stack:** Existing React, TypeScript, Ant Design, scoped CSS, Node tests, isolated Playwright/Chrome acceptance.

The user approved the navigation design in this task. Implement in the existing working directory, preserve unrelated changes, and do not commit or alter backend configuration.

## Work Items

- [ ] Add failing route, tab-state, breadcrumb and mobile-list tests.
- [ ] Implement the child route, last selection and defensive view-state persistence; preserve legacy links.
- [ ] Remove the standalone top-level training entry; route platform training entry through A1.
- [ ] Add a training breadcrumb and a guarded return action; select exactly the clicked task without automatically starting it.
- [ ] Remember A1 region, animation and scroll position on course entry; restore on return and reload task statuses.
- [ ] Stack all three course buttons on narrow screens, with no moving duplicate or horizontal course scroll.
- [ ] Run focused and existing regressions, production build, and complete isolated browser flow.
- [ ] Check real service URLs read-only; retain screenshots and a concise verification record.

## Acceptance

```text
A1 -> course 002 -> selected task 002 / officer 018 -> review or archive
   -> return to A1 -> original selected area / scroll position, updated task status

A1 -> general training entry -> most recently selected officer and task
Legacy /duty-plan?task=... -> same training workflow and return to A1
390 / 470 / 768 widths -> three full-width, fully readable course buttons
```

Use fresh isolated task data for writes. Verify explicit return and browser Back, reload recovery, no automatic start on entry, unrecorded video warnings, no missing-task substitution, and no horizontal document overflow.
