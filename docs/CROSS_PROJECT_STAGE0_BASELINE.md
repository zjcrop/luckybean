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

## 6. Stage 0 execution note

Repository inspection and dependency/contract audit are complete for this control point. The GitHub connector exposes no completed status checks for the current merge SHA, and this chat runtime cannot clone GitHub directly for local benchmark execution. Therefore **runtime benchmark numbers are not claimed here**. They must be captured in the execution environment before Stage 1 is accepted.

## 7. Stage 1 entry condition

Proceed to Global Interaction Foundation only after:

- this freeze boundary is accepted;
- current startup/login/OCR behavior is manually confirmed as a usable baseline;
- benchmark commands are recorded for repeatable comparison.

Stage 1 must not modify Recognition semantics or business data schemas.
