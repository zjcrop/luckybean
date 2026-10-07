import test from 'node:test';
import assert from 'node:assert/strict';
import { branchDisposition } from '../scripts/branch-cleanup-policy.mjs';

const repository = 'zjcrop/luckybean';
const sha = 'a'.repeat(40);
const merge = 'b'.repeat(40);
const branch = 'fix/bean-test';
const pr = { number:1, state:'closed', head:{ref:branch, sha, repo:{full_name:repository}}, base:{ref:'main'}, merged_at:'2026-10-07', merge_commit_sha:merge };
const decide = overrides => branchDisposition({ branch, sha, repository, pulls:[pr], isAncestor:value => value === merge, ...overrides });

test('squash merge is disposable only when exact head and merge commit are verified', () => {
  assert.equal(decide({}).remove, true);
  assert.equal(decide({sha:'c'.repeat(40)}).remove, false);
  assert.equal(decide({isAncestor:() => false}).remove, false);
});
test('open PRs and other projects remain protected even with ancestry', () => {
  assert.equal(decide({pulls:[{...pr,state:'open'}],isAncestor:() => true}).remove, false);
  for (const protectedBranch of ['main','release-status','pages-status','ci-status','build/aromasense-apk','compat/aromasense-native','release/aromasense-signer']) {
    assert.equal(decide({branch:protectedBranch,isAncestor:() => true}).remove, false);
  }
});
test('superseded unmerged work needs exact manifest, a closed PR and an archive', () => {
  const closed = {...pr,merged_at:null,merge_commit_sha:null};
  const superseded = [{branch,sha,pr:1,reason:'covered by replacement'}];
  const result = decide({pulls:[closed],superseded,isAncestor:() => false});
  assert.equal(result.remove, true);
  assert.equal(result.archive, true);
  assert.equal(decide({pulls:[closed],superseded,sha:'c'.repeat(40),isAncestor:() => false}).remove, false);
  assert.equal(decide({pulls:[],superseded,isAncestor:() => false}).remove, false);
});
