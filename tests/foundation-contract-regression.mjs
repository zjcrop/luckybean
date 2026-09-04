import fs from 'node:fs';
import assert from 'node:assert/strict';

const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
const consumer = readJson('contracts/foundation-consumer.json');
const recognition = readJson(consumer.localSnapshots.recognitionDocument);
const runtime = fs.readFileSync('src/domain/recognition/recognition-document.js', 'utf8');

assert.equal(consumer._format, 'coffee-foundation-consumer');
assert.equal(consumer.consumer, 'luckybean');
assert.equal(consumer.foundation.provider, 'brewion');
assert.equal(consumer.foundation.contract, 'coffee-foundation/1.0');
assert.equal(consumer.contracts.recognitionDocument, 'recognition-document/1.1');
assert.equal(consumer.contracts.canonicalCoffeeRecord, 'coffee-canonical-record/1.0');
assert.equal(consumer.contracts.aiEnrichmentResult, 'ai-enrichment-result/1.0');
assert.equal(consumer.contracts.codebookProvider, 'coffee-codebook/1.0');
assert.equal(consumer.contracts.coffeeKnowledge, 'coffee-knowledge/1.0');
assert.equal(consumer.policies.applicationDependencyAsFoundation, false);
assert.equal(consumer.policies.lowConfidence, 'review-only');
assert.equal(consumer.policies.aiAuthority, 'advisory-only');
assert.equal(consumer.policies.unknownValues, 'preserve-null');

assert.equal(recognition.$id, 'urn:brewion:foundation:recognition-document:1.1');
assert.equal(recognition.properties.schemaVersion.const, consumer.contracts.recognitionDocument);
assert.match(runtime, /RECOGNITION_DOCUMENT_SCHEMA\s*=\s*['"]recognition-document\/1\.1['"]/);

const deprecated = readJson('contracts/recognition-document-v1.schema.json');
assert.equal(deprecated.properties.schemaVersion.const, 'recognition-document/1.0');
assert.notEqual(consumer.localSnapshots.recognitionDocument, 'contracts/recognition-document-v1.schema.json');

console.log('Coffee Foundation local contract regression passed');
