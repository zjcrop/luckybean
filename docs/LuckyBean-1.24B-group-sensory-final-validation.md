# LuckyBean 1.24B — canonical group close + sensory sorting validation

This validation branch starts exactly from the current `main` source.

Release gates must verify:

- `bean-groups-controller` owns `activeGroup` and exposes `closeActiveGroup()` / `hasActiveGroup()`.
- Expanded group DOM contains no hidden `data-v099t-group-back` or “收” button.
- Blank Beans-page space, bottom “藏”, page navigation, swipe-left and system back call the canonical group state API.
- `sensory-tag-sort-controller` loads through the runtime feature graph and Service Worker.
- Long-press on any selected sensory tag enters sort mode; Pointer Events + pointer capture perform wrapped tag reordering.
- The resulting order is written back into `professionalData.selections` before the sensory record is persisted.
- Web static/BrewProfiles/Smoke/Core/Visual and Android compile/APK-contract/API29 startup gates all pass on the same source.
