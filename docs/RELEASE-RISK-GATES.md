# LuckyBean main-sync.7 release risk gates

| Risk | Automated release gate | Failure policy |
|---|---|---|
| A low total score incorrectly triggers optimization | Unit and static tests require `totalScoreUsedAsTrigger=false` and no score-threshold fallback | Block main build |
| A parameter edit silently rematches another recipe | Coordinator and optimizer tests require preservation of the executed profile | Block main build |
| An older asynchronous result overwrites the latest inputs | Latest-wins concurrency test | Block main build |
| Optimization advice is shown before tasting or without a completed brew | Assessment tests require a linked completed-brew record | Block main build |
| Advice cannot be found or verified later | Bean-card load and validation lifecycle static checks | Block main build |
| Personalized 3D targets mutate the standard model | Unit test compares immutable standard targets and separate personal targets | Block main build |
| Sparse feedback over-personalizes the display | Unit test requires at least three linked observations | Block main build |
| 3D failure creates an unrelated table or alternative prediction | Static test requires same-scene retry and rejects fallback code in the controller | Block main build |
| 3D trend is misread as a certain sensory outcome | APK resource check requires the prediction/trend disclaimer | Block main build |
| Repeated calculation or record scans cause UI stalls | Cached sensitivity profile, 500-record processing cap, latest-wins coordinator; browser smoke/visual suite | Block on automated regression; profile on representative device after release candidate install |
| History, IndexedDB, or sync updates become partially written | Draft creation and validation use one IndexedDB transaction and append a revision/outbox item | Block on history/static suite |
| Old clients cannot read new records | New fields are additive under `brew-history/1.0`; standard analysis and spatial contracts remain unchanged | Block on core/contract suite |
| APK is unsigned, signed by the wrong key, or leaks a secret | `apksigner` certificate SHA-256 equality, secret/private-key byte scan, and exact versionCode check | Block artifact upload |
| Web and APK contain different source revisions | Both are built only after tests for the same immutable main SHA and record it in provenance | Block artifact upload/deployment |

The APK contains only the Android signing result and public certificate metadata.
The keystore/private key remains in GitHub Actions encrypted secrets and is never
copied into web assets, the APK payload, source archives, logs, or the repository.

