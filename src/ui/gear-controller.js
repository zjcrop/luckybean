import { getSetting, setSetting } from '../db.js';
import { DRIPPER_CATALOG, FILTER_PAPER_CATALOG, resolveDripperPhysics, resolveFilterPaperPhysics, legacyMaterialClass } from '../domain/matching/flavor-vector.js';

const $=(s,r=document)=>r?.querySelector?.(s)||null;
const $$=(s,r=document)=>r?.querySelectorAll?[...r.querySelectorAll(s)]:[];
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot',"'":'&#39;'}[c]));
const GROUPS=[['cone','锥形'],['flat','平底'],['hybrid','混合'],['lowBypass','低旁路'],['immersion','浸泡式']];
const TYPES={cone:'锥形滤杯',flat:'平底滤杯',hybrid:'混合式滤杯',lowBypass:'低旁路滤杯',immersion:'浸泡式滤杯'};
const MATERIALS=[['genericPlastic','塑料'],['asResin','AS树脂'],['pctg','PCTG'],['polycarbonate','聚碳酸酯'],['polypropylene','PP'],['tritan','Tritan'],['porcelain','瓷'],['ceramic','陶瓷'],['glass','玻璃'],['borosilicateGlass','硼硅玻璃'],['stainlessSteel','不锈钢'],['titanium','钛']];
const FLOW=[['low','低'],['medium','中'],['high','高'],['controllable','可控']];
const PAPER_FLOW=[['low','低'],['medium','中'],['high','高'],['variable-braking','前快后慢']];
const BYPASS=[['none','无'],['low','少'],['medium','中'],['high','多']];
const OUTLET=[['small','小'],['medium','中'],['large','大'],['open','开放大孔'],['valve','阀门控制']];
const SHAPES=[['cone','锥形'],['flat','平底'],['wave-flat','Wave平底'],['disc-flat','圆片平底'],['trapezoid','梯形']];
let cache=null,cacheAt=0,renderQueued=false;

const uid=p=>`${p}_${crypto.randomUUID?.()||Date.now().toString(36)}`;
const opts=(rows,v)=>rows.map(([id,l])=>`<option value="${esc(id)}"${id===v?' selected':''}>${esc(l)}</option>`).join('');
const catalogOpts=(rows,v)=>`<option value="">请选择</option>${rows.map(x=>`<option value="${esc(x.id)}"${x.id===v?' selected':''}>${esc(x.brand)} · ${esc(x.name)}</option>`).join('')}`;
const confidence=v=>Number(v)>=.78?'高':Number(v)>=.52?'中':'低';
const groupLabel=v=>GROUPS.find(x=>x[0]===v)?.[1]||v;
const materialLabel=v=>MATERIALS.find(x=>x[0]===v)?.[1]||v;
const normalizeBypass=v=>['none','low','medium','high'].includes(String(v))?String(v):'medium';
const normalizePaperSpeed=v=>['low','medium','high','variable-braking'].includes(String(v))?String(v):'medium';

