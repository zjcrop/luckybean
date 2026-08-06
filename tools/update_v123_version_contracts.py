from pathlib import Path
import runpy

OLD = '1.2.2-cloud-safety-test'
NEW = '1.2.3-brewprofiles-integration-test'
OLD_ESCAPED = r'1\.2\.2-cloud-safety-test'
NEW_ESCAPED = r'1\.2\.3-brewprofiles-integration-test'
OLD_CACHE = 'luckybean-v122-cloud-safety-test-'
NEW_CACHE = 'luckybean-v123-brewprofiles-integration-test-'

# Runtime imports and cache-busting query strings must move as one versioned unit.
for path in Path('src').rglob('*.js'):
    text = path.read_text(encoding='utf-8')
    updated = text.replace(OLD, NEW)
    if updated != text:
        path.write_text(updated, encoding='utf-8')

# Profile catalog refresh is owned by the browser-facing catalog service. The brew
# engine reads the current verified catalog but never starts network activity at
# module-import time, which keeps the core deterministic and testable.
engine_path = Path('src/brew-engine.js')
engine = engine_path.read_text(encoding='utf-8')
engine = engine.replace(
    "import { listCachedBrewProfiles, refreshBrewProfileCatalog } from './services/brew-profile-catalog-service.js';",
    "import { listCachedBrewProfiles } from './services/brew-profile-catalog-service.js';",
)
engine = engine.replace(
    "\nrefreshBrewProfileCatalog().catch(error => console.warn('BrewProfiles方案目录尚未更新，暂用本地启动目录', error));\n",
    "\n",
)
engine_path.write_text(engine, encoding='utf-8')

# Historical tests continue to enforce the same local-first and cloud-safety
# invariants, but against the current release identity.
for path in Path('tests').glob('*.mjs'):
    text = path.read_text(encoding='utf-8')
    updated = text.replace(OLD_ESCAPED, NEW_ESCAPED)
    updated = updated.replace(OLD, NEW)
    updated = updated.replace(OLD_CACHE, NEW_CACHE)
    updated = updated.replace(
        "LEGACY_CACHE_PREFIXES = \\['luckybean-v120-test-', 'luckybean-v121-account-test-'\\]",
        "LEGACY_CACHE_PREFIXES = \\['luckybean-v120-test-', 'luckybean-v121-account-test-', 'luckybean-v122-cloud-safety-test-'\\]",
    )
    updated = updated.replace(
        'v1.2.2 single account, recoverable panel and protected cloud deletion checks passed',
        'v1.2.3 single account, protected cloud deletion and BrewProfiles integration checks passed',
    )
    if updated != text:
        path.write_text(updated, encoding='utf-8')

semantic_update = Path('tools/update_v123_contract_semantics.py')
if semantic_update.exists():
    runpy.run_path(str(semantic_update), run_name='__main__')
    semantic_update.unlink()
