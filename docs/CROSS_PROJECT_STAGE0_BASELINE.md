# Cross-project Stage 0 baseline — LuckyBean

Date: 2026-09-06
Base branch: `main`
Validated source SHA for this audit: `115e5d7f509ee777166a296eefee203451121458`
Product baseline: LuckyBean `1.24P-main.3` / semver `1.24.17` / schema `10`

This document is a pre-integration control point. It changes no runtime behavior and must not be treated as a release by itself.

## 1. Freeze boundary

The following areas are already materially improved on the current baseline and are **not** open for broad redesign during the next cross-project work unless a reproducible regression is demonstrated:

- startup/local-first boot path;
- login/auth compatibility and first-login recovery;
- Safari/WebKit auth callback handling;
- lazy loading of heavy recognition/runtime modules;
- Android Native OCR priority and the Native fast path that bypasses WebView decode/pixel scan/JPEG re-encode;
- current PP-OCR capture-flow warmup and reuse behavior;
- RecognitionDocument / Coffee Foundation authority boundary;
- AI recognition results remaining advisory rather than authoritative;
- BrewPlan/BrewResult contracts and existing production calculation core.

These items remain regression targets, but are not new feature work.

## 2. Recognition scope retained for later stages

Do not re-introduce startup-time full OCR-model loading. Do not add a new permanent-resident OCR architecture until measurements show the current reuse policy is a bottleneck.

The remaining high-value recognition work is:

1. multi-item grouping / record-boundary robustness;
2. Chinese and other date-form normalization;
3. continuous flavor-token segmentation;
4. review/confirmation policy and direct field editing;
5. re-recognition staying on the recognition/review screen instead of auto-handoff;
6. capture UI simplification;
7. visible progress only for work expected to exceed about 5 seconds;
8. cross-project reuse of stable recognition contracts by AromaSense/Yingxiang.

Automatic full-image ROI cropping is **not** a mandatory pipeline step. Capture-quality feedback should first warn when text occupies too little of the frame. ROI remains a targeted recovery mechanism for low-confidence areas.

## 3. Cross-project integration mismatch discovered in Stage 0

AromaSense currently pins its LuckyBean dependency to commit:

`ff2db954a27aba1adc882e0f0c5392af0cd082f3`

That is older than the LuckyBean baseline audited here. AromaSense therefore does not automatically inherit later LuckyBean improvements in startup, WebKit handling, OCR reuse, and Android Native preprocessing.

The AromaSense build hardening script also contains runtime assertions that match the older provider contract (for example `workerOnly === true`), while the current LuckyBean provider exposes WebKit compatibility behavior that is not worker-only. The dependency cannot be blindly bumped to current `main`; the contract adapter/hardening tests must be reconciled first.

## 4. Cross-project contracts to stabilize before code sharing

The next stages should converge on interfaces, not on copying implementation files between repositories:

- Navigation / Overlay / Back / Exit semantics;
- RecognitionDocument / RecognitionSession / RecognitionIssue;
- record grouping for multi-item input;
- BatchInput source-to-record contract;
- SortableList behavior;
- long-task status contract (visible progress only for expected >5 s tasks);
- AI advisory contract and sensory-summary contract.

A shared npm/package extraction is intentionally deferred until the interfaces have passed both LuckyBean and AromaSense acceptance.

## 5. Performance guardrails

Before merging any later stage, compare against this baseline on at least:

- startup: Chromium, Android, Safari/WebKit;
- login: logged-out, logged-in, callback/re-entry;
- OCR: single image and representative multi-image batch;
- memory/stability: repeated recognition entry, Safari background/foreground;
- UI: modal opening/closing and back-navigation.

No new optimization is accepted only because it is theoretically faster. It must preserve recognition accuracy and not create a new Safari/Android regression.

Recommended regression thresholds after measurement is captured:

- startup p50: no >10% regression;
- startup p95: no >15% regression;
- single-image OCR: no meaningful slowdown without accuracy gain;
- multi-image throughput: must not degrade;
- Safari: no new refresh, blank-screen, or crash behavior.

## 6. Stage 0 execution record

Execution time: `2026-09-06T09:31:02Z`