async function settings(fresh=false){
  if(!fresh&&cache&&Date.now()-cacheAt<600)return structuredClone(cache);
  const s=await getSetting('app.settings',{}).catch(()=>({}))||{};
  s.gear||={};s.gear.drippers=Array.isArray(s.gear.drippers)?s.gear.drippers:[];s.gear.filters=Array.isArray(s.gear.filters)?s.gear.filters:[];s.gear.grinders=Array.isArray(s.gear.grinders)?s.gear.grinders:[];
  s.matchingGear||={};s.matchingGear.drippers||={};s.matchingGear.papers||={};s.brew||={};
  cache=structuredClone(s);cacheAt=Date.now();return s;
}
async function persist(s,source){cache=structuredClone(s);cacheAt=Date.now();await setSetting('app.settings',s);close();document.dispatchEvent(new CustomEvent('luckybean:request-app-refresh',{detail:{source}}));}
function close(){$('#overlayRoot')?.replaceChildren();}
function modal(title,subtitle,body,id){
  const root=$('#overlayRoot');if(!root)return null;
  root.innerHTML=`<div class="overlay" data-overlay="${id}"><div class="dialog lb-gear-match-dialog"><div class="dialog-header centered"><div><h2>${esc(title)}</h2><p>${esc(subtitle)}</p></div><button class="close-button" type="button" data-close-overlay>×</button></div>${body}</div></div>`;
  const overlay=root.firstElementChild;$('[data-close-overlay]',overlay)?.addEventListener('click',close);overlay.addEventListener('click',e=>{if(e.target===overlay)close();});return overlay;
}
function status(o,msg){let n=$('[data-gear-status]',o);if(!n){n=document.createElement('p');n.className='status-bad small';n.dataset.gearStatus='1';$('.row.end',o)?.before(n);}n.textContent=msg;}
function dMatch(s,id){return s.matchingGear.drippers[id]||{};}function pMatch(s,id){return s.matchingGear.papers[id]||{};}
function hydrate(raw,m){return {...raw,brand:raw?.brand||m?.brand||'',catalogId:raw?.catalogId||m?.catalogId||null,basedOnCatalogId:raw?.basedOnCatalogId||m?.basedOnCatalogId||null,physics:{...(m?.physics||{}),...(raw?.physics||{})}};}
function dResolved(r,m){return m?.resolvedPhysics?.kind==='dripper'?structuredClone(m.resolvedPhysics):resolveDripperPhysics(r,m);}
function pResolved(r,m){return m?.resolvedPhysics?.kind==='filter-paper'?structuredClone(m.resolvedPhysics):resolveFilterPaperPhysics(r,m);}
function dSummary(x){return `${groupLabel(x.group)} · ${x.angleDeg}° · 排水${x.drainageClass} · 开口${x.outletClass} · 旁通${x.bypassClass} · ${materialLabel(x.materialKey)} · ${x.massG}g · 可信度${confidence(x.confidence)}`;}
function pSummary(x){return `${x.shape} · 流速${x.flowClass} · 旁通${x.bypassTendency} · 可信度${confidence(x.confidence)}`;}

