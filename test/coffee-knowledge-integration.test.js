import test from 'node:test';
import assert from 'node:assert/strict';
import { applyCoffeeKnowledge, canonicalRegionId, canonicalEntityId } from '../src/services/coffee-knowledge-adapter.js';
import { knowledgeOnlyVarietyCandidates, bestKnowledgeOnlyVarietyCandidate } from '../src/services/knowledge-only-variety-candidates.js';
import { makeIndex, parseNaturalLanguage } from '../src/codebook.js';
import { PROVIDER_REGISTRY } from '../src/services/provider-package-service.js';

function baseBook() {
  return {
    version: 6,
    countries: [['CO-EA', '埃塞俄比亚', 'Ethiopia', 'ET', 'active']],
    regions: [['RG-EA-YIR', 'CO-EA', '耶加雪菲', 'Yirgacheffe', '耶加', 'active']],
    entities: [['ST-EA-WORKA', 'CO-EA', 'RG-EA-YIR', 'Worka 处理站', 'Worka Washing Station', 'Worka', 'active']],
    varieties: [['VA-GE', '瑰夏', 'Gesha', 'Geisha', 'active']],
    processes: [['PR-NA', '日晒', 'Natural', 'Natural', 'active']],
    flavors: []
  };
}

function knowledge() {
  return {
    _format: 'coffee-knowledge-bundle',
    contract: 'coffee-knowledge/1.0',
    version: '1.0.0-alpha.test',
    compatibility: { qrIndexesChanged: false },
    localizedNames: [
      { targetId: 'WCR-HP-ANACAFE-14', language: 'zh-Hans', name: 'Anacafé 14', nameType: 'ai_transliterated', confidence: 0.8, reviewStatus: 'pending_market_verification' }
    ],
    localizedAliases: [
      { targetCode: 'VA-GE', language: 'ja', alias: 'ゲイシャ', nameType: 'ai_transliterated', confidence: 0.8, reviewStatus: 'pending_market_verification' },
      { targetCode: 'RG-EA-YIR', language: 'ko', alias: '예가체프', nameType: 'ai_transliterated', confidence: 0.8, reviewStatus: 'pending_market_verification' },
      { targetCode: 'PR-NA', language: 'ja', alias: 'ナチュラル', nameType: 'ai_transliterated', confidence: 0.85, reviewStatus: 'pending_market_verification' },
      { targetCode: 'CO-EA', language: 'ko', alias: '에티오피아', nameType: 'ai_transliterated', confidence: 0.9, reviewStatus: 'pending_market_verification' },
      { targetCode: 'VA-GE', language: 'ko', alias: '낮은신뢰', nameType: 'ai_transliterated', confidence: 0.4, reviewStatus: 'pending_market_verification' }
    ],
    unboundKnowledge: {
      varietyDetails: [
        {
          id: 'WCR-HP-ANACAFE-14',
          recordType: 'cultivar_or_breeding_population',
          canonicalNameEn: 'Anacafe 14',
          speciesId: 'SP-ARABICA',
          sourceRefs: ['SRC-WCR-CATALOG'],
          confidence: 1,
          coreEligibility: 'pending_consumer_ocr_frequency_review'
        },
        {
          id: 'WCR-HP-CATIMOR-129',
          recordType: 'cultivar_selection',
          canonicalNameEn: 'Catimor 129',
          aliases: ['Cat129', 'Nyika'],
          speciesId: 'SP-ARABICA',
          sourceRefs: ['SRC-WCR-CATALOG'],
          confidence: 1,
          coreEligibility: 'pending_consumer_ocr_frequency_review'
        }
      ]
    },
    regions: [{ code: 'RG-EA-YIR', canonicalGeoIdentityId: 'GEO-EA-YIR' }],
    entities: [{ code: 'ST-EA-WORKA', canonicalIdentityId: 'ENT-EA-WORKA' }]
  };
}

