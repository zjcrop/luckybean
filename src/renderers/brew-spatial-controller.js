import { brewSpatialView } from './brew-spatial-view.js';

const REQUIRED_TARGET_IDS = Object.freeze(['acidity', 'floral', 'fruity', 'sweetness', 'bitterness', 'astringency']);
const SUPPORTED_SPATIAL_CONTRACTS = new Set(['brew-spatial/1.1', 'brew-spatial/1.2']);

function isProfessionalScene(scene) {
  if (!scene || !SUPPORTED_SPATIAL_CONTRACTS.has(scene.schemaVersion) || !Array.isArray(scene.path) || scene.path.length < 2) return false;
  if (!Array.isArray(scene.targets)) return false;
  const byId = new Map(scene.targets.map(target => [String(target?.id || ''), target]));
  return REQUIRED_TARGET_IDS.every(id => {
    const target = byId.get(id);
    return target && Array.isArray(target.points) && target.points.length >= 12;
  });
}

function sceneFromPlan(plan) {
  if (!plan || plan.executionSource === 'local-reference') return null;
  const candidates = [
    plan.visualization3d,
    SUPPORTED_SPATIAL_CONTRACTS.has(plan.trajectory?.schemaVersion) ? plan.trajectory : null,
    plan.analysisSnapshot?.trajectory
  ];
  return candidates.find(isProfessionalScene) || null;
}

function host() { return document.querySelector('#brewSpatialMount'); }

async function mount(plan) {
  const target = host();
  if (!target) return false;
  target.replaceChildren();
  const scene = sceneFromPlan(plan);
  if (!scene) {
    target.hidden = false;
    const note = document.createElement('p');
    note.className = 'muted small spatial-unavailable';
    note.textContent = plan?.executionSource === 'local-reference'
      ? '当前为本地参考方案，不包含可验证的专业靶区；未用参考轨迹替代专业三维图。'
      : '当前没有可验证的专业靶区数据；六类靶向物质区域不完整时不会显示三维图。';
    target.append(note);
    brewSpatialView.close();
    return false;
  }
  target.hidden = false;
  await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  return Boolean(brewSpatialView.mountPreview(target, scene));
}

function clear() {
  const target = host();
  if (!target) return;
  target.replaceChildren();
  target.hidden = true;
  brewSpatialView.close();
}

document.addEventListener('luckybean:plan-ready', event => mount(event.detail?.plan));
document.addEventListener('luckybean:history-plan-loaded', event => mount(event.detail?.plan));
document.addEventListener('luckybean:spatial-clear', clear);
document.addEventListener('luckybean:open-spatial-scene', event => {
  if (isProfessionalScene(event.detail?.scene) && brewSpatialView.setScene(event.detail.scene)) brewSpatialView.open();
});

globalThis.LuckyBeanSpatial = {
  revision: 'brew-spatial-view/1.3.0',
  mount,
  clear,
  open(scene) { if (isProfessionalScene(scene) && brewSpatialView.setScene(scene)) brewSpatialView.open(); },
  close() { brewSpatialView.close(); },
  validate: isProfessionalScene
};
