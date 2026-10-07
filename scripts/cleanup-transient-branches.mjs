import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { branchDisposition } from './branch-cleanup-policy.mjs';

const apply = process.argv.includes('--apply');
const repository = process.env.GITHUB_REPOSITORY;
if (!repository || !/^[-\w.]+\/[-\w.]+$/.test(repository)) throw new Error('GITHUB_REPOSITORY required');
function run(command, args, { allowFailure = false } = {}) {
  const result = spawnSync(command, args, { encoding:'utf8', timeout:90000, maxBuffer:16*1024*1024 });
  if (result.error) throw result.error;
  if (result.status !== 0 && !allowFailure) throw new Error(`${command} failed: ${result.stderr}`);
  return result;
}
run('git', ['fetch', '--prune', '--no-tags', 'origin', '+refs/heads/*:refs/remotes/origin/*']);
const main = run('git', ['rev-parse', 'refs/remotes/origin/main']).stdout.trim();
if (apply && main !== process.env.RELEASE_SOURCE_SHA) throw new Error('Main advanced since signed release; cleanup stopped');
const pages = JSON.parse(run('gh', ['api', '--paginate', '--slurp', `repos/${repository}/pulls?state=all&per_page=100`]).stdout);
const pulls = pages.flat();
const superseded = JSON.parse(fs.readFileSync('docs/closeout-superseded-branches.json', 'utf8'));
const ancestors = new Map();
function isAncestor(sha) {
  if (!/^[a-f0-9]{40}$/.test(sha || '')) return false;
  if (!ancestors.has(sha)) {
    const result = run('git', ['merge-base', '--is-ancestor', sha, main], { allowFailure:true });
    // Missing objects or git errors cannot authorize deletion.
    ancestors.set(sha, result.status === 0);
  }
  return ancestors.get(sha);
}
const rows = run('git', ['for-each-ref', '--format=%(refname:strip=3) %(objectname)', 'refs/remotes/origin']).stdout.trim().split('\n');
const summary = ['| Branch | Action | Evidence |', '|---|---|---|'];
for (const row of rows) {
  const [branch, sha] = row.split(' ');
  const decision = branchDisposition({ branch, sha, repository, pulls, superseded, isAncestor });
  console.log(`${decision.remove ? 'DELETE' : 'KEEP'} ${branch}: ${decision.reason}`);
  if (apply && decision.remove) {
    if (decision.archive) {
      const tag = `archive/closeout-20261007/${branch}`;
      // Push without force: preserve an existing archive if its content differs.
      run('git', ['push', 'origin', `${sha}:refs/tags/${tag}`]);
    }
    run('git', ['push', `--force-with-lease=refs/heads/${branch}:${sha}`, 'origin', `:refs/heads/${branch}`]);
    const remaining = run('git', ['ls-remote', '--heads', 'origin', `refs/heads/${branch}`]).stdout.trim();
    if (remaining) throw new Error(`Branch still exists after cleanup: ${branch}`);
  }
  summary.push(`| ${branch} | ${apply && decision.remove ? 'Deleted' : decision.remove ? 'Candidate' : 'Kept'} | ${decision.reason} |`);
}
if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${summary.join('\n')}\n`);
