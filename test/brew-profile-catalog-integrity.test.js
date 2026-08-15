import test from 'node:test';
import assert from 'node:assert/strict';
import { validateCatalog } from '../src/services/brew-profile-catalog-service.js';

function profile(overrides = {}) {
  return {
    id: overrides.id || 'profile-a',
    version: '1.0.0',
    label: overrides.label || overrides.id || 'Profile A',
    status: 'verified',
    category: 'pourover',
    tags: [],
    compatibleDripperGroups: ['cone'],
    autoRecommend: overrides.autoRecommend ?? true,
    serveMode: overrides.serveMode || 'hot',
    referenceDoseG: overrides.referenceDoseG ?? 15,
    referenceBrewWaterG: overrides.referenceBrewWaterG ?? 225,
    referenceIceG: overrides.referenceIceG ?? 0,
    referenceBypassWaterG: overrides.referenceBypassWaterG ?? 0,
    referenceTotalWaterG: overrides.referenceTotalWaterG ?? 225
  };
}

function catalog(profiles, extra = {}) {
  return {
    contract: 'brew-profile-catalog/1.0',
    catalogHash: 'sha256:test',
    profileCount: profiles.length,
    apiVersion: 'test',
    engineVersion: 'test',
    profiles,
    ...extra
  };
}

test('accepts a catalog with balanced hot and cold auto-recommend profiles', () => {
  const profiles = [
    profile({ id: 'hot-a' }),
    profile({ id: 'cold-a', serveMode: 'cold', referenceBrewWaterG: 150, referenceIceG: 100, referenceTotalWaterG: 250 })
  ];
  const result = validateCatalog(catalog(profiles), { requireCompetition: false });
  assert.ok(result);
  assert.equal(result.profileCount, 2);
});

test('rejects a catalog whose declared profile count differs from the payload', () => {
  const profiles = [profile({ id: 'hot-a' }), profile({ id: 'cold-a', serveMode: 'cold', referenceBrewWaterG: 150, referenceIceG: 100, referenceTotalWaterG: 250 })];
  assert.equal(validateCatalog(catalog(profiles, { profileCount: 99 }), { requireCompetition: false }), null);
});

test('rejects a cold profile whose recipe water does not equal brew water + ice + bypass', () => {
  const profiles = [
    profile({ id: 'hot-a' }),
    profile({ id: 'cold-a', serveMode: 'cold', referenceBrewWaterG: 150, referenceIceG: 100, referenceTotalWaterG: 150 })
  ];
  assert.equal(validateCatalog(catalog(profiles), { requireCompetition: false }), null);
});

test('rejects catalogs that cannot auto-recommend in both hot and cold modes', () => {
  const profiles = [
    profile({ id: 'hot-a' }),
    profile({ id: 'cold-a', serveMode: 'cold', autoRecommend: false, referenceBrewWaterG: 150, referenceIceG: 100, referenceTotalWaterG: 250 })
  ];
  assert.equal(validateCatalog(catalog(profiles), { requireCompetition: false }), null);
});
