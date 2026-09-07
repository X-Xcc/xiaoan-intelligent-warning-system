# Unified Police Workspace Design

Approved by the user on 2026-09-06: light daily workspaces, dark monitoring and operational map surfaces.

## Scope

All ten existing route entries: overview, command, case, community, duty plan, mobile, AI center, administration, video, and night-market command. Preserve API contracts, training workflows, media sources, manual confirmation, and audit trails. Existing unrelated changes remain untouched.

## Design

- Neutral light canvas, white navigation and work surfaces, blue primary actions, semantic green/amber/red statuses.
- Charcoal monitoring surfaces with legible media labels and responsive feed grids.
- One page title at 24px; body at 14px; captions no smaller than 12px.
- Fixed 224px navigation, 64px top bar, 24px page padding, 20px section gaps, 8px maximum surface radius.
- Unframed section headings and content bands. Borders frame repeated objects and genuine tools, not every nested element.
- Overview prioritizes operational metrics, searchable/filterable events, business shortcuts, and service health.
- Business pages prioritize the selected object and current workflow step. Details may flow below the main work area rather than squeezing the workspace.
- Navigation becomes a keyboard-accessible drawer on small screens. Tables scroll inside their own region. Video grids scroll vertically rather than shrinking labels.

## Implementation Boundaries

Replace the stylesheet entry point with modular imports. Retain a source backup of the legacy stylesheet outside the active import tree for traceability. Use existing React, Ant Design and Lucide dependencies. Configure Ant Design tokens centrally.

No new backend behavior, simulated live statuses, third-party data transmissions, account changes, or automatic enforcement actions.

## Acceptance

Build succeeds; route/data helper tests and existing training/alert contracts pass; active CSS contains no cascade patch layers or viewport-scaled fonts. Verify routes, controls, keyboard navigation, overflow, and screenshots at desktop and narrow widths when authorized browser control is available. Record any unavailable verification explicitly. Provide a launcher that waits for the intended service and does not open an unrelated occupied port.
