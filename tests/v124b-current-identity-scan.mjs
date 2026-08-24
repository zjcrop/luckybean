import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const roots=['index.html','sw.js','src','tests','android','.github/workflows/build-main.yml','.github/workflows/deploy-main.yml','.github/workflows/full-integration-pr.yml'];
const allowed=new Set([
  // Legacy cache prefixes in sw.js are intentionally retained so an upgrade can delete old caches.
]);
function filesAt(entry){
  if(!fs.existsSync(entry))return[];
  const stat=fs.statSync(entry);if(stat.isFile())return[entry];
  return fs.readdirSync(entry,{withFileTypes:true}).flatMap(item=>filesAt(path.join(entry,item.name)));
}
const stale=[];
for(const file of roots.flatMap(filesAt)){
  if(!/\.(?:js|mjs|java|gradle|yml|yaml|html|css|json|webmanifest)$/.test(file)&&file!=='sw.js')continue;
  if(file.includes('scripts/release-main3')||file.includes('scripts/finalize-1.24b'))continue;
  const text=fs.readFileSync(file,'utf8');
  if(text.includes('1.24B-main.2')||text.includes('${CACHE_PREFIX}main-2'))stale.push(file);
}
assert.deepEqual(stale,[],`stale current release identities remain: ${stale.join(', ')}`);
const index=fs.readFileSync('index.html','utf8');
const sw=fs.readFileSync('sw.js','utf8');
assert.match(index,/release-revision" content="1\.24B-main\.3"/);
assert.match(sw,/REVISION = '1\.24B-main\.3'/);
assert.match(sw,/CACHE_NAME = `\$\{CACHE_PREFIX\}main-3`/);
console.log('LuckyBean 1.24B current identity scan passed: main.3 is the sole active release revision');
