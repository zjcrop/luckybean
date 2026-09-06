# Cross-project Stage 0 baseline — LuckyBean

Date: 2026-09-06
Base branch: `main`
Original audited source SHA: `115e5d7f509ee777166a296eefee203451121458`
Stage 0 validated branch head before this record update: `157948b9a9d8c80200087921f9da9e9e018316f4`
Product baseline: LuckyBean `1.24P-main.3` / semver `1.24.17` / schema `10`

This document is the Stage 0 control point for cross-project integration. Stage 0 changes no LuckyBean production/runtime business behavior. The only executable additions are test/CI instrumentation used to make the baseline repeatable.

## 1. Freeze boundary

The following areas are already materially improved on the current baseline and are **not** open for broad redesign during the next cross-project work unless a reproducible regression is demonstrated:

- startup/local-first boot path;
- login/auth compatibility and first-login recovery;
- Safari/WebKit auth callback handling;
- lazy loading of heavy recognition/runtime modules;
- Android Native OCR priority and Native fast path that bypasses WebView decode/pixel scan/JPEG re-encode;
- current PP-OCR capture-flow warmup and reuse behavior;
- RecognitionDocument / Coffee Foundation authority boundary;
- AI recognition results remaining advisory rather than authoritative;
- BrewPlan/BrewResult contracts and existing production calculation core.

These remain regression targets, not Stage 1 feature work.

## 2. Recognition scope retained for later stages

Do not re-introduce startup-time full OCR-model loading. Do not add a new permanent-resident OCR architecture unless measurement demonstrates the current reuse policy is a bottleneck.

Remaining recognition work is intentionally deferred from Stage 1:

1. multi-item grouping / record-boundary robustness;
2. Chinese and other date-form normalization;
3. continuous flavor-token segmentation;
4. review/confirmation policy and direct field editing;
5. re-recognition staying on the recognition/review screen instead of auto-handoff;
6. capture UI simplification;
7. visible progress only for work expected to exceed about 5 seconds;
8. cross-project reuse of stable recognition contracts by AromaSense/Yingxiang.

Automatic full-image ROI cropping is not a mandatory normal-path step. Capture-quality feedback should first warn when text occupies too little of the frame. ROI remains a targeted recovery mechanism.

## 3. Cross-project integration mismatch recorded

AromaSense currently pins LuckyBean to:

`ff2db954a27aba1adc882e0f0c5392af0cd082f3`

That is older than the LuckyBean Stage 0 baseline. AromaSense therefore does not automatically inherit later LuckyBean startup, WebKit, OCR reuse and Android Native preprocessing changes.

The AromaSense hardening pipeline also reflects an older recognition-provider contract. The dependency must not be blindly bumped during Stage 1 navigation work. Reconciliation belongs to the later Recognition integration stage with explicit adapter tests.

## 4. Cross-project interfaces to stabilize before code sharing

Stage 1 should converge on interfaces, not implementation-file copying:

- Overlay / Navigation / Back / Exit semantics;
- RecognitionDocument / RecognitionSession / RecognitionIssue;
- record grouping for multi-item input;
- BatchInput source-to-record contract;
- SortableList behavior;
- long-task status contract;
- AI advisory and sensory-summary contracts.

A shared package extraction remains deferred until interfaces pass acceptance in both repositories.

## 5. Performance guardrails

For later stages compare against this baseline on at least:

- startup: Chromium, Android and Safari/WebKit;
- login: logged-out, logged-in and callback/re-entry;
- OCR: single image and representative multi-image batch;
- memory/stability: repeated recognition entry and Safari background/foreground;
- UI: modal opening/closing and back-navigation.

Recommended regression thresholds:

- startup p50: no >10% regression;
- startup p95: no >15% regression;
- single-image OCR: no meaningful slowdown without accuracy gain;
- multi-image throughput: must not degrade;
- Safari/WebKit: no new refresh, blank-screen or crash behavior.

## 6. Final Stage 0 execution record

