import { brewSpatialView } from './brew-spatial-view.js';

function sceneFromPlan(plan) {
  return plan?.visualization3d
    || (plan?.trajectory?.schemaVersion === 'brew-spatial/1.1' ? plan.trajectory : null)
    || plan?.analysisSnapshot?.trajectory
    || null;
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
    note.textContent = '当前方案没有可用的三维轨迹数据。';
    target.append(note);
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
  if (brewSpatialView.setScene(event.detail?.scene)) brewSpatialView.open();
});

globalThis.LuckyBeanSpatial = {
  revision: 'brew-spatial-view/1.2.0',
  mount,
  clear,
  open(scene) { if (brewSpatialView.setScene(scene)) brewSpatialView.open(); },
  close() { brewSpatialView.close(); }
};
