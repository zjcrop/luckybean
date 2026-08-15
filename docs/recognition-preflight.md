# Recognition Preflight 1.0

LuckyBean inserts a confirmation stage between OCR parsing and the formal bean-card draft.

## Flow

`OCR -> layout relations -> multilingual normalization -> field audit -> fixed-format preflight -> user confirmation -> bean form`

The ordinary UI does not expose confidence percentages. Confidence and source evidence remain internal recognition metadata for conflict resolution and traceability.

## Supported label languages

Field anchors and selected canonical value aliases cover Simplified Chinese, Traditional Chinese, English, Japanese, and Korean. Original OCR text is retained even when a display value is normalized or translated.

## Harvest season

`harvestSeason` is an optional first-class bean field, with derived `harvestYear` and `harvestEndYear` where a year or year range is parseable. Explicit crop/harvest lines are consumed by the harvest parser and excluded from unlabeled roast, altitude, and weight fallback scans.

## Fixed preflight order

Country, region, farm/station, variety, harvest season, process, altitude, roaster, roast date, roast level, roast color, flavor, and net weight are displayed in a stable order. Missing values remain visibly blank (`—`) instead of being guessed.

Unresolved dates or unsupported information remain in supplemental recognition information and are not silently written into formal bean fields.
