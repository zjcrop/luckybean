import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { fetchResource } from './fetch-with-retry.mjs';

export function selectSuccessfulMainRun(runs,sourceSha) {
  const latest=runs.filter(run=>run.head_sha===sourceSha && run.head_branch==='main'
    && ['push','workflow_dispatch'].includes(run.event)
    && !['cancelled','skipped'].includes(run.conclusion))
    .sort((a,b)=>Number(b.id)-Number(a.id))[0];
  return latest?.status==='completed' && latest?.conclusion==='success' ? latest : null;
}
export function verifyPagesReceipt(receipt,sourceSha,revision) {
  assert.equal(receipt.source_sha,sourceSha,'Pages source SHA differs');
  assert.equal(receipt.revision,revision,'Pages revision differs');
  for(const flag of ['verified','browser_smoke','same_sha_main_tests']) assert.equal(receipt[flag],true,`Pages ${flag} is not verified`);
}
async function main() {
  const {GITHUB_REPOSITORY:repository,SOURCE_SHA:sourceSha,GH_TOKEN:token,GITHUB_ENV:envFile}=process.env;
  assert.match(repository || '',/^[-\w.]+\/[-\w.]+$/,'Repository required');
  assert.match(sourceSha || '',/^[a-f0-9]{40}$/,'Exact source SHA required');
  assert.ok(token && envFile,'GitHub credentials and environment file required');
  const get=route=>fetchResource(`https://api.github.com/repos/${repository}/${route}`,{
    headers:{accept:'application/vnd.github+json',authorization:`Bearer ${token}`,'x-github-api-version':'2022-11-28'}
  });
  const current=await get('commits/main');
  assert.equal(current.sha,sourceSha,'Main advanced; rerun gates for its new SHA');
  const runs=await get(`actions/workflows/test-main.yml/runs?branch=main&head_sha=${sourceSha}&per_page=100`);
  const run=selectSuccessfulMainRun(runs.workflow_runs || [],sourceSha);
  assert.ok(run,'No successful main-test run for this exact source SHA');
  const artifacts=await get(`actions/runs/${run.id}/artifacts?per_page=100`);
  assert.ok(artifacts.artifacts?.some(a=>a.name===`luckybean-main-validated-${sourceSha}` && !a.expired),'Validated source artifact missing or expired; rerun main tests');
  if (process.argv.includes('--pages')) {
    const release=JSON.parse(fs.readFileSync('release.json','utf8'));
    const result=await get(`contents/status/${release.displayVersion}.json?ref=pages-status`);
    verifyPagesReceipt(JSON.parse(Buffer.from(result.content,'base64').toString('utf8')),sourceSha,release.revision);
  }
  fs.appendFileSync(envFile,`TEST_RUN_ID=${run.id}\n`);
  fs.writeFileSync('/tmp/luckybean-test-run-id.txt',String(run.id));
  console.log(`Verified main source ${sourceSha}, successful test run ${run.id}, unexpired validated artifact${process.argv.includes('--pages')?', matching Pages receipt':''}`);
}
if(process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href===import.meta.url) await main();
