# Cross-project Stage 1 — Global Interaction Foundation (LuckyBean)

Date: 2026-09-06  
Branch: `stage1-global-interaction-foundation-20260906`  
Stage 0 parent: `96742ec` (`stage0-cross-project-baseline-20260906`)

This stage establishes the interaction contract in LuckyBean before the same
contract is consumed by AromaSense. Recognition semantics, OCR models,
authentication, storage schemas, and brew calculation are unchanged.

## Implemented contract

- One `OverlayManager` owns picker, popover, dialog, modal, full-screen preview,
  camera, recognition, account, and confirmation layers.
- All registered layers share one `rgba(0,0,0,.68)` scrim; individual overlay
  backdrops are transparent and CSS backdrop blur is removed.
- `NavigationManager`, `FlowNavigation`, `BackGestureAdapter`, and
  `RootExitGuard` expose one ordered Back contract.
- Back order is keyboard, picker/popover, dialog, modal, workflow step, child
  view, current top-level root, then the `beans` app root.
- The four sibling top-level pages do not use `history.pushState()` and never
  create synthetic history depth. Ordinary Safari browser Back remains native.
- At app root, the first guarded Back shows a hint; the second opens a managed
  confirmation; only the explicit Exit button calls `LuckyBeanNative.exitApp()`.
- A Back while the exit confirmation is open closes it without exiting.
- Android system Back no longer calls `finish()` as a fallback when the web
  interaction adapter is absent or still starting.
- Production native confirm/alert calls were replaced by managed dialogs.
- Full-screen 3D Back invokes its real close lifecycle, so body scroll lock and
  renderer state are cleaned instead of removing the DOM node directly.

## Performance and lifecycle guard

The first implementation introduced a permanent deep MutationObserver on
`document.body`; the existing UI-stability gate correctly rejected it. The
accepted implementation observes only `#overlayRoot` plus each explicitly
registered direct-body layer while that layer exists. Popup, camera, sensory,
help, freshness, and 3D layer creators now register themselves explicitly.

## Verification observed in this environment

| Command | Result |
| --- | --- |
| `npm ci` | pass; required jsQR and PP-OCR vendor preparation completed |
| JavaScript syntax checks for changed files | pass |
| `npm run test:recognition` | pass; 126/126 |
| `npm run test:static` | pass; all static and nested recognition gates |
| `git diff --check` | pass |

The static suite includes the pre-existing no-global-body-observer performance
guard, Local-first/deletion propagation, startup/auth, recognition ownership,
brew contracts, and the new Overlay/Back/Exit assertions. No persisted data
contract changed in Stage 1.

## Environment limits and remaining acceptance

- `tests/v123e-ui-interaction.spec.mjs` defines seven Chromium tests, including
  the two new layer-stack and root-exit paths, but the run could not enter any
  application assertion because the pinned Playwright Chromium executable is
  absent.
- `npx playwright install chromium` again timed out at the environment proxy.
- No Gradle wrapper, system Gradle, Android SDK, emulator, or physical device is
  present, so the Java bridge has static contract coverage but no local APK
  execution claim.
- Manual acceptance remains required for layered dialogs, repeated Back,
  Android gestures, Safari/PWA behavior, and draft preservation before this
  foundation is frozen.

Stage 2 must not begin until this Stage 1 branch has CI/device acceptance.
