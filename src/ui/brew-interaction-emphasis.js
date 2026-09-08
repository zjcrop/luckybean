const stylesheetUrl = new URL('./brew-interaction-emphasis.css', import.meta.url).href;
if (!document.querySelector('link[data-brew-interaction-emphasis]')) {
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = stylesheetUrl;
  link.dataset.brewInteractionEmphasis = '1';
  document.head.append(link);
}

let normalizeQueued = false;

function normalizeBrewInteractionUi() {
  const tune = document.querySelector('#openBrewTuneBtn');
  if (tune && tune.textContent.trim() !== '方案微调') tune.textContent = '方案微调';

  const generated = document.querySelector('#generatedPlan');
  if (!generated) return;

  // Keep the legacy action node and its plan metadata intact for compatibility, but
  // the dedicated stylesheet removes it from the visible/touchable UI as requested.
  const redundantSensory = generated.querySelector('#planToSensoryBtn');
  if (redundantSensory) {
    redundantSensory.setAttribute('aria-hidden', 'true');
    redundantSensory.tabIndex = -1;
  }

  const panelTitle = generated.querySelector(':scope > .panel-title');
  const titleBox = panelTitle?.querySelector(':scope > div');
  const heading = titleBox?.querySelector('h2');
  if (heading) {
    heading.textContent = String(heading.textContent || '').replace(/^(热冲|冰冲)方案/, '冲煮方案');
  }

  const profile = panelTitle?.querySelector(':scope > .plan-profile-label')
    || titleBox?.querySelector('.plan-profile-label');
  let titleLine = titleBox?.querySelector(':scope > .lb-brew-plan-title-line');
  if (titleBox && heading && !titleLine) {
    titleLine = document.createElement('div');
    titleLine.className = 'lb-brew-plan-title-line';
    titleBox.insertBefore(titleLine, heading);
    titleLine.append(heading);
  }
  if (titleLine && profile && profile.parentElement !== titleLine) titleLine.append(profile);

  generated.dataset.lbInteractionEmphasis = '1';
}

function scheduleNormalize() {
  if (normalizeQueued) return;
  normalizeQueued = true;
  requestAnimationFrame(() => {
    normalizeQueued = false;
    normalizeBrewInteractionUi();
  });
}

const brewRoot = document.querySelector('#brewContent');
if (brewRoot) {
  new MutationObserver(scheduleNormalize).observe(brewRoot, { childList:true, subtree:true });
}

for (const eventName of ['luckybean:brew-rendered','luckybean:plan-ready','luckybean:app-refreshed','luckybean:local-app-ready']) {
  document.addEventListener(eventName, scheduleNormalize);
}
document.addEventListener('click', event => {
  if (event.target.closest?.('[data-page-target="brew"]')) scheduleNormalize();
}, true);

scheduleNormalize();
