const SVG_NS = 'http://www.w3.org/2000/svg';

function ensureStyles() {
  if (document.querySelector('link[data-lb-pour-guide-style]')) return;
  const moduleUrl = new URL(import.meta.url);
  const href = new URL('./brew-pour-guide.css', moduleUrl);
  href.search = moduleUrl.search;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = href.href;
  link.dataset.lbPourGuideStyle = 'true';
  document.head.append(link);
}
ensureStyles();

let currentPlan = null;
let renderedKey = '';
let observer = null;

const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const clamp = (value, min, max) => Math.min(max, Math.max(min, Number(value)));

function stageText(stage = {}) {
  return [stage.name, stage.method, stage.methodCode, stage.pourPattern, stage.transitionCondition]
    .filter(Boolean).join(' ').toLowerCase();
}

export function patternForStage(stage = {}) {
  const text = stageText(stage);
  if (/开阀|放流|释放|release|drain/.test(text)) return 'release';
  if (/浸泡|immersion|steep|聪明杯|clever|switch/.test(text)) return 'immersion';
  if (/螺旋|spiral|渐开|由内向外|向外/.test(text)) return 'spiral-out';
  if (/向内|由外向内|收圈/.test(text)) return 'spiral-in';
  if (/绕圈|环注|圆周|圆圈|circle|orbit|中心至中圈|中心小圈/.test(text)) return 'circle';
  if (/中心|定点|center|centre/.test(text)) return 'center';
  if (/脉冲|分段|pulse/.test(text)) return 'pulse';
  return finite(stage.stageWaterG ?? stage.pour, 0) <= 0 ? 'hold' : 'pulse';
}

export function animationPeriod(stage = {}) {
  const flow = clamp(finite(stage.flowGPerSec ?? stage.flow, 4.2), 2.2, 8);
  return clamp(6.3 - flow * 0.58, 1.8, 5.2);
}

function spiralPath(reverse = false) {
  const points = [];
  const count = 72;
  for (let index = 0; index <= count; index += 1) {
    const u = index / count;
    const phase = reverse ? 1 - u : u;
    const radius = 7 + phase * 47;
    const angle = (u * Math.PI * 5.4) - Math.PI / 2;
    points.push([80 + Math.cos(angle) * radius, 80 + Math.sin(angle) * radius]);
  }
  return points.map((point, index) => `${index ? 'L' : 'M'}${point[0].toFixed(2)} ${point[1].toFixed(2)}`).join(' ');
}

function svgElement(name, attributes = {}) {
  const node = document.createElementNS(SVG_NS, name);
  for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, String(value));
  return node;
}

function buildSvg(pattern, period) {
  const svg = svgElement('svg', { viewBox:'0 0 160 160', role:'img', 'aria-label':`注水轨迹：${pattern}` });
  svg.classList.add('brew-pour-guide-svg');
  svg.style.setProperty('--lb-pour-period', `${period.toFixed(2)}s`);
  const bed = svgElement('circle', { cx:80, cy:80, r:59 });
  bed.classList.add('brew-pour-bed');
  svg.append(bed);

  if (pattern === 'center') {
    const dot = svgElement('circle', { cx:80, cy:80, r:9 }); dot.classList.add('brew-pour-center-dot');
    const pulse = svgElement('circle', { cx:80, cy:80, r:19 }); pulse.classList.add('brew-pour-center-pulse');
    svg.append(pulse, dot); return svg;
  }
  if (pattern === 'circle') {
    const ring = svgElement('circle', { cx:80, cy:80, r:37 }); ring.classList.add('brew-pour-path');
    const rotor = svgElement('g'); rotor.classList.add('brew-pour-rotor');
    const dot = svgElement('circle', { cx:80, cy:43, r:7 }); dot.classList.add('brew-pour-dot');
    rotor.append(dot); svg.append(ring, rotor); return svg;
  }
  if (pattern === 'spiral-out' || pattern === 'spiral-in') {
    const d = spiralPath(pattern === 'spiral-in');
    const path = svgElement('path', { d, pathLength:100 }); path.classList.add('brew-pour-path', 'brew-pour-spiral');
    const dot = svgElement('circle', { r:6 }); dot.classList.add('brew-pour-dot');
    const motion = svgElement('animateMotion', { dur:`${period.toFixed(2)}s`, repeatCount:'indefinite', path:d });
    dot.append(motion); svg.append(path, dot); return svg;
  }
  if (pattern === 'immersion') {
    const fill = svgElement('circle', { cx:80, cy:80, r:48 }); fill.classList.add('brew-pour-immersion-fill');
    const wave = svgElement('path', { d:'M34 80 Q49 69 64 80 T94 80 T124 80' }); wave.classList.add('brew-pour-wave');
    svg.append(fill, wave); return svg;
  }
  if (pattern === 'release') {
    const valve = svgElement('path', { d:'M51 60 H109 M58 70 H102 M80 70 V111' }); valve.classList.add('brew-pour-release-valve');
    const drop = svgElement('path', { d:'M80 96 C72 108 67 116 67 124 A13 13 0 0 0 93 124 C93 116 88 108 80 96Z' }); drop.classList.add('brew-pour-release-drop');
    svg.append(valve, drop); return svg;
  }
  const pulse = svgElement('circle', { cx:80, cy:80, r:23 }); pulse.classList.add('brew-pour-pulse');
  const dot = svgElement('circle', { cx:80, cy:80, r:7 }); dot.classList.add('brew-pour-dot');
  svg.append(pulse, dot); return svg;
}

