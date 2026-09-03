import assert from 'node:assert/strict';
import fs from 'node:fs';

const js = fs.readFileSync('src/ui/brew-pour-guide.js','utf8');
const css = fs.readFileSync('src/ui/brew-pour-guide.css','utf8');
const runtime = fs.readFileSync('src/features/runtime-features.js','utf8');

assert.match(runtime, /feature\('brew-pour-guide', '\.\.\/ui\/brew-pour-guide\.js'\)/);
assert.match(js, /patternForStage/);
assert.match(js, /螺旋|spiral/);
assert.match(js, /绕圈|circle/);
assert.match(js, /中心|center/);
assert.match(js, /浸泡|immersion/);
assert.match(js, /开阀|release/);
assert.match(js, /flowGPerSec/);
assert.match(js, /stageWaterG/);
assert.match(js, /cumulativeWaterG/);
assert.match(js, /轨迹仅用于执行节奏提示/);
assert.match(js, /luckybean:brew-preparation/);
assert.match(js, /MutationObserver/);
assert.match(js, /brew-pour-guide\.css/);
assert.match(css, /--lb-pour-period/);
assert.match(css, /prefers-reduced-motion/);
assert.match(css, /currentColor/);
assert.doesNotMatch(css, /#[0-9a-fA-F]{3,8}/, 'pour guide must inherit the active theme instead of hard-coding colors');

console.log('1.24P dynamic pour guidance contract passed');