function applyDripperTemplate(o,id){const t=DRIPPER_CATALOG.find(x=>x.id===id);if(!t)return;const x=resolveDripperPhysics({catalogId:id});$('#dBrand',o).value=t.brand;$('#dName',o).value=t.name;$('#dGroup',o).value=x.group;$('#dMaterial',o).value=x.materialKey;$('#dAngle',o).value=x.angleDeg;$('#dFlow',o).value=x.drainageClass;$('#dOutlet',o).value=x.outletClass;$('#dBypass',o).value=x.bypassClass;$('#dMass',o).value=x.provenance?.massG?.source==='manufacturer'?x.massG:'';$('#dPreheat',o).value=String(x.preheated);$('[data-resolved]',o).textContent=`计算快照：${dSummary(x)}`;}
async function openDripperEditor(id=''){
  const s=await settings(true),m=dMatch(s,id),raw=s.gear.drippers.find(x=>String(x.id)===String(id))||{},r=hydrate(raw,m),x=dResolved(r,m),standard=Boolean(r.catalogId&&!r.basedOnCatalogId),template=r.catalogId||r.basedOnCatalogId||'';
  const o=modal(id?'编辑滤杯':'添加滤杯','名称和品牌仅用于识别；计算只读取结构、水力与热学快照。标准库可直接使用，自定义可复制模板后修改。',`<div class="grid-2">
<label class="field"><span>录入方式</span><select id="dMode" class="control"><option value="catalog"${standard||!id?' selected':''}>标准滤杯库</option><option value="custom"${!standard&&id?' selected':''}>自定义/模板修改</option></select></label>
<label class="field"><span>标准/基础模板</span><select id="dCatalog" class="control">${catalogOpts(DRIPPER_CATALOG,template)}</select></label>
<label class="field"><span>品牌</span><input id="dBrand" class="control" value="${esc(r.brand||'')}"></label><label class="field"><span>名称 *</span><input id="dName" class="control" value="${esc(r.name||'')}"></label>
<label class="field"><span>分组</span><select id="dGroup" class="control">${opts(GROUPS,x.group)}</select></label><label class="field"><span>材质</span><select id="dMaterial" class="control">${opts(MATERIALS,x.materialKey)}</select></label>
<label class="field"><span>滤杯角度</span><input id="dAngle" class="control" type="number" min="25" max="95" value="${x.angleDeg}"></label><label class="field"><span>结构排水</span><select id="dFlow" class="control">${opts(FLOW,x.drainageClass)}</select></label>
<label class="field"><span>下开口</span><select id="dOutlet" class="control">${opts(OUTLET,x.outletClass)}</select></label><label class="field"><span>旁通量</span><select id="dBypass" class="control">${opts(BYPASS,x.bypassClass)}</select></label>
<label class="field"><span>质量 g</span><input id="dMass" class="control" type="number" min="10" max="1000" value="${r.physics?.massG??''}" placeholder="未知可留空"></label><label class="field"><span>默认预热</span><select id="dPreheat" class="control"><option value="true"${x.preheated?' selected':''}>是</option><option value="false"${!x.preheated?' selected':''}>否</option></select></label>
<label class="field"><span>价格</span><input id="dPrice" class="control" type="number" min="0" step="0.01" value="${Number(r.price||0)}"></label></div><p class="muted small" data-resolved>计算快照：${esc(dSummary(x))}</p><div class="row end">${id?'<button id="dDelete" class="button danger">删除</button>':''}<button id="dSave" class="button primary">确定</button></div>`,'dripper-editor');if(!o)return;
  const cat=$('#dCatalog',o),mode=$('#dMode',o);cat.addEventListener('change',()=>applyDripperTemplate(o,cat.value));mode.addEventListener('change',()=>{if(mode.value==='catalog'&&cat.value)applyDripperTemplate(o,cat.value);});if(!id&&DRIPPER_CATALOG[0]){cat.value=DRIPPER_CATALOG[0].id;applyDripperTemplate(o,cat.value);}
  $('#dSave',o).addEventListener('click',async()=>{const now=new Date().toISOString(),newId=String(raw.id||uid('dripper')),isCatalog=mode.value==='catalog',catalogId=cat.value,name=$('#dName',o).value.trim();if(!name)return status(o,'滤杯名称为必填项');if(isCatalog&&!catalogId)return status(o,'请选择标准滤杯');let rec;
    if(isCatalog){const t=DRIPPER_CATALOG.find(z=>z.id===catalogId),snap=resolveDripperPhysics({catalogId});rec={...raw,id:newId,brand:t.brand,name:t.name,type:TYPES[snap.group],material:legacyMaterialClass(snap.materialKey),catalogId,basedOnCatalogId:null,physics:{},price:Math.max(0,Number($('#dPrice',o).value)||0),createdAt:raw.createdAt||now,updatedAt:now};}
    else{const group=$('#dGroup',o).value,materialKey=$('#dMaterial',o).value,angle=Number($('#dAngle',o).value),massText=$('#dMass',o).value.trim(),mass=Number(massText);rec={...raw,id:newId,brand:$('#dBrand',o).value.trim(),name,type:TYPES[group],material:legacyMaterialClass(materialKey),catalogId:null,basedOnCatalogId:catalogId||null,physics:{group,materialKey,angleDeg:angle,drainageClass:$('#dFlow',o).value,outletClass:$('#dOutlet',o).value,bypassClass:normalizeBypass($('#dBypass',o).value),...(massText&&Number.isFinite(mass)?{massG:mass}:{}),preheated:$('#dPreheat',o).value==='true'},price:Math.max(0,Number($('#dPrice',o).value)||0),createdAt:raw.createdAt||now,updatedAt:now};}
    const snap=resolveDripperPhysics(rec,{}),i=s.gear.drippers.findIndex(z=>String(z.id)===newId);if(i>=0)s.gear.drippers[i]=rec;else s.gear.drippers.push(rec);s.matchingGear.drippers[newId]={catalogId:rec.catalogId||null,basedOnCatalogId:rec.basedOnCatalogId||null,brand:rec.brand||'',physics:structuredClone(rec.physics||{}),resolvedPhysics:structuredClone(snap),group:snap.group,angleDeg:snap.angleDeg,outletClass:snap.outletClass,outletAreaMm2:snap.outletAreaMm2,drainageClass:snap.drainageClass,bypass:snap.bypassClass,materialKey:snap.materialKey,material:rec.material,massG:snap.massG,preheated:snap.preheated,confidence:snap.confidence,updatedAt:now};if(!s.brew.dripper)s.brew.dripper=newId;if(s.brew.dripper===newId)s.brew.dripperMaterial=rec.material;await persist(s,'dripper-saved');});
  $('#dDelete',o)?.addEventListener('click',async()=>{s.gear.drippers=s.gear.drippers.filter(z=>String(z.id)!==String(id));delete s.matchingGear.drippers[id];if(s.brew.dripper===id)s.brew.dripper=s.gear.drippers[0]?.id||'';await persist(s,'dripper-deleted');});
}

