# LuckyBean 1.24B final group/sensory E2E gate

This branch starts from `c5604622242f263df20ca21e07e0cb7e3e1d2e56` and exists only to run the complete PR gates after adding the real Playwright long-press drag test.

Required outcomes:
- canonical bean-group state API, no hidden back button;
- blank-space / 藏 / navigation / back group close;
- real selected-tag long-press drag changes DOM order;
- completion event persists the reordered `professionalData.selections`;
- Web static/BrewProfiles/Smoke/Core/Visual all pass;
- Android compiles, embeds the same controllers, passes API29 startup.
