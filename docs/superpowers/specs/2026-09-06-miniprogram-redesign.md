# Mini Program Redesign

Approved: 2026-09-06. The user approved the three-screen interactive prototype
in `.superpowers/brainstorm/miniprogram-ui-20260906` and instructed implementation.

## Scope

- Replace the existing miniature green dashboard with the approved sky-blue,
  white-surface, blue-action system. Keep the existing login's visual language.
- Implement citizen home, reporting, emergency help, personal receipts, nearby
  services, lost-item intake, account information, and event detail.
- Implement staff workbench, assigned tasks, arrival/processing/completion,
  route opening, duty information, and training mapped to current Web APIs.
- Keep native Taro/React and WeChat capabilities. Build WeChat and H5 separately.
- Real data and explicit loading/empty/error states. No sample success records in
  production. Current Web/backend changes made by other work remain untouched.

## Emergency Contract

- Default action: large red circular button, followed by an explicit confirmation
  sheet showing destination (platform), location, and optional contact.
- Device location is requested explicitly; failure supports manual place entry.
  A manually entered place must not be presented as a measured GPS coordinate.
- Submit the help event before optional attachments. Attachment failure must not
  hide a successfully created event or cause duplicate help creation.
- Separate submitted, dispatched, accepted, arrived, processing, completed states.
  Estimated routes do not imply the worker has accepted or departed.
- Telephone alarm is a separate native call action with explicit confirmation.
- Disable duplicate submission; retain drafts and pending evidence on failure.
- Personal progress requests only locally known receipt IDs, partitioned by
  session. This is not a substitute for future server-side ownership enforcement.

## Identity Boundary

Remove the fake password form. Production staff access verifies `/auth/me` role
and a corresponding configured staff identity. The existing development flag may
offer a clearly labelled development staff selector; it is not authentication.
Training data retains the server's trial/sample mode label. Administrative role
and policy management remain on Web.

## Acceptance

- Match the approved core screen composition without fake device status bars.
- All visible actions either perform the real supported operation or explain an
  unavailable prerequisite without reporting success.
- Focused tests cover submission ordering, manual location, receipt labels,
  attachment retries, task transitions, and account-scoped local receipts.
- Typecheck, native build, H5 build, and desktop/mobile browser checks pass.
- Browser verification mocks business APIs and never submits a real alarm.
