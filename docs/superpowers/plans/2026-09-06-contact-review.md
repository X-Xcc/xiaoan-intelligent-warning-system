# Contact Review Implementation Plan

**Goal:** Deliver the contact-review page and 20 separately generated neutral CCTV-style demo scenes.

**Architecture:** Existing dashboard shell and navigation; a typed, fixed demonstration dataset; local review drafts; no biometric search or backend mutations. Scene generation is a development-time activity, never a browser runtime capability.

**Stack:** React, TypeScript, Ant Design, Lucide, Vite, Node test runner, Playwright and Pillow.

## Progress

- [x] Read the existing shell, route map, style tokens and verification conventions.
- [x] Add failing route/data tests, then implement `/contact-review` navigation.
- [x] Add date, query, location, role, status and sort helpers with focused tests.
- [x] Build image-grid and timeline views, selected-record panel and image modal.
- [x] Add local image validation, reference reset and object-URL cleanup.
- [x] Add local review/notes persistence, recovery and confirmed draft clearing.
- [x] Add CSV export with synthetic provenance and formula-injection protection.
- [x] Remove fabricated confidence, duration and online-data claims.
- [x] Verify 18 browser interaction scenarios and seven viewport sizes before asset integration.
- [x] Define the 20-scene manifest, repeated companion continuity and separate asset paths.
- [x] Generate and inspect all 20 distinct scenes; one fictional companion in 11 frames.
- [x] Prepare deterministic camera/time overlays, thumbnails and provenance manifest.
- [x] Verify regression fixes for static-directory routing and cross-tab review drafts.
- [x] Run final full-asset browser verification, data/style tests and dashboard build.
- [x] Queue the finished local page in Codex and record the final verification evidence.

## Verification Commands

```powershell
node scripts/verify_contact_review.mjs
& 'C:/Users/xx/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe' scripts/prepare_contact_assets.py
node scripts/verify_contact_review_browser.mjs
npm run dashboard:build
```

`CONTACT_REVIEW_URL` overrides the default browser-test route at port 5177.
`PLAYWRIGHT_MODULE` overrides the bundled Playwright path.
`--skip-assets` is only for early UI verification, never final acceptance.

## Scope Notes

The user's later requirement explicitly superseded reusing existing monitoring stills. No `night-market-cam-*` image is used by this page.

The bundled image CLI was attempted first. The selected provider returned a different result shape for later requests, so a direct multipart request with `response_format=b64_json` was used without editing the installed skill or storing credentials.

The initial first-scene render is preserved as `output/imagegen/contact-review/continuity-reference.png` for fictional-companion continuity. Its final display version was separately regenerated with a more distant fixed camera. The complete prompt set, camera revision and first-scene override are in `docs/contact-review-scenes.json`. Only everyday public-space conversations are generated. All application metadata is preset and identified as synthetic.

Existing unrelated workspace changes must remain untouched. No commit of the mixed working tree, backend integration, deployment or third-party publication is part of this task.
