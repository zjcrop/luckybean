const VOICE_KEY = 'luckybean.voice.v120';
let voices = [];
let nativeSpeak = null;
let renderQueued = false;

const $ = (selector, root = document) => root?.querySelector?.(selector) || null;
function parse(value, fallback = {}) { try { return { ...fallback, ...JSON.parse(value || '{}') }; } catch { return { ...fallback }; } }
function config() { return parse(localStorage.getItem(VOICE_KEY), { mode:'auto', voiceURI:'', rate:1.05 }); }
function save(next) {
  localStorage.setItem(VOICE_KEY, JSON.stringify({ mode:['female','male'].includes(next.mode) ? next.mode : 'auto', voiceURI:String(next.voiceURI || ''), rate:Math.min(1.3, Math.max(.75, Number(next.rate) || 1.05)) }));
}
const FEMALE = /xiaoxiao|xiaoyi|huihui|yaoyao|tingting|meijia|samantha|victoria|female|女|晓晓|晓伊|慧慧|瑶瑶|婷婷/i;
const MALE = /yunxi|yunyang|kangkang|zhiwei|daniel|alex|male|男|云希|云扬|康康|智威/i;
function chineseVoices() {
  const list = voices.filter(voice => /^zh(?:-|_)/i.test(voice.lang || '') || /chinese|mandarin|中文|普通话/i.test(`${voice.name} ${voice.lang}`));
  return list.length ? list : voices;
}
function selectVoice(current = config()) {
  const candidates = chineseVoices();
  const exact = candidates.find(voice => voice.voiceURI === current.voiceURI || `${voice.name}|${voice.lang}` === current.voiceURI);
  if (exact) return exact;
  if (current.mode === 'female') return candidates.find(voice => FEMALE.test(voice.name)) || candidates.find(voice => voice.default) || candidates[0] || null;
  if (current.mode === 'male') return candidates.find(voice => MALE.test(voice.name)) || candidates.find(voice => voice.default) || candidates[0] || null;
  return candidates.find(voice => voice.default) || candidates[0] || null;
}
function apply(utterance, current = config()) {
  const voice = selectVoice(current);
  if (voice) utterance.voice = voice;
  utterance.rate = Math.min(1.3, Math.max(.75, Number(current.rate) || 1.05));
  if (current.mode === 'female' && !FEMALE.test(voice?.name || '')) utterance.pitch = 1.06;
  if (current.mode === 'male' && !MALE.test(voice?.name || '')) utterance.pitch = .92;
  return utterance;
}
function installSpeechPolicy() {
  if (!('speechSynthesis' in globalThis) || nativeSpeak) return;
  voices = speechSynthesis.getVoices().filter(Boolean);
  nativeSpeak = speechSynthesis.speak.bind(speechSynthesis);
  try { speechSynthesis.speak = utterance => nativeSpeak(apply(utterance)); }
  catch { globalThis.LuckyBeanApplyVoice = apply; }
  speechSynthesis.addEventListener?.('voiceschanged', () => { voices = speechSynthesis.getVoices().filter(Boolean); queueRender(); });
}
function enforceSingleOpen(section) {
  section.addEventListener('toggle', () => {
    if (!section.open) return;
    section.parentElement?.querySelectorAll('.settings-category').forEach(other => { if (other !== section) other.open = false; });
  });
}
function render() {
  renderQueued = false;
  const categories = $('#settingsContent .settings-categories');
  if (!categories) return;
  categories.querySelector('[data-settings-key="voice"]')?.remove();
  const current = config();
  const section = document.createElement('details');
  section.className = 'settings-category'; section.dataset.settingsKey = 'voice'; section.dataset.voiceSettings = '1';
  const available = chineseVoices();
  section.innerHTML = `<summary><span>语音</span><small>声音、语速与试听</small></summary><div class="settings-category-body"><div class="grid-2"><label class="field"><span>声音倾向</span><select class="control" data-voice-mode><option value="auto">自动</option><option value="female">偏女声</option><option value="male">偏男声</option></select></label><label class="field"><span>当前设备声音</span><select class="control" data-voice-select><option value="">按倾向自动选择</option>${available.map(voice => { const key = voice.voiceURI || `${voice.name}|${voice.lang}`; return `<option value="${key.replaceAll('&','&amp;').replaceAll('"','&quot;')}">${voice.name} · ${voice.lang || ''}${voice.localService ? ' · 本地' : ''}</option>`; }).join('')}</select></label></div><label class="field"><span>语速 <output data-voice-rate-output>${Number(current.rate).toFixed(2)}</output></span><input class="control" type="range" min="0.75" max="1.30" step="0.05" value="${Number(current.rate)}" data-voice-rate></label><p class="muted small">声音由当前操作系统和浏览器提供，不影响本地数据与云端同步。</p><div class="row end"><button class="button" type="button" data-voice-preview>试听</button><button class="button primary" type="button" data-voice-save>保存语音</button></div></div>`;
  const data = categories.querySelector('.data-category, [data-settings-key="data"]');
  categories.insertBefore(section, data || categories.lastElementChild);
  enforceSingleOpen(section);
  $('[data-voice-mode]', section).value = current.mode;
  const select = $('[data-voice-select]', section);
  if ([...select.options].some(option => option.value === current.voiceURI)) select.value = current.voiceURI;
  const rate = $('[data-voice-rate]', section);
  rate.addEventListener('input', () => { $('[data-voice-rate-output]', section).textContent = Number(rate.value).toFixed(2); });
  $('[data-voice-preview]', section).addEventListener('click', () => {
    if (!nativeSpeak) return;
    speechSynthesis.cancel();
    const draft = { mode:$('[data-voice-mode]', section).value, voiceURI:select.value, rate:Number(rate.value) };
    const utterance = apply(new SpeechSynthesisUtterance('富贵盒子语音播报试听。下一段，请按计划注水。'), draft);
    utterance.lang = 'zh-CN'; nativeSpeak(utterance);
  });
  $('[data-voice-save]', section).addEventListener('click', () => { save({ mode:$('[data-voice-mode]', section).value, voiceURI:select.value, rate:Number(rate.value) }); section.open = false; });
}
function queueRender() { if (renderQueued) return; renderQueued = true; queueMicrotask(render); }
function bind() {
  installSpeechPolicy();
  document.addEventListener('luckybean:app-refreshed', queueRender);
  document.addEventListener('luckybean:settings-rendered', queueRender);
  document.addEventListener('luckybean:local-app-ready', queueRender);
  queueRender();
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind, { once:true }); else bind();
globalThis.LuckyBeanVoiceSettings = { config, save, apply, render };