function applyPaperTemplate(o,id){const t=FILTER_PAPER_CATALOG.find(x=>x.id===id);if(!t)return;const x=resolveFilterPaperPhysics({catalogId:id});$('#pBrand',o).value=t.brand;$('#pName',o).value=t.name;$('#pShape',o).value=SHAPES.some(z=>z[0]===x.shape)?x.shape:'cone';$('#pFlow',o).value=x.flowClass;$('#pBypass',o).value=x.bypassTendency;$('[data-resolved]',o).textContent=`计算快照：${pSummary(x)}`;}
async function openFilterEditor(id=''){
  const s=await settings(true),m=pMatch(s,id),raw=s.gear.filters.find(x=>String(x.id)===String(id))||{},r=hydrate(raw,m),x=pResolved(r,m),standard=Boolean(r.catalogId&&!r.basedOnCatalogId),template=r.catalogId||r.basedOnCatalogId||'';
  const o=modal(id?'编辑滤纸':'添加滤纸','名称、品牌和别名仅用于识别；缺失水力数据由参数解析器补齐，不阻断计算。',`<div class="grid-2"><label class="field"><span>录入方式</span><select id="pMode" class="control"><option value="catalog"${standard||!id?' selected':''}>标准滤纸库</option><option value="custom"${!standard&&id?' selected':''}>自定义/模板修改</option></select></label><label class="field"><span>标准/基础模板</span><select id="pCatalog" class="control">${catalogOpts(FILTER_PAPER_CATALOG,template)}</select></label><label class="field"><span>品牌</span><input id="pBrand" class="control" value="${esc(r.brand||'')}"></label><label class="field"><span>名称 *</span><input id="pName" class="control" value="${esc(r.type||'')}"></label><label class="field"><span>形状</span><select id="pShape" class="control">${opts(SHAPES,SHAPES.some(z=>z[0]===x.shape)?x.shape:'cone')}</select></label><label class="field"><span>过滤速度</span><select id="pFlow" class="control">${opts(PAPER_FLOW,x.flowClass)}</select></label><label class="field"><span>旁通倾向</span><select id="pBypass" class="control">${opts(BYPASS,x.bypassTendency)}</select></label><label class="field"><span>张数</span><input id="pQty" class="control" type="number" min="0" value="${Number(r.quantity||0)}"></label><label class="field"><span>价格</span><input id="pPrice" class="control" type="number" min="0" step="0.01" value="${Number(r.price||0)}"></label></div><p class="muted small" data-resolved>计算快照：${esc(pSummary(x))}</p><div class="row end">${id?'<button id="pDelete" class="button danger">删除</button>':''}<button id="pSave" class="button primary">确定</button></div>`,'filter-editor');if(!o)return;
  const cat=$('#pCatalog',o),mode=$('#pMode',o);cat.addEventListener('change',()=>applyPaperTemplate(o,cat.value));mode.addEventListener('change',()=>{if(mode.value==='catalog'&&cat.value)applyPaperTemplate(o,cat.value);});if(!id&&FILTER_PAPER_CATALOG[0]){cat.value=FILTER_PAPER_CATALOG[0].id;applyPaperTemplate(o,cat.value);}
  $('#pSave',o).addEventListener('click',async()=>{const now=new Date().toISOString(),newId=String(raw.id||uid('filter')),isCatalog=mode.value==='catalog',catalogId=cat.value,name=$('#pName',o).value.trim(),qty=Math.floor(Number($('#pQty',o).value));if(!name)return status(o,'滤纸名称为必填项');if(!Number.isFinite(qty)||qty<0)return status(o,'张数必须为0或正整数');if(isCatalog&&!catalogId)return status(o,'请选择标准滤纸');let rec;
    if(isCatalog){const t=FILTER_PAPER_CATALOG.find(z=>z.id===catalogId);rec={...raw,id:newId,brand:t.brand,type:t.name,catalogId,basedOnCatalogId:null,physics:{},quantity:qty,price:Math.max(0,Number($('#pPrice',o).value)||0),createdAt:raw.createdAt||now,updatedAt:now};}
    else rec={...raw,id:newId,brand:$('#pBrand',o).value.trim(),type:name,catalogId:null,basedOnCatalogId:catalogId||null,physics:{shape:$('#pShape',o).value,flowClass:normalizePaperSpeed($('#pFlow',o).value),bypassTendency:normalizeBypass($('#pBypass',o).value)},quantity:qty,price:Math.max(0,Number($('#pPrice',o).value)||0),createdAt:raw.createdAt||now,updatedAt:now};
    const snap=resolveFilterPaperPhysics(rec,{}),i=s.gear.filters.findIndex(z=>String(z.id)===newId);if(i>=0)s.gear.filters[i]=rec;else s.gear.filters.push(rec);s.matchingGear.papers[newId]={catalogId:rec.catalogId||null,basedOnCatalogId:rec.basedOnCatalogId||null,brand:rec.brand||'',physics:structuredClone(rec.physics||{}),resolvedPhysics:structuredClone(snap),speed:snap.flowClass,bypassTendency:snap.bypassTendency,shape:snap.shape,confidence:snap.confidence,updatedAt:now};if(!s.brew.filterPaperId)s.brew.filterPaperId=newId;await persist(s,'filter-saved');});
  $('#pDelete',o)?.addEventListener('click',async()=>{s.gear.filters=s.gear.filters.filter(z=>String(z.id)!==String(id));delete s.matchingGear.papers[id];if(s.brew.filterPaperId===id)s.brew.filterPaperId=s.gear.filters[0]?.id||'';await persist(s,'filter-deleted');});
}

