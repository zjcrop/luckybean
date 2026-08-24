import fs from 'node:fs';
import path from 'node:path';

const root=process.cwd();
const currentFiles=[
  'index.html','sw.js','src/core/startup-controller.js','src/ui/appearance-controller.js','src/features/runtime-features.js','src/app.js',
  '.github/workflows/build-main.yml','.github/workflows/deploy-main.yml','.github/workflows/full-integration-pr.yml','DEVELOPMENT_STATUS.md'
];
for(const name of fs.readdirSync('tests').filter(name=>name.endsWith('.mjs'))) currentFiles.push(`tests/${name}`);

for(const file of currentFiles){
  const full=path.join(root,file);if(!fs.existsSync(full))continue;
  let text=fs.readFileSync(full,'utf8');
  text=text.replaceAll('1.24B-main.2','1.24B-main.3');
  text=text.replaceAll('${CACHE_PREFIX}main-2','${CACHE_PREFIX}main-3');
  fs.writeFileSync(full,text);
}

// Signed release must verify every final runtime module, not merely the early 1.24B subset.
const buildPath='.github/workflows/build-main.yml';
let build=fs.readFileSync(buildPath,'utf8');
build=build.replaceAll('RELEASE_TAG: v1.24B-main.2','RELEASE_TAG: v1.24B-main.3');
if(!build.includes('assets/web-cache/src/features/release-1.24b-freshness-detail.js')){
  build=build.replace(
    '            assets/web-cache/src/features/release-1.24b-polish.js \\\n',
    '            assets/web-cache/src/features/release-1.24b-polish.js \\\n            assets/web-cache/src/features/release-1.24b-freshness-detail.js \\\n            assets/web-cache/src/features/recognition-batch-progress-controller.js \\\n            assets/web-cache/src/domain/recognition/recognition-field-resolver-1.24b.js \\\n'
  );
}
build=build.replaceAll('1.24B main.2 signed release.','1.24B main.3 signed release.');
fs.writeFileSync(buildPath,build);

console.log('Current release identities migrated to 1.24B-main.3');
