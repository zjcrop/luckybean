const FIELD_LABELS = Object.freeze({
  country: ['国家','國家','产地国','產地國','原产国','原產國','生产国','生產國','country','country of origin','origin country'],
  region: ['产区','產區','地区','地區','区域','區域','种植区','種植區','微产区','微產區','region','growing region','producing region','district','province','terroir'],
  entity: ['庄园','莊園','农场','農場','农园','農園','处理站','處理站','水洗站','加工站','处理厂','處理廠','生产者','生產者','合作社','producer','farm','estate','finca','washing station','processing station','cooperative','wet mill','dry mill'],
  variety: ['豆种','豆種','品种','品種','咖啡品种','咖啡品種','栽培种','栽培種','种属','種屬','variety','varietal','cultivar','species'],
  process: ['处理法','處理法','处理方式','處理方式','加工法','加工方式','发酵方式','發酵方式','精制法','精製法','后制法','後製法','process','processing','processing method','fermentation','method'],
  roast: ['烘焙度','烘焙程度','焙度','roast level','roast profile','roast'],
  roastDate: ['烘焙日期','烘焙日','烘豆日期','烘焙时间','烘焙時間','出炉日期','出爐日期','roast date','roasted on','roasting date'],
  productionDate: ['生产日期','生產日期','制造日期','製造日期','production date','manufactured on','mfg date'],
  packDate: ['包装日期','包裝日期','分装日期','分裝日期','pack date','packed on','packing date'],
  bestBefore: ['最佳赏味期','最佳賞味期','最佳饮用期','最佳飲用期','赏味期限','賞味期限','best before','best by'],
  expiryDate: ['到期日','有效期至','有效期限','保质期至','保質期至','expiry','expiration date','use by'],
  roaster: ['烘焙商','烘焙厂','烘焙廠','烘焙品牌','烘焙者','品牌','roaster','roasted by','roast house','roastery'],
  harvest: ['产季','產季','收获季','收穫季','采收季','採收季','收获年份','收穫年份','采收年份','採收年份','crop','crop year','harvest','harvest year'],
  flavor: ['风味','風味','风味描述','風味描述','杯测风味','杯測風味','风味标签','風味標籤','品鉴笔记','品鑑筆記','香气','香氣','flavor notes','flavour notes','tasting notes','cup notes','aroma'],
  altitude: ['海拔','种植海拔','種植海拔','海拔高度','种植高度','種植高度','altitude','elevation','masl'],
  roastColor: ['烘焙色值','色值','艾格壮','艾格壯','agtron','roast color','colour value','color value'],
  weight: ['净重','淨重','净含量','淨含量','重量','规格','規格','克重','包装重量','包裝重量','net weight','net wt'],
  lot: ['批次','批号','批號','批次号','批次號','批次编号','批次編號','lot','lot no','lot number','batch','batch no'],
  grade: ['等级','等級','分级','分級','grade','screen size','screen','cup score','score']
});

const CANONICAL_LABEL = Object.freeze({
  country:'国家', region:'产区', entity:'庄园', variety:'豆种', process:'处理法', roast:'烘焙度',
  roastDate:'烘焙日期', productionDate:'生产日期', packDate:'包装日期', bestBefore:'最佳赏味期',
  expiryDate:'到期日', roaster:'烘焙商', harvest:'产季', flavor:'风味', altitude:'海拔',
  roastColor:'烘焙色值', weight:'净重', lot:'批次', grade:'等级'
});

const TABLE_FOR_FIELD = Object.freeze({
  country:'countries', region:'regions', entity:'entities', variety:'varieties', process:'processes', flavor:'flavors'
});

const SAFE_VALUE_EQUIVALENTS = Object.freeze({
  '衣索比亞':['埃塞俄比亚'], '肯亞':['肯尼亚'], '哥倫比亞':['哥伦比亚'], '巴拿馬':['巴拿马'],
  '瓜地馬拉':['危地马拉'], '宏都拉斯':['洪都拉斯'], '薩爾瓦多':['萨尔瓦多'], '盧安達':['卢旺达'],
  '蒲隆地':['布隆迪'], '藝伎':['艺伎','瑰夏','Geisha','Gesha'], '日曬':['日晒'], '蜜處理':['蜜处理'],
  '厭氧':['厌氧'], '厭氧發酵':['厌氧发酵'], '濕刨':['湿刨'], '碳酸浸漬':['碳酸浸渍'],
  '粉红波旁':['粉波旁','Pink Bourbon'], '粉紅波旁':['粉波旁','Pink Bourbon']
});