The final Stage 0 CI ran on GitHub Actions Ubuntu 24.04 using Node 22 for the LuckyBean main workflow. A first attempt encountered a transient failure in the existing live BrewProfiles remote check. Re-running the same SHA without source changes passed the BrewProfiles contract, indicating a remote availability fluctuation rather than a protocol regression.

Final passing coverage on the Stage 0 branch included:

- dependency install and vendor preparation;
- `npm audit --audit-level=high`: 0 vulnerabilities;
- JavaScript syntax validation;
- private-key/server-secret source scan;
- static and recognition regression suites: 126/126 recognition tests passed;
- live BrewIon Coffee Foundation contract;
- live BrewProfiles contract: 42 workbook profiles;
- live Recognition AI inference using the configured free GLM chain;
- Chromium startup/UI smoke: 13/13;
- Stage 0 PP-OCR performance benchmark;
- WebKit auth/OCR compatibility: 4/4;
- core Playwright suite: 54/54;
- visual baseline: 3/3;
- Android debug build;
- separate LuckyBean Android integration workflow.

Both `LuckyBean main tests` and `LuckyBean integration Android` completed successfully for branch head `157948b9a9d8c80200087921f9da9e9e018316f4` before this documentation-only update.

## 7. Repeatable OCR performance baseline

The benchmark exercises the production stable Recognition Core entry and current self-hosted PP-OCR provider with deterministic camera-like JPEG fixtures. It is a **performance/regression fixture**, not a claim of real coffee-bag accuracy validation.

Observed GitHub Actions Chromium result:

| Case | Prepare | OCR | Total | Blocks |
| --- | ---: | ---: | ---: | ---: |
| first single image / cold runtime | 18.8 ms | 3071.0 ms | **3089.8 ms** | 4 |
| immediate repeat / same runtime | 11.6 ms | 827.6 ms | **839.2 ms** | 4 |
| four-image warm batch | 38.9 ms | 3392.0 ms | **3430.9 ms** | 16 |

Additional observations:

- engine: `PP-OCRv5-browser-0.4.8-self-hosted-worker`;
- Runtime-ready events: **1** across cold single, repeat single and four-image batch;
- progress events recorded: 15;
- immediate repeat is about 72.8% faster than the cold single total, demonstrating actual runtime/model reuse rather than reinitialization on every recognition call.

This baseline shows that OCR inference dominates image preparation. Stage 1 must not touch this path.

## 8. Browser and Android runtime status

The earlier local container lacked Playwright browsers and Android SDK, so its blocked runs remain useful only as an environment note. That limitation has now been superseded by the GitHub Actions validation on the same Stage 0 branch:

- Chromium smoke passed;
- WebKit auth/OCR compatibility passed;
- Android debug build and Android integration workflow passed;
- core and visual Playwright suites passed.

A physical-device coffee-bag photo accuracy set is still desirable for later Recognition-stage acceptance. Its absence is not treated as a Stage 1 navigation blocker because Stage 1 is explicitly prohibited from changing recognition semantics or recognition runtime behavior.

## 9. Stage 0 risk disposition

- Green: repeatable single/repeat/four-image OCR timing now exists.
- Green: runtime reuse is measured and confirms one initialization across consecutive calls.
- Green: Chromium, WebKit and Android CI paths are executable and passing.
- Green: source dependency, syntax, secret, canonical, migration and BrewPlan/BrewResult gates pass.
- Yellow: live BrewProfiles and other remote contract checks can still exhibit transient network/service failures; retries must not conceal deterministic protocol failures.
- Yellow: real coffee-bag accuracy remains a later Recognition-stage/manual-device acceptance item.

Stage 0 is therefore **validated for entry to Stage 1**.

## 10. Stage 1 entry condition

The Global Interaction Foundation may proceed under these constraints:

- do not modify Recognition semantics, PP-OCR runtime, RecognitionDocument contracts or Coffee Foundation authority;
- do not modify business data schemas or Brew calculation logic;
- preserve local-first, login and current startup behavior;
- implement navigation/overlay/back/exit as a shared interaction boundary with regression tests;
- any regression against the Stage 0 browser/Android gates blocks Stage 1 merge.
