# Development Staff Account Implementation Plan

**Goal:** Enable the approved development-only `xx / 123` staff entry.

**Architecture:** Replace the uncredentialed staff-directory picker with a local
development login. Validate `xx / 123`, then resolve the explicitly bound worker
ID `wang` from the backend directory and enter with its current name. Do not
issue or store an authentication token or fall back to another directory entry.
Keep production WeChat authentication, role checks, and cancellation guards.
Existing backend tasks remain authoritative; this is not a production account.

**Tech Stack:** Taro, React, TypeScript, existing mini-program UI components,
Node test runner and esbuild.

- [x] Add failing tests for valid, invalid, empty and repeated submissions,
  cancellation, password masking, and forced development flags in production.
- [x] Implement `apps/miniprogram/src/features/DevStaffAccess.tsx`, selected
  through a compile-time conditional require in `StaffAccess.tsx`; rename the
  login-page entry to staff login and restrict the build flag.
- [x] Update the existing fixture verification to log in with `xx / 123` and
  verify that task requests use the bound directory name; run unit tests,
  typecheck, development builds and production isolation checks.
- [x] Verify the login and staff views in the local browser, including wrong
  password and navigation. Do not submit real alarms or dispatch changes.
- [x] Cover missing bindings, directory failures and retry, and cancellation
  on navigation, unmount or authentication-token changes.
- [x] Align webpack mode with the selected build environment so a non-watch
  development build retains the login form; keep release output isolated.

## Verification

- 108 Node tests passed; TypeScript passed.
- WeChat, H5 and Alipay development builds passed.
- WeChat release build passed; emitted JavaScript excludes the development
  form and module while retaining the WeChat login endpoint.
- Fixture browser workflows passed at 320, 390 and 1440 pixels.
- Live browser login entered the bound worker `wang` (currently named
  `\u738b\u961f`); its task request returned HTTP 200 with an empty task list.
  The workbench greeting and task empty state were verified with no page errors
  and no API writes. Screenshot: `.superpowers/brainstorm/miniprogram-ui-20260906/verification/actual/live-bound-staff.png`.
- Development WeChat output was restored after release-isolation verification.
  The WeChat developer-tool simulator itself was not exercised.
- Preview runs at `http://127.0.0.1:54233`, forwarding API calls to the verified
  local backend on port 8010. The old port 54232 process was left untouched.