const TRADITIONAL_LOOKUP_FOLD = Object.freeze({
  '國':'国','產':'产','區':'区','莊':'庄','園':'园','農':'农','處':'处','廠':'厂','種':'种','屬':'属','藝':'艺',
  '曬':'晒','發':'发','厭':'厌','濕':'湿','漬':'渍','風':'风','標':'标','籤':'签','鑑':'鉴','記':'记','氣':'气',
  '淨':'净','規':'规','號':'号','編':'编','級':'级','灣':'湾','倫':'伦','亞':'亚','馬':'马','達':'达','薩':'萨',
  '爾':'尔','盧':'卢','東':'东','門':'门','義':'义','羅':'罗','蘭':'兰','島':'岛','縣':'县','鎮':'镇','鄉':'乡',
  '嶺':'岭','嶽':'岳','穀':'谷','臺':'台','烏':'乌','貝':'贝','獅':'狮','葉':'叶','樹':'树','陳':'陈','紅':'红'
});

const ENTITY_SUFFIX_PATTERN = /(?:庄园|莊園|农场|農場|农园|農園|处理站|處理站|水洗站|处理厂|處理廠|合作社|estate|farm|finca|washing station|processing station|cooperative)$/iu;
const REGION_SUFFIX_PATTERN = /(?:省|州|县|縣|地区|地區|产区|產區|region|province|district)$/iu;
const ROAST_VALUE_PATTERNS = Object.freeze([
  [/^(?:極淺|极浅|超浅|超淺)(?:焙|烘|烘焙)?$/u,'极浅烘'],
  [/^(?:淺中|浅中|中淺|中浅)(?:焙|烘|烘焙)?$/u,'浅中烘'],
  [/^(?:淺|浅)(?:焙|烘|烘焙)$/u,'浅烘'], [/^中(?:焙|烘|烘焙)$/u,'中烘'],
  [/^中深(?:焙|烘|烘焙)?$/u,'中深烘'], [/^深(?:焙|烘|烘焙)$/u,'深烘'],
  [/^(?:極深|极深)(?:焙|烘|烘焙)?$/u,'极深烘']
]);
const INLINE_ROAST_PATTERN = /(極淺烘|极浅烘|超浅烘|超淺烘|淺中烘|浅中烘|中淺烘|中浅烘|中深烘|極深烘|极深烘|淺烘|浅烘|中烘|深烘|淺焙|浅焙|中焙|深焙)/iu;
const INLINE_WEIGHT_PATTERN = /(\d{1,5}(?:\.\d+)?)\s*(g|克|grams?)\b/iu;
const SENSORY_SCORE_PATTERN = /^(?:酸度|酸質|酸质|甜感|甜度|醇厚度|醇厚|口感|餘韻|余韵|平衡|乾淨度|干净度|香氣|香气)\s*[0-9OoIl|]{1,3}$/iu;
const BREW_GUIDANCE_HEADING = /^(?:手冲|手沖|冲煮|沖煮|冲泡|沖泡|萃取)(?:建议|建議|参数|參數|方式|方案)?\s*[:：]?$/iu;

function clean(value) { return String(value ?? '').normalize('NFKC').replace(/[﹕︰]/g,':').replace(/[｜丨]/g,'|').replace(/\s+/g,' ').trim(); }
function key(value) { return clean(value).toLocaleLowerCase('zh-CN').replace(/[\s:：=|｜;；.。]+$/g,'').trim(); }
function foldTraditional(value) { return [...String(value || '')].map(character => TRADITIONAL_LOOKUP_FOLD[character] || character).join(''); }

const LABEL_INDEX = (() => {
  const map = new Map();
  for (const [field, aliases] of Object.entries(FIELD_LABELS)) for (const alias of aliases) {
    const normalized = key(alias); if (normalized && !map.has(normalized)) map.set(normalized, field);
  }
  return map;
})();

function detectLabelOnly(line) { const field = LABEL_INDEX.get(key(line)); return field ? { field, label:CANONICAL_LABEL[field] } : null; }
function splitInline(line) {
  const text = clean(line);
  for (const separator of [/:|：|=|\||｜/, /\s+[–—-]\s+/]) {
    const match = separator.exec(text); if (!match || match.index <= 0) continue;
    const left = clean(text.slice(0,match.index)), right = clean(text.slice(match.index + match[0].length));
    if (!left || !right) continue;
    const leftField = LABEL_INDEX.get(key(left));
    if (leftField) return { field:leftField, label:CANONICAL_LABEL[leftField], value:right };
  }
  return null;
}

