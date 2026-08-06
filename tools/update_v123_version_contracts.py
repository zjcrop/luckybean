from pathlib import Path

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