function patternLabel(pattern) {
  return ({ center:'中心定点', circle:'稳定绕圈', 'spiral-out':'螺旋向外', 'spiral-in':'螺旋向内', pulse:'脉冲注水', immersion:'保持浸泡', release:'开阀释放', hold:'等待 / 静置' })[pattern] || '按方案注水';
}

function activeStageIndex() {
  const text = document.querySelector('#timerStageCounter')?.textContent || '';
  const index = Number(String(text).split('/')[0]);
  return Number.isFinite(index) && index > 0 ? index - 1 : 0;
}

export function renderPourGuide() {
  const timer = document.querySelector('[data-overlay="timer"] .timer-full');
  if (!timer || !currentPlan?.stages?.length) return false;
  const index = Math.min(activeStageIndex(), currentPlan.stages.length - 1);
  const stage = currentPlan.stages[index] || {};
  const pattern = patternForStage(stage);
  const period = animationPeriod(stage);
  const stageWater = finite(stage.stageWaterG ?? stage.pour, 0);
  const cumulative = finite(stage.cumulativeWaterG ?? stage.cumulative, 0);
  const flow = finite(stage.flowGPerSec ?? stage.flow, 0);
  const key = `${index}|${pattern}|${stageWater}|${cumulative}|${flow}`;
  const existing = timer.querySelector('[data-lb-pour-guide]');
  if (existing && renderedKey === key) return true;
  existing?.remove();

  const guide = document.createElement('section');
  guide.className = 'brew-pour-guide'; guide.dataset.lbPourGuide = pattern; guide.dataset.stageIndex = String(index + 1);
  const visual = document.createElement('div'); visual.className = 'brew-pour-guide-visual'; visual.append(buildSvg(pattern, period));
  const copy = document.createElement('div'); copy.className = 'brew-pour-guide-copy';
  const title = document.createElement('strong'); title.textContent = patternLabel(pattern);
  const metrics = document.createElement('span'); metrics.textContent = `${stageWater.toFixed(0)}g · 累计 ${cumulative.toFixed(0)}g${flow > 0 ? ` · ${flow.toFixed(1)}g/s` : ''}`;
  const note = document.createElement('small'); note.textContent = '轨迹仅用于执行节奏提示；实际水流与落点以手部操作为准。';
  copy.append(title, metrics, note); guide.append(visual, copy);
  const anchor = timer.querySelector('.timer-stage-grid');
  (anchor || timer.querySelector('#timerStageText') || timer.firstElementChild)?.insertAdjacentElement('afterend', guide);
  renderedKey = key;
  document.dispatchEvent(new CustomEvent('luckybean:pour-guide-rendered', { detail:{ stageIndex:index + 1, pattern, flowGPerSec:flow } }));
  return true;
}

function rememberPlan(plan) {
  if (!plan?.stages?.length) return;
  currentPlan = plan; renderedKey = ''; queueMicrotask(renderPourGuide);
}

document.addEventListener('luckybean:plan-ready', event => rememberPlan(event.detail?.plan));
document.addEventListener('luckybean:history-plan-loaded', event => rememberPlan(event.detail?.plan));
document.addEventListener('luckybean:brew-preparation', event => rememberPlan(event.detail?.plan));

function startObserver() {
  const root = document.querySelector('#overlayRoot');
  if (!root || observer) return;
  observer = new MutationObserver(() => renderPourGuide());
  observer.observe(root, { childList:true, subtree:true, characterData:true });
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', startObserver, { once:true });
else startObserver();

globalThis.LuckyBeanPourGuide = Object.freeze({ revision:'pour-guide/1.0.0', patternForStage, animationPeriod, render:renderPourGuide, setPlan:rememberPlan });
