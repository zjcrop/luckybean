import { getSetting, setSetting } from '../db.js';

const $=(selector,root=document)=>root?.querySelector?.(selector)||null;
const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[char]));
const uid=()=>`grinder_${crypto.randomUUID?.()||Date.now().toString(36)}`;

async function loadSettings(){
  const settings=await getSetting('app.settings',{}).catch(()=>({}))||{};
  settings.gear||={};
  settings.gear.grinders=Array.isArray(settings.gear.grinders)?settings.gear.grinders:[];
  settings.brew||={};
  return settings;
}

function closeOverlay(){ $('#overlayRoot')?.replaceChildren(); }

function showStatus(overlay,message){
  let node=$('[data-grinder-status]',overlay);
  if(!node){
    node=document.createElement('p');
    node.className='status-bad small';
    node.dataset.grinderStatus='1';
    $('.row.end',overlay)?.before(node);
  }
  node.textContent=message;
}

function numericOrNull(value){
  const text=String(value??'').trim();
  if(!text)return null;
  const number=Number(text);
  return Number.isFinite(number)?number:null;
}

function validateAnchors(fine,mid,coarse){
  const values=[fine,mid,coarse];
  const filled=values.filter(value=>value!==null).length;
  if(filled!==0&&filled!==3)return '较细、中间、较粗三个锚点应同时填写，或全部留空。';
  if(filled===3&&new Set(values).size<3)return '三个研磨锚点不能相同。';
  return '';
}

async function openGrinderEditor(id=''){
  const settings=await loadSettings();
  const current=settings.gear.grinders.find(item=>String(item.id)===String(id))||{};
  const root=$('#overlayRoot');
  if(!root)return;
  root.innerHTML=`<div class="overlay" data-overlay="grinder-editor"><div class="dialog lb-gear-match-dialog"><div class="dialog-header centered"><div><h2>${id?'编辑磨豆机':'添加磨豆机'}</h2><p>名称用于设备匹配；较细、中间、较粗锚点用于没有 Grind-PSD 实测数据时的本地刻度映射。</p></div><button class="close-button" type="button" data-close-overlay>×</button></div><div class="grid-2"><label class="field"><span>品牌</span><input id="grinderBrand" class="control" value="${esc(current.brand||current.manufacturer||'')}"></label><label class="field"><span>名称 *</span><input id="grinderName" class="control" value="${esc(current.name||current.model||'')}"></label><label class="field"><span>常用刻度</span><input id="grinderSetting" class="control" value="${esc(current.setting||'')}" placeholder="例如 22格"></label><label class="field"><span>刻度方向</span><select id="grinderDirection" class="control"><option value="increasing_is_coarser"${current.direction!=='increasing_is_finer'?' selected':''}>数值增大＝更粗</option><option value="increasing_is_finer"${current.direction==='increasing_is_finer'?' selected':''}>数值增大＝更细</option></select></label><label class="field"><span>较细锚点</span><input id="grinderFineAnchor" class="control" type="number" step="0.01" value="${esc(current.fineAnchor??'')}"></label><label class="field"><span>中间锚点</span><input id="grinderMidAnchor" class="control" type="number" step="0.01" value="${esc(current.midAnchor??'')}"></label><label class="field"><span>较粗锚点</span><input id="grinderCoarseAnchor" class="control" type="number" step="0.01" value="${esc(current.coarseAnchor??'')}"></label></div><p class="muted small">若 Grind-PSD 能匹配到同品牌/型号，优先显示实测参考；三个锚点只作为无实测数据时的设备内映射，不冒充粒径实测值。</p><div class="row end">${id?'<button id="deleteGrinderBtn" class="button danger" type="button">删除</button>':''}<button id="saveGrinderBtn" class="button primary" type="button">确定</button></div></div></div>`;
  const overlay=root.firstElementChild;
  $('[data-close-overlay]',overlay)?.addEventListener('click',closeOverlay);
  overlay.addEventListener('click',event=>{if(event.target===overlay)closeOverlay();});
  $('#saveGrinderBtn',overlay)?.addEventListener('click',async()=>{
    const name=$('#grinderName',overlay)?.value.trim()||'';
    if(!name)return showStatus(overlay,'磨豆机名称为必填项');
    const fine=numericOrNull($('#grinderFineAnchor',overlay)?.value);
    const mid=numericOrNull($('#grinderMidAnchor',overlay)?.value);
    const coarse=numericOrNull($('#grinderCoarseAnchor',overlay)?.value);
    const anchorError=validateAnchors(fine,mid,coarse);
    if(anchorError)return showStatus(overlay,anchorError);
    const now=new Date().toISOString();
    const record={
      ...current,
      id:String(current.id||uid()),
      brand:$('#grinderBrand',overlay)?.value.trim()||'',
      manufacturer:$('#grinderBrand',overlay)?.value.trim()||'',
      name,
      model:name,
      setting:$('#grinderSetting',overlay)?.value.trim()||'',
      direction:$('#grinderDirection',overlay)?.value||'increasing_is_coarser',
      ...(fine===null?{}:{fineAnchor:fine}),
      ...(mid===null?{}:{midAnchor:mid}),
      ...(coarse===null?{}:{coarseAnchor:coarse}),
      createdAt:current.createdAt||now,
      updatedAt:now
    };
    if(fine===null){delete record.fineAnchor;delete record.midAnchor;delete record.coarseAnchor;}
    const index=settings.gear.grinders.findIndex(item=>String(item.id)===String(record.id));
    if(index>=0)settings.gear.grinders[index]=record;else settings.gear.grinders.push(record);
    if(!settings.brew.grinderId)settings.brew.grinderId=record.id;
    await setSetting('app.settings',settings);
    closeOverlay();
    document.dispatchEvent(new CustomEvent('luckybean:request-app-refresh',{detail:{source:'grinder-saved'}}));
  });
  $('#deleteGrinderBtn',overlay)?.addEventListener('click',async()=>{
    settings.gear.grinders=settings.gear.grinders.filter(item=>String(item.id)!==String(id));
    if(String(settings.brew.grinderId||'')===String(id))settings.brew.grinderId=settings.gear.grinders[0]?.id||'';
    await setSetting('app.settings',settings);
    closeOverlay();
    document.dispatchEvent(new CustomEvent('luckybean:request-app-refresh',{detail:{source:'grinder-deleted'}}));
  });
}

document.addEventListener('click',event=>{
  const add=event.target.closest?.('[data-add-gear="grinder"]');
  const item=event.target.closest?.('[data-grinder-item]');
  if(!add&&!item)return;
  event.preventDefault();
  event.stopImmediatePropagation();
  openGrinderEditor(item?.dataset?.grinderItem||'').catch(error=>console.error('磨豆机编辑器打开失败',error));
},true);

globalThis.LuckyBeanGrinderCatalog={openGrinderEditor};
