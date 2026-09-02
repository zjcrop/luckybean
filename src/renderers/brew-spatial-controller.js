import { brewSpatialView } from './brew-spatial-view.js';
import { all } from '../db.js';
import { applyPersonalSensitivityToScene, buildPersonalSensitivityProfile } from '../domain/sensory/brew-optimization-assessment.js';

const REQUIRED_TARGET_IDS = Object.freeze(['acidity', 'floral', 'fruity', 'sweetness', 'bitterness', 'astringency']);
const SUPPORTED_SPATIAL_CONTRACTS = new Set(['brew-spatial/1.1', 'brew-spatial/1.2', 'brew-spatial/1.3']);
const VIEW_NATIVE_SPATIAL_CONTRACT = 'brew-spatial/1.2';

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
  const resultSpatial = plan.contracts?.brewResult?.physical?.spatial || plan.analysisSnapshot?.brewResult?.physical?.spatial;
  const candidates = [
    resultSpatial,
    plan.visualization3d,
    SUPPORTED_SPATIAL_CONTRACTS.has(plan.trajectory?.schemaVersion) ? plan.trajectory : null,
    plan.analysisSnapshot?.trajectory
  ];
  return candidates.find(isProfessionalScene) || null;
}

function adaptForView(scene) {
  if (!scene || scene.schemaVersion !== 'brew-spatial/1.3') return scene;
  // Spatial 1.3 keeps the same t/T/W path and target point geometry used by the renderer.
  // Flavor State is carried through untouched; only the renderer's version gate is adapted.
  return {
    ...scene,
    sourceSchemaVersion: scene.schemaVersion,
    schemaVersion: VIEW_NATIVE_SPATIAL_CONTRACT
  };
}

function host() { return document.querySelector('#brewSpatialMount'); }

let lastRender = null;
let sensitivityProfilePromise = null;

function renderError(target, error) {
  target.hidden = false;
  target.replaceChildren();
  const panel = document.createElement('section');
  panel.className = 'spatial-render-error';
  const title = document.createElement('strong'); title.textContent = '3D预测图渲染失败';
  const message = document.createElement('p'); message.textContent = '计算结果已保留，请使用同一空间输入重新渲染。';
  const detail = document.createElement('small'); detail.textContent = String(error?.message || '未知渲染错误');
  const retry = document.createElement('button'); retry.type = 'button'; retry.className = 'button primary'; retry.textContent = '重新渲染';
  retry.addEventListener('click', () => retryLastRender());
  panel.append(title, message, detail, retry); target.append(panel);
}

async function personalizedScene(scene) {
  if (!sensitivityProfilePromise) {
    sensitivityProfilePromise=all('sensoryRecords')
      .then(records=>buildPersonalSensitivityProfile(records.slice(-500)))
      .catch(()=>buildPersonalSensitivityProfile([]));
  }
  return applyPersonalSensitivityToScene(scene,await sensitivityProfilePromise);
}

async function renderScene(target, scene, plan) {
  target.hidden = false;
  target.replaceChildren();
  await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  const mounted = brewSpatialView.mountPreview(target, adaptForView(scene));
  if (!mounted) throw new Error('3D预览组件未能挂载');
  lastRender = { target, scene:structuredClone(scene), planFingerprint:String(scene.planFingerprint || plan?.contracts?.brewResult?.metadata?.analysisFingerprint || plan?.analysisFingerprint || '') };
  return true;
}

async function retryLastRender() {
  if (!lastRender?.target || !lastRender?.scene) return false;
  try { return await renderScene(lastRender.target, structuredClone(lastRender.scene), null); }
  catch (error) { renderError(lastRender.target,error); return false; }
}

async function mount(plan) {
  const target = host();
  if (!target) return false;
  target.replaceChildren();
  const baseScene = sceneFromPlan(plan);
  const scene = baseScene ? await personalizedScene(baseScene) : null;
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
  try { return await renderScene(target,scene,plan); }
  catch (error) { lastRender = { target, scene:structuredClone(scene), planFingerprint:String(scene.planFingerprint || plan?.contracts?.brewResult?.metadata?.analysisFingerprint || plan?.analysisFingerprint || '') }; renderError(target,error); return false; }
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
document.addEventListener('luckybean:data-changed',event=>{
  if(event.detail?.store==='sensoryRecords'||/sensory|optimization/.test(String(event.detail?.operation||'')))sensitivityProfilePromise=null;
});
document.addEventListener('luckybean:spatial-render-error', event => {
  const target = host(); if (!target) return;
  if (event.detail?.scene) lastRender = { target, scene:structuredClone(event.detail.scene), planFingerprint:String(event.detail.scene.planFingerprint || '') };
  renderError(target,event.detail?.error || new Error('3D渲染失败'));
});
document.addEventListener('luckybean:open-spatial-scene', event => {
  const scene = event.detail?.scene;
  if (isProfessionalScene(scene) && brewSpatialView.setScene(adaptForView(scene))) brewSpatialView.open();
});

globalThis.LuckyBeanSpatial = {
  revision: 'brew-spatial-view/1.5.0-brew-result',
  mount,
  retry: retryLastRender,
  clear,
  open(scene) { if (isProfessionalScene(scene) && brewSpatialView.setScene(adaptForView(scene))) brewSpatialView.open(); },
  close() { brewSpatialView.close(); },
  validate: isProfessionalScene,
  getLastRenderFingerprint() { return lastRender?.planFingerprint || ''; }
};
