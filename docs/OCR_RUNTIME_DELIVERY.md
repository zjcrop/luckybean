# OCR runtime delivery (2026-09-08 incident repair)

The production outage had two delivery causes: the Worker loader compared the decoded Fetch body to compressed HTTP Content-Length, and subsequent fixes removed asset preparation without wiring its replacement into the main gate. QR assets also disappeared with the removed install hook. AromaSense was still pinned to the affected producer.

- `npm ci` vendors only the installed jsQR package; it does not download or rebuild OCR.
- `npm run prepare:ocr` explicitly prepares pinned PaddleOCR 0.4.2 / ORT 1.22.0 assets and verifies the Worker decoded length and SHA-256, WASM headers, models and local module dependencies.
- Main tests invoke the reusable preparation workflow once and consume its SHA-addressed artifact. The OCR baseline serves a real gzip Worker response and checks actual single/repeat/four-image inference.
- Pages and signed APK packaging restore that exact successful main-test run's artifact and verify all checksums. Production packaging does not regenerate the vendor bundle.
- The Pages release gate loads the lazy provider explicitly and recognizes a JPEG fixture through the deployed OCR, before recording a successful receipt.
- AromaSense must pin the repaired immutable LuckyBean commit and explicitly verify its runtime before packaging.

All components remain the existing free/local OCR stack. No paid service, model, API or storage is introduced. Native Android OCR and canonical data contracts are unchanged.

Local verification: `npm ci`, `npm run prepare:ocr`, `npm run test:static`. The browser gates and production receipt are authoritative for actual deployment; a source commit alone is not a release.