function tableAliases(book, table) {
  const aliases = new Map();
  for (const row of book?.[table] || []) for (const item of row.slice(1)) {
    if (typeof item !== 'string' || !item || ['active','candidate'].includes(item)) continue;
    for (const alias of item.split(/[\\/、,，;；|]/).map(clean).filter(Boolean)) aliases.set(alias.toLocaleLowerCase('zh-CN'), alias);
  }
  return aliases;
}
function aliasesForTable(book, table, cache) { let value=cache.get(table); if(!value){ value=tableAliases(book,table); cache.set(table,value); } return value; }
function valueVariants(value) {
  const raw=clean(value), folded=clean(foldTraditional(raw));
  const direct=[raw,folded,...(SAFE_VALUE_EQUIVALENTS[raw] || []),...(SAFE_VALUE_EQUIVALENTS[folded] || [])];
  const bourbonFold=folded.replace(/粉紅波旁|粉红波旁/gu,'粉波旁');
  if (bourbonFold !== folded) direct.push(bourbonFold,'粉波旁','Pink Bourbon');
  return [...new Set(direct.map(clean).filter(Boolean))];
}
function exactTableAlias(field, value, book, cache) {
  const table=TABLE_FOR_FIELD[field]; if(!table)return '';
  const aliases=aliasesForTable(book,table,cache);
  for (const candidate of valueVariants(value)) { const exact=aliases.get(candidate.toLocaleLowerCase('zh-CN')); if(exact)return exact; }
  return '';
}
function containedTableAlias(field, value, book, cache) {
  const table=TABLE_FOR_FIELD[field]; if(!table)return '';
  const aliases=aliasesForTable(book,table,cache);
  let best='';
  for (const variant of valueVariants(value)) {
    const lower=variant.toLocaleLowerCase('zh-CN');
    for (const [needle, display] of aliases.entries()) {
      if (needle.length < 2 || !lower.includes(needle)) continue;
      if (!best || needle.length > best.length) best=display;
    }
  }
  return best;
}
function lookupAugmentedValue(field,value,book,cache) {
  const raw=clean(value), table=TABLE_FOR_FIELD[field]; if(!raw || !table)return raw;
  const aliases=aliasesForTable(book,table,cache);
  for (const candidate of valueVariants(raw).slice(1)) {
    const exact=aliases.get(candidate.toLocaleLowerCase('zh-CN'));
    if (exact) return `${raw} / ${exact}`;
  }
  return raw;
}

function normalizeFlavorSeparators(value) {
  return clean(value)
    .replace(/([\p{Script=Han}])\s*[IⅠl|]\s*(?=[\p{Script=Han}])/gu,'$1、')
    .replace(/[|｜]+/g,'、').replace(/、{2,}/g,'、').replace(/^、|、$/g,'');
}
function canInferFlavorList(pieces,book,cache) {
  if (pieces.length < 2 || pieces.some(piece => /\d/.test(piece))) return false;
  const identityFields=['country','region','process','variety'];
  if (pieces.some(piece => identityFields.some(field => exactTableAlias(field,piece,book,cache)))) return false;
  const flavorHits=pieces.filter(piece => exactTableAlias('flavor',piece,book,cache)).length;
  return flavorHits >= Math.max(1,Math.ceil(pieces.length/3));
}
function inferredUnlabelledField(line,book,cache) {
  const raw=clean(line); if(!raw || SENSORY_SCORE_PATTERN.test(raw))return null;
  const folded=clean(foldTraditional(raw));
  if (ENTITY_SUFFIX_PATTERN.test(raw) || ENTITY_SUFFIX_PATTERN.test(folded)) return { field:'entity',label:CANONICAL_LABEL.entity,value:folded };
  if (REGION_SUFFIX_PATTERN.test(raw) || REGION_SUFFIX_PATTERN.test(folded)) return { field:'region',label:CANONICAL_LABEL.region,value:folded };
  for (const [pattern,canonical] of ROAST_VALUE_PATTERNS) if(pattern.test(raw)||pattern.test(folded)) return { field:'roast',label:CANONICAL_LABEL.roast,value:canonical };
  for (const field of ['country','region','variety','process']) {
    const exact=exactTableAlias(field,folded,book,cache); if(exact)return { field,label:CANONICAL_LABEL[field],value:exact };
  }
  const flavor=normalizeFlavorSeparators(folded), pieces=flavor.split(/[、,，;；/]+/).map(clean).filter(Boolean);
  if(flavor.length<=48 && canInferFlavorList(pieces,book,cache)) return { field:'flavor',label:CANONICAL_LABEL.flavor,value:flavor };
  return null;
}

