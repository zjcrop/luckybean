# LuckyBean stable cross-project data format

This is the shared business-data standard between LuckyBean, BrewProfiles, Web,
Android and future clients. The object named `data` contains coffee and brewing
data only. Application versions, engine versions and protocol versions belong to
the transport envelope and are not used to interpret business fields.

## Stable input object

Required groups:

- `bean`: coffee identity and roast/process codes;
- `brew`: dose, ratio, method, profile and equipment;
- `water`: water profile, recipe volume and TDS;
- `environment`: ambient, humidity and initial bed temperature;
- `targets`: sensory targets.

Canonical units are fixed: grams (`doseG`, `stageWaterG`, `cumulativeWaterG`),
seconds (`startSec`, `durationSec`), degrees Celsius (`temperatureC`,
`coreTemperatureC`), grams per second (`flowGPerSec`), milligrams per litre
(`tdsMgL`) and a dimensionless brew ratio.

Planning numeric fields accept finite numbers. Only an omitted field may receive
its documented default; explicit `null`, empty strings, booleans and numeric
strings are rejected for required dose, ratio, recipe volume and targets.
Optional measured values preserve `null` as unknown and preserve a real zero.

`water.tdsMgL` is a supplied source-water reading in mg/L. Preset
`referenceTdsMgL` / `referenceTdsRangeMgL` are separate reference data and never
fill a missing reading. Optional `water.ionsMgL` uses `Ca`, `Mg`, `Na`, `K`,
`HCO3`, `CO3`, `Cl`, `SO4`; absent ion concentrations remain unknown.
`water.alkalinityMgLAsCaCO3` is separately supplied total alkalinity.
`water.concentrationBasis` records whether ions are pre-heating calculated,
source-water measured, post-heating measured, or unspecified. Calculated
carbonate contribution does not replace total alkalinity or heated-water data.

Optional `measurements.beverageTdsPct` is the beverage TDS mass percentage
(for example `1.35`, not `0.0135`), paired with the actual final
`measurements.beverageMassG` and actual `measurements.doseG`. If measurement dose
is omitted, an explicitly supplied `brew.doseG` may be used with that assumption
recorded; an explicit measurement dose `null` must not fall back. Apparent
recovered yield in percent is `beverageTdsPct * beverageMassG / doseG`.
Total input water never substitutes for final beverage mass, and source-water
EC-derived ppm is never blindly subtracted from a coffee refractometer reading.

Additive output `waterAnalysis` and `extractionAssessment` are also preserved in
`BrewResult.physical` and its history snapshot. They distinguish supplied data,
unknown values, chemical accounting and apparent measured mass balance from
empirical recipe references; they do not alter the authoritative recipe.

## Stable output data

Stages use these canonical fields:

`index`, `name`, `startSec`, `durationSec`, `stageWaterG`,
`cumulativeWaterG`, `temperatureC`, `coreTemperatureC`, `flowGPerSec`.

Professional spatial data uses fixed axes:

`[time_s, bed_temperature_c, cumulative_water_g]`

and the fixed target IDs:

`acidity`, `floral`, `fruity`, `sweetness`, `bitterness`, `astringency`.

All six input target values are finite numbers from `0` to `3`. Higher values
increase extraction emphasis for acidity/floral/fruity/sweetness and increase
suppression priority for bitterness/astringency. `body` is not a canonical target;
provider-specific body modelling remains internal to the engine.

## Compatibility rules

1. Existing field names, meanings, units and IDs are never reused for a new meaning.
2. New fields are additive and must be ignored by older readers.
3. Required fields are not removed or made nullable without a migration period.
4. Field renames require an adapter that reads both names and writes only the canonical name.
5. Breaking protocol changes may still bump the transport contract; this does not change the business-data format.
6. A producer must validate the canonical object before sending it, and a consumer must reject invalid required data rather than guessing.

The HTTP request body is the stable business object itself and must not contain
`schemaVersion`, `appVersion`, `engineVersion` or `profileVersion`. Protocol
metadata belongs in headers or the response envelope and must never control how
the business fields are interpreted.

## Post-tasting optimization records

Optimization is an application history layer and is not part of the provider
transport object. It can be created only after a tasting is linked to a completed
brew. A total score, predicted score or the difference between them must never be
used as the sole trigger. The assessment records up to three explicit dimension
issues, their evidence, direction, severity and the controllable plan adjustment.

The optimized draft preserves the profile that was actually brewed and changes
only controllable parameters. It is stored on the bean's source brew record with
status `pending-validation`. Loading the draft adds an application-only validation
reference to the next raw brew input. After that brew receives a tasting, the
source draft is classified as `effective`, `partially-effective`, `ineffective`
or `inconclusive`; this classification never overwrites the original tasting.

The standard spatial targets remain immutable. A separate personal target layer
may be displayed after at least three linked observations. Both views use the same
deterministic model trajectory and exist to compare trends and relative parameter
effects, not to claim a certain sensory outcome. A rendering failure retries the
same spatial input and must not synthesize a table or alternate prediction.