async function decorate(){const s=await settings();for(const b of $$('[data-dripper-item]')){const id=b.dataset.dripperItem,n=$('small',b);if(!n||n.dataset.gearPhysics)return;const m=dMatch(s,id),r=hydrate(s.gear.drippers.find(x=>String(x.id)===String(id))||{},m),x=dResolved(r,m);n.textContent+=` · ${groupLabel(x.group)} ${x.angleDeg}° · 排水${x.drainageClass} · 旁通${x.bypassClass} · 可信度${confidence(x.confidence)}`;n.dataset.gearPhysics='1';}for(const b of $$('[data-filter-item]')){const id=b.dataset.filterItem,n=$('small',b);if(!n||n.dataset.gearPhysics)return;const m=pMatch(s,id),r=hydrate(s.gear.filters.find(x=>String(x.id)===String(id))||{},m),x=pResolved(r,m);n.textContent+=` · 流速${x.flowClass} · 旁通${x.bypassTendency} · 可信度${confidence(x.confidence)}`;n.dataset.gearPhysics='1';}}
function queue(){if(renderQueued)return;renderQueued=true;requestAnimationFrame(()=>{renderQueued=false;decorate().catch(()=>{});});}
document.addEventListener('click',e=>{const da=e.target.closest?.('[data-add-gear="dripper"]'),di=e.target.closest?.('[data-dripper-item]'),pa=e.target.closest?.('[data-add-gear="filter"]'),pi=e.target.closest?.('[data-filter-item]');if(!da&&!di&&!pa&&!pi)return;e.preventDefault();e.stopImmediatePropagation();if(da)openDripperEditor();else if(di)openDripperEditor(di.dataset.dripperItem);else if(pa)openFilterEditor();else openFilterEditor(pi.dataset.filterItem);},true);
for(const ev of ['luckybean:app-refreshed','luckybean:local-app-ready','luckybean:settings-rendered','luckybean:brew-rendered'])document.addEventListener(ev,()=>{cacheAt=0;queue();});queue();
globalThis.LuckyBeanGear={openDripperEditor,openFilterEditor,dripperCatalog:DRIPPER_CATALOG,filterPaperCatalog:FILTER_PAPER_CATALOG};