const CN_DIGIT = Object.freeze({ '零':0,'〇':0,'○':0,'一':1,'壹':1,'二':2,'两':2,'兩':2,'贰':2,'貳':2,'三':3,'叁':3,'參':3,'四':4,'肆':4,'五':5,'伍':5,'六':6,'陆':6,'陸':6,'七':7,'柒':7,'八':8,'捌':8,'九':9,'玖':9 });
function parseChineseInteger(value) {
  const text=clean(value); if(!text)return NaN;
  if(/^\d+$/.test(text))return Number(text);
  const normalized=text.replace(/[拾]/g,'十');
  if(normalized.includes('十')) {
    const [left,right='']=normalized.split('十');
    const tens=left ? CN_DIGIT[left] : 1, ones=right ? CN_DIGIT[right] : 0;
    return Number.isFinite(tens) && Number.isFinite(ones) ? tens*10+ones : NaN;
  }
  if([...normalized].every(char => Object.prototype.hasOwnProperty.call(CN_DIGIT,char))) return Number([...normalized].map(char => CN_DIGIT[char]).join(''));
  return NaN;
}
function parseChineseYear(value) {
  const text=clean(value); if(/^\d{2,4}$/.test(text))return Number(text.length===2?`20${text}`:text);
  if([...text].every(char => Object.prototype.hasOwnProperty.call(CN_DIGIT,char))) {
    const digits=[...text].map(char=>CN_DIGIT[char]).join('');
    if(digits.length===2)return Number(`20${digits}`); if(digits.length===4)return Number(digits);
  }
  return NaN;
}
function validDate(year,month,day) {
  const date=new Date(year,month-1,day); return date.getFullYear()===year&&date.getMonth()===month-1&&date.getDate()===day;
}
function normalizeRoastDate(value) {
  const raw=clean(value);
  const m=/^(?:([零〇○一壹二两兩贰貳三叁參四肆五伍六陆陸七柒八捌九玖\d]{2,4})年)?([零〇○一壹二两兩贰貳三叁參四肆五伍六陆陸七柒八捌九玖十拾\d]{1,3})月([零〇○一壹二两兩贰貳三叁參四肆五伍六陆陸七柒八捌九玖十拾\d]{1,3})日?$/u.exec(raw);
  if(!m)return raw;
  const month=parseChineseInteger(m[2]), day=parseChineseInteger(m[3]);
  let year=m[1]?parseChineseYear(m[1]):new Date().getFullYear();
  if(!Number.isInteger(year)||!Number.isInteger(month)||!Number.isInteger(day)||!validDate(year,month,day))return raw;
  if(!m[1]) {
    const now=new Date(), candidate=new Date(year,month-1,day,23,59,59);
    if(candidate.getTime()>now.getTime()+7*86400000)year-=1;
  }
  return `${year}年${month}月${day}日`;
}

function mergeFlavorContinuation(base,next,book,cache) {
  const left=normalizeFlavorSeparators(base), right=normalizeFlavorSeparators(next);
  const a=left.split(/[、,，;；/]+/).map(clean).filter(Boolean), b=right.split(/[、,，;；/]+/).map(clean).filter(Boolean);
  if(!a.length)return right; if(!b.length)return left;
  const joined=`${a[a.length-1]}${b[0]}`;
  if(exactTableAlias('flavor',joined,book,cache)) { a[a.length-1]=joined; b.shift(); }
  return [...a,...b].join('、');
}
function isFlavorContinuation(line,book,cache) {
  const raw=clean(line); if(!raw||splitInline(raw)||detectLabelOnly(raw)||/\d/.test(raw)||raw.length>40)return false;
  const pieces=normalizeFlavorSeparators(raw).split(/[、,，;；/]+/).map(clean).filter(Boolean);
  if(!pieces.length||pieces.length>6)return false;
  return pieces.some(piece=>exactTableAlias('flavor',piece,book,cache)) || /^[、,，;；/]|[、,，;；/]$/.test(raw);
}

