# LuckyBean 1.24B interaction final validation

This validation branch contains no product-code divergence from `main`. It exists only to run the full pull-request Web and Android gates against the current `1.24B-main.6` source after the interaction-architecture cleanup.

Release acceptance requires:

- Bean groups use canonical `activeGroup` state APIs; no hidden “收” button or DOM click proxy remains.
- Blank bean-page space, bottom “藏”, page changes, swipe/back all close an open group while bean cards and real controls stay interactive.
- User-orderable lists use the shared live-preview sortable controller: single click activates, double click removes where allowed, long press starts sorting, a floating ghost follows the pointer, a placeholder previews the release order, surrounding items animate, and release commits once.
- Professional sensory selected tags are the first adapter for the shared sortable engine; computed lists such as freshness, history and rankings remain non-sortable.
- Smoke tests treat the old drag dot as visual-only and long-press the tag body, matching the shared pointer-gesture architecture.
- Small Brew keeps semantic controls for accessibility but removes button-shaped visual noise; parameters and actions render as text-style interactions except the explicit Pour Over / Other switch.
- Service Worker cache `main-6-ui2`, GitHub Pages and Android embedded Web resources contain the same interaction code.
- All static release/deployment/interaction contracts use the current interaction3/shared-sortable architecture; no stale folder2 or dedicated sensory-pointer contract is accepted.
- Web Static/BrewProfiles/Smoke/Core/Visual and Android compile/package-contract/API29 startup gates all pass against the same merge ref.
- Android package remains `com.luckybean.app`, versionName `1.24B`, versionCode `102402`, and the formal release keeps certificate continuity through `android/signing/CERT_SHA256.txt`.