Environment: Linux, Node `v24.19.0`, npm `11.9.0`. Tests were executed from
`stage0-cross-project-baseline-20260906` at the pre-record commit
`4a26a769221057c1694520eb3d51efdd79806f29`, whose only change from the audited
source SHA is this control document.

The repository must be prepared with `npm ci` before the static gate. An initial
static run made before that preparation failed at the jsQR vendor assertion.
Running the same CI installation step generated the expected jsQR and PP-OCR
vendor assets; the unchanged static gate then passed. This was an environment
setup failure, not an application-source repair.

| Command | Observed result | Wall time |
| --- | --- | ---: |
| `npm ci` | pass; 4 packages installed and vendor preparation completed | 35.39 s |
| `npm audit --audit-level=high` | pass; 0 vulnerabilities | 13.83 s |
| JavaScript syntax check from `test-main.yml` | pass | 6.88 s |
| private-key/server-secret pattern scan from `test-main.yml` | pass; no forbidden pattern | 0.07 s |
| `npm run test:recognition` | pass; 126/126 | 0.72 s |
| `npm run test:static` | pass after `npm ci`; all static suites and nested 126/126 recognition tests | 20.99 s |

Data-integrity coverage observed in the passing suite includes archive hash
tamper rejection, legacy backup migration, future-schema rejection, local-first
storage, date-field ownership, Recognition canonical review boundaries and
BrewPlan/BrewResult contract validation.

## 7. Browser, Android and OCR measurement status

The requested local browser commands were invoked, but this container did not
contain the Playwright browser binaries:

| Command | Observed result |
| --- | --- |
| `npm run test:smoke` | blocked before application assertions; Chromium executable missing (13 tests) |
| `npm run test:core` | blocked before application assertions; Chromium executable missing (54 tests) |
| `npm run test:visual` | blocked before application assertions; Chromium executable missing (3 tests) |
| `npm run test:webkit` | blocked before application assertions; WebKit executable missing (4 tests) |

`npx playwright install chromium webkit` was attempted. Five Chromium download
attempts timed out after 30 seconds each, and a direct endpoint check returned
HTTP 502 from the environment proxy. No system Chromium, WebKit, Gradle or
Android SDK installation was available. Therefore local Chromium/WebKit and
Android startup are **not** claimed as passed.

The public Pages artifact tied to the audited `main` SHA was opened separately
in a cloud Chromium smoke session. The logged-out application reached the
`豆藏` page without a visible error. The first navigation-to-DOM wall reading
was 12.111 s and a same-tab reload-to-visible-`豆藏` reading was 1.848 s. These
include remote browser/network control overhead and are observational only;
they are not a standards-compliant performance baseline and must not be used
for the 10%/15% regression thresholds.

GitHub reported eight completed-success checks for
`115e5d7f509ee777166a296eefee203451121458` on 2026-09-06, including `verify`,
`android_debug`, Pages build/deploy/verify and release build. This confirms the
CI jobs completed on the exact audited source, but it does not substitute for a
physical Android launch or local Safari/WebKit measurement.

No representative bean-label photos are stored in this checkout. Because the
browser runtimes could not be installed, single-image OCR, four-image OCR,
runtime-initialization count and repeated-recognition latency remain
**unmeasured**. Static tests confirm only the intended lazy/reusable runtime
contracts; they are not reported as OCR performance results.

## 8. Current Stage 0 risks

- Red: no repeatable single-image/four-image OCR timing exists yet.
- Red: Safari/WebKit and Android launch were not exercised in this container.
- Yellow: the cloud-browser cold reading is dominated by an uncontrolled remote
  network path and cannot serve as a regression threshold.
- Green: source-level dependency, syntax, secret, canonical, migration and core
  data-contract gates passed without business-code changes.

Stage 0 is therefore recorded accurately but is **not fully validated**. Stage 1
must not begin until the missing runtime/OCR measurements are captured in an
environment with the pinned Playwright Chromium/WebKit binaries and, for
Android, an SDK/emulator or physical device.

## 9. Stage 1 entry condition

Proceed to Global Interaction Foundation only after:

- this freeze boundary is accepted;
- current startup/login/OCR behavior is manually confirmed as a usable baseline;
- benchmark commands are recorded for repeatable comparison.

Stage 1 must not modify Recognition semantics or business data schemas.
