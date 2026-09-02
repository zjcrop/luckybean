import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { applyCoffeeKnowledge, automaticEntityResolutionDecision } from '../src/services/coffee-knowledge-adapter.js';
import { analyzeRecognitionDocument } from '../src/domain/recognition/recognition-pipeline.js';

const baseBook = JSON.parse(readFileSync(new URL('../public/fallback-codebook.json', import.meta.url), 'utf8'));
const blockedCode = 'ST-CO-MIR@深度研究';

function knowledgeWithResolutionIssue() {
  return {
    _format: 'coffee-knowledge-bundle',
    contract: 'coffee-knowledge/1.0',
    version: '1.0.0-alpha.7-test',
    compatibility: { qrIndexesChanged: false },
    localizedNames: [],
    localizedAliases: [],
    supplementalModels: {
      'catalog/entity_resolution_issues_v1.json': {
        _format: 'coffee-entity-resolution-issues',
        issues: [{
          id: 'ERI-ST-CO-MIR',
          coreCode: blockedCode,
          issueClass: 'same_name_identity_ambiguous',
          resolutionStatus: 'blocked_pending_disambiguation',
          blockAutomaticEntityResolution: true,
          automaticRecognitionPolicy: 'require_context',
          requiredContext: ['producer', 'region_or_municipality']
        }]
      }
    }
  };
}

function document(fullText) {
  return {
    schemaVersion: 'test',
    parserVersion: 'test',
    engine: 'test',
    fullText,
    rawFullText: fullText,
    images: [],
    blocks: [],
    relations: []
  };
}

test('Knowledge resolution issue is exposed as an automatic-resolution decision', () => {
  const book = applyCoffeeKnowledge(baseBook, knowledgeWithResolutionIssue());
  const blocked = automaticEntityResolutionDecision(book, blockedCode);
  assert.equal(blocked.blocked, true);
  assert.equal(blocked.issueClass, 'same_name_identity_ambiguous');
  assert.deepEqual(blocked.requiredContext, ['producer', 'region_or_municipality']);
  const explicit = automaticEntityResolutionDecision(book, blockedCode, { explicitCoreCode: true });
  assert.equal(explicit.blocked, false);
  assert.equal(explicit.manualConfirmationRequired, false);
});

test('name-only OCR cannot silently resolve a researched ambiguous farm', () => {
  const book = applyCoffeeKnowledge(baseBook, knowledgeWithResolutionIssue());
  const analysis = analyzeRecognitionDocument(document('庄园：Finca El Mirador'), book);
  const farm = analysis.fields.find(item => item.field === 'entityCode');
  assert.equal(analysis.parsed.entityCode, undefined);
  assert.equal(analysis.parsed.entityCustomName, 'Finca El Mirador');
  assert.equal(analysis.parsed.parseMetadata.entityResolution?.blocked, true);
  assert.equal(analysis.parsed.parseMetadata.entityResolution?.candidateCoreCode, blockedCode);
  assert.equal(analysis.parsed.parseMetadata.entityResolution?.manualConfirmationRequired, true);
  assert.equal(farm?.status, 'review');
  assert.equal(farm?.resolved, false);
});

test('explicit stable core code remains usable for historical/explicit-code compatibility', () => {
  const book = applyCoffeeKnowledge(baseBook, knowledgeWithResolutionIssue());
  const analysis = analyzeRecognitionDocument(document(`庄园：${blockedCode}`), book);
  assert.equal(analysis.parsed.entityCode, blockedCode);
  assert.equal(analysis.parsed.parseMetadata.entityResolution?.blocked, false);
  assert.equal(analysis.parsed.parseMetadata.entityResolution?.explicitCoreCode, true);
  assert.equal(analysis.parsed.parseMetadata.entityResolution?.historicalCoreCompatibility, true);
});
