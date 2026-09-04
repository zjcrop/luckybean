import fs from 'node:fs';
import assert from 'node:assert/strict';

const consumer = JSON.parse(fs.readFileSync('contracts/foundation-consumer.json', 'utf8'));
const localRecognition = JSON.parse(fs.readFileSync(consumer.localSnapshots.recognitionDocument, 'utf8'));

async function getJson(url) {
  const response = await fetch(url, { cache: 'no-store', headers: { 'accept': 'application/json' } });
  assert.equal(response.ok, true, `${url} -> HTTP ${response.status}`);
  return response.json();
}

const manifest = await getJson(consumer.foundation.manifestUrl);
assert.equal(manifest.contract, consumer.foundation.contract);
assert.equal(manifest.provider, 'brewion');
assert.equal(manifest.contracts.recognitionDocument.contract, consumer.contracts.recognitionDocument);
assert.equal(manifest.contracts.canonicalCoffeeRecord.contract, consumer.contracts.canonicalCoffeeRecord);
assert.equal(manifest.contracts.aiEnrichmentResult.contract, consumer.contracts.aiEnrichmentResult);
assert.equal(manifest.contracts.codebookProvider.contract, consumer.contracts.codebookProvider);
assert.equal(manifest.contracts.coffeeKnowledge.contract, consumer.contracts.coffeeKnowledge);
assert.equal(manifest.consumerRules.applicationToApplicationDependencyForbidden, true);
assert.equal(manifest.consumerRules.platformAdaptersMustEmitRecognitionDocument, true);
assert.equal(manifest.policies.lowConfidence, 'review-only');
assert.equal(manifest.policies.aiAuthority, 'advisory-only-never-overwrite-fact');
assert.equal(manifest.policies.failure, 'retain-last-known-good');

const foundationBase = new URL('.', consumer.foundation.manifestUrl);
const remoteRecognition = await getJson(new URL(manifest.contracts.recognitionDocument.schema, foundationBase));
assert.deepEqual(localRecognition, remoteRecognition, 'LuckyBean RecognitionDocument snapshot drifted from BrewIon Foundation');

const repoBase = 'https://raw.githubusercontent.com/zjcrop/BrewIon/main/';
const provider = await getJson(new URL('provider/releases/latest.json', repoBase));
assert.equal(provider.contract, consumer.contracts.codebookProvider);
assert.equal(provider.appendOnly, true);
for (const artifact of provider.artifacts || []) {
  assert.match(String(artifact.sha256 || ''), /^[a-f0-9]{64}$/i);
}

const knowledge = await getJson(new URL('coffee-knowledge/releases/latest.json', repoBase));
assert.equal(knowledge.contract, consumer.contracts.coffeeKnowledge);
assert.match(String(knowledge.artifact?.sha256 || ''), /^[a-f0-9]{64}$/i);
assert.equal(knowledge.compatibility?.localizationPolicy, 'ai-candidates-never-overwrite-official-names');

console.log(`Coffee Foundation live contract verified: ${manifest.contract}`);
