const protectedBranches = new Set(['main', 'HEAD', 'ci-status', 'pages-status', 'release-status']);
const disposableName = /^(?:fix\/|hotfix\/|feature\/|maintenance\/|p0-|stage\d+-)/;

export function branchDisposition({ branch, sha, repository, pulls, superseded = [], isAncestor }) {
  if (protectedBranches.has(branch) || !disposableName.test(branch)) return { remove:false, reason:'protected or outside LuckyBean development scope' };
  const sameBranch = pulls.filter(pr => pr.head?.ref === branch && pr.head?.repo?.full_name === repository);
  if (sameBranch.some(pr => pr.state === 'open')) return { remove:false, reason:'open PR' };
  const merged = sameBranch.find(pr => pr.head.sha === sha && pr.merged_at && pr.base?.ref === 'main' && pr.merge_commit_sha && isAncestor(pr.merge_commit_sha));
  if (merged) return { remove:true, reason:`merged PR #${merged.number}, exact head`, archive:false };
  if (isAncestor(sha)) return { remove:true, reason:'head is in main history', archive:false };
  const replaced = superseded.find(item => item.branch === branch && item.sha === sha && sameBranch.some(pr => pr.number === item.pr && pr.state === 'closed'));
  if (replaced) return { remove:true, reason:`superseded PR #${replaced.pr}: ${replaced.reason}`, archive:true };
  return { remove:false, reason:'unmerged work or branch advanced after merge' };
}