function classifyIdentityPiece(piece,book,cache) {
  const raw=clean(piece); if(!raw)return null;
  for(const field of ['country','region']) { const exact=exactTableAlias(field,raw,book,cache); if(exact)return {field,value:exact}; }
  for(const field of ['variety','process']) {
    const exact=exactTableAlias(field,raw,book,cache); if(exact)return {field,value:exact};
    const contained=containedTableAlias(field,raw,book,cache); if(contained)return {field,value:contained};
  }
  return null;
}
function repairFlavorOwnership(value,book,cache) {
  const normalized=normalizeFlavorSeparators(value);
  const pieces=normalized.split(/[、,，;；/]+/).map(clean).filter(Boolean);
  const identity=new Map(), flavor=[];
  for(const piece of pieces) {
    const candidate=classifyIdentityPiece(piece,book,cache);
    if(candidate) { if(!identity.has(candidate.field))identity.set(candidate.field,[]); identity.get(candidate.field).push(candidate.value); }
    else flavor.push(piece);
  }
  if(!identity.size)return [`${CANONICAL_LABEL.flavor}: ${normalized}`];
  const output=[];
  for(const field of ['country','region','entity','variety','process']) {
    const values=identity.get(field); if(values?.length)output.push(`${CANONICAL_LABEL[field]}: ${[...new Set(values)].join('、')}`);
  }
  if(flavor.length)output.push(`${CANONICAL_LABEL.flavor}: ${flavor.join('、')}`);
  return output;
}
function repairRoasterOwnership(value,book,cache) {
  const raw=clean(foldTraditional(value));
  const roast=INLINE_ROAST_PATTERN.exec(raw)?.[0] || '';
  const weightMatch=INLINE_WEIGHT_PATTERN.exec(raw), weight=weightMatch?.[0] || '';
  let withoutTyped=raw;
  if(roast)withoutTyped=withoutTyped.replace(roast,' ');
  if(weight)withoutTyped=withoutTyped.replace(weight,' ');
  withoutTyped=clean(withoutTyped);
  const process=containedTableAlias('process',withoutTyped,book,cache);
  const signalCount=Number(Boolean(roast))+Number(Boolean(weight))+Number(Boolean(process));
  if(signalCount<2)return [`${CANONICAL_LABEL.roaster}: ${raw}`];
  const output=[];
  let remaining=withoutTyped;
  if(process) { output.push(`${CANONICAL_LABEL.process}: ${withoutTyped}`); remaining=''; }
  if(roast)output.push(`${CANONICAL_LABEL.roast}: ${roast}`);
  if(weight)output.push(`${CANONICAL_LABEL.weight}: ${weight}`);
  remaining=clean(remaining.replace(/^[·•,，;；/\-]+|[·•,，;；/\-]+$/g,''));
  if(remaining.length>=2)output.unshift(`${CANONICAL_LABEL.roaster}: ${remaining}`);
  return output;
}
function repairInline(inline,book,cache) {
  if(inline.field==='flavor')return repairFlavorOwnership(inline.value,book,cache);
  if(inline.field==='roaster')return repairRoasterOwnership(inline.value,book,cache);
  if(inline.field==='roastDate')return [`${inline.label}: ${normalizeRoastDate(inline.value)}`];
  return [`${inline.label}: ${lookupAugmentedValue(inline.field,inline.value,book,cache)}`];
}

/**
 * Repairs OCR semantic text without mutating raw OCR evidence.
 * Explicit labels are preferred only when their value is semantically compatible.
 * Strong coffee-domain identity evidence can veto a bad spatial label association.
 */
export function repairRecognitionSemanticText(source,book) {
  const lines=String(source||'').replace(/\r/g,'').split(/\n+/).map(clean).filter(Boolean);
  const output=[], cache=new Map();
  let brewGuidance=false;
  for(let index=0;index<lines.length;index+=1) {
    const line=lines[index];
    if(BREW_GUIDANCE_HEADING.test(line)) { brewGuidance=true; continue; }
    const inline=splitInline(line), label=detectLabelOnly(line);
    if(brewGuidance) {
      if(!inline&&!label)continue;
      brewGuidance=false;
    }
    if(inline) {
      if(inline.field==='flavor') {
        let value=inline.value;
        while(index+1<lines.length && isFlavorContinuation(lines[index+1],book,cache)) {
          value=mergeFlavorContinuation(value,lines[index+1],book,cache); index+=1;
        }
        output.push(...repairFlavorOwnership(value,book,cache));
      } else output.push(...repairInline(inline,book,cache));
      continue;
    }
    if(label) {
      const next=lines[index+1];
      if(next&&!detectLabelOnly(next)&&!splitInline(next)&&!BREW_GUIDANCE_HEADING.test(next)) {
        const value=label.field==='roastDate'?normalizeRoastDate(next):next;
        output.push(...repairInline({field:label.field,label:label.label,value},book,cache)); index+=1; continue;
      }
      output.push(label.label); continue;
    }
    const inferred=inferredUnlabelledField(line,book,cache);
    if(inferred)output.push(`${inferred.label}: ${inferred.value}`); else output.push(line);
  }
  return output.join('\n');
}