test('Coffee Knowledge provider is optional and preserves QR-core ownership', () => {
  const provider = PROVIDER_REGISTRY['brewion-knowledge'];
  assert.equal(provider.contract, 'coffee-knowledge/1.0');
  assert.equal(provider.required, false);
  assert.equal(provider.manifestProvider, 'brewion');
});

test('knowledge aliases augment matching without changing QR indexes or visible columns', () => {
  const original = baseBook();
  const augmented = applyCoffeeKnowledge(original, knowledge());
  assert.equal(original.varieties[0].length, 5);
  assert.equal(augmented.varieties[0][0], 'VA-GE');
  assert.equal(augmented.varieties[0][1], '瑰夏');
  assert.ok(augmented.varieties[0].includes('ゲイシャ'));
  assert.ok(!augmented.varieties[0].includes('낮은신뢰'));
  const index = makeIndex(augmented);
  assert.equal(index.varieties.get('VA-GE').index, 1);
  assert.equal(index.regions.get('RG-EA-YIR').index, 1);
  assert.equal(augmented.coffeeKnowledgeClient.qrIndexesChanged, false);
});

test('Japanese/Korean OCR text resolves to existing v6 codes through hidden knowledge aliases', () => {
  const augmented = applyCoffeeKnowledge(baseBook(), knowledge());
  const parsed = parseNaturalLanguage('国家：에티오피아\n产区：예가체프\n豆种：ゲイシャ\n处理法：ナチュラル', augmented);
  assert.equal(parsed.countryCode, 'CO-EA');
  assert.equal(parsed.regionCode, 'RG-EA-YIR');
  assert.equal(parsed.varietyCode, 'VA-GE');
  assert.equal(parsed.processCode, 'PR-NA');
  assert.equal(parsed.evidence.varietyCode, 'ゲイシャ');
});

test('knowledge-only WCR varieties can match OCR evidence without receiving a QR core code', () => {
  const augmented = applyCoffeeKnowledge(baseBook(), knowledge());
  const direct = bestKnowledgeOnlyVarietyCandidate(augmented, 'Anacafe 14');
  assert.equal(direct?.knowledgeId, 'WCR-HP-ANACAFE-14');
  assert.equal(direct?.canonicalNameEn, 'Anacafe 14');
  assert.equal(direct?.qrCoreCode, null);
  assert.equal(direct?.qrEligible, false);
  assert.equal(direct?.manualConfirmationRequired, true);
  assert.deepEqual(direct?.sourceRefs, ['SRC-WCR-CATALOG']);

  const aliasMatches = knowledgeOnlyVarietyCandidates(augmented, 'Cat129');
  assert.equal(aliasMatches[0]?.knowledgeId, 'WCR-HP-CATIMOR-129');
  assert.equal(aliasMatches[0]?.canonicalNameEn, 'Catimor 129');
  assert.equal(aliasMatches[0]?.matchedNameType, 'source_alias');
  assert.equal(aliasMatches[0]?.productionCoreApproved, false);
});

test('existing v6 variety ownership remains higher priority than knowledge-only candidates', () => {
  const augmented = applyCoffeeKnowledge(baseBook(), knowledge());
  const parsed = parseNaturalLanguage('豆种：Geisha', augmented);
  assert.equal(parsed.varietyCode, 'VA-GE');
  assert.equal(parsed.varietyCustomName, undefined);
});

test('canonical knowledge identity is available without rewriting decoded core codes', () => {
  const augmented = applyCoffeeKnowledge(baseBook(), knowledge());
  assert.equal(canonicalRegionId(augmented, 'RG-EA-YIR'), 'GEO-EA-YIR');
  assert.equal(canonicalEntityId(augmented, 'ST-EA-WORKA'), 'ENT-EA-WORKA');
  assert.equal(canonicalEntityId(augmented, 'ST-UNKNOWN'), 'ST-UNKNOWN');
});
