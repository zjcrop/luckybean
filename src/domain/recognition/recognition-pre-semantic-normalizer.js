export const PRE_SEMANTIC_NORMALIZATION_SCHEMA = 'recognition-pre-semantic/1.0';

const TRADITIONAL_FOLD = Object.freeze({
  '國':'国','產':'产','區':'区','莊':'庄','園':'园','農':'农','處':'处','廠':'厂','種':'种','屬':'属','藝':'艺',
  '曬':'晒','發':'发','厭':'厌','濕':'湿','漬':'渍','風':'风','標':'标','籤':'签','鑑':'鉴','記':'记','氣':'气',
  '淨':'净','規':'规','號':'号','編':'编','級':'级','灣':'湾','倫':'伦','亞':'亚','馬':'马','達':'达','薩':'萨',
  '爾':'尔','盧':'卢','東':'东','門':'门','義':'义','羅':'罗','蘭':'兰','島':'岛','縣':'县','鎮':'镇','鄉':'乡',
  '嶺':'岭','嶽':'岳','穀':'谷','臺':'台','烏':'乌','貝':'贝','獅':'狮','葉':'叶','樹':'树','陳':'陈','紅':'红',
  '黃':'黄','綠':'绿','藍':'蓝','廣':'广','寧':'宁','華':'华','爾':'尔','賴':'赖','維':'维','納':'纳','達':'达',
  '賞':'赏','飲':'饮','製':'制','裝':'装','質':'质','餘':'余','韻':'韵','乾':'干','潔':'洁','頭':'头','門':'门'
});

const FIELD_LABELS = Object.freeze({
  country: '国家', region: '产区', entity: '庄园', variety: '豆种', process: '处理法', roast: '烘焙度', flavor: '风味'
});

// Only exact, high-specificity coffee-domain aliases are permitted here. These
// are shadow-normalization hints, never replacements for raw OCR evidence.
const EXACT_ALIASES = Object.freeze({
  // Taiwan/HK country exonyms.
  '衣索比亚': { field:'country', canonical:'埃塞俄比亚', rule:'country-exonym', confidence:0.99 },
  '肯亚': { field:'country', canonical:'肯尼亚', rule:'country-exonym', confidence:0.99 },
  '瓜地马拉': { field:'country', canonical:'危地马拉', rule:'country-exonym', confidence:0.99 },
  '宏都拉斯': { field:'country', canonical:'洪都拉斯', rule:'country-exonym', confidence:0.99 },
  '萨尔瓦多': { field:'country', canonical:'萨尔瓦多', rule:'country-exonym', confidence:0.99 },
  '卢安达': { field:'country', canonical:'卢旺达', rule:'country-exonym', confidence:0.99 },
  '蒲隆地': { field:'country', canonical:'布隆迪', rule:'country-exonym', confidence:0.99 },
  '哥伦比亚': { field:'country', canonical:'哥伦比亚', rule:'country-canonical', confidence:0.99 },

  // Common coffee-origin transliterations. Field type is part of the alias fact.
  '薇拉': { field:'region', canonical:'Huila', aliases:['惠拉','乌伊拉'], rule:'coffee-origin-transliteration', confidence:0.94 },
  '惠拉': { field:'region', canonical:'Huila', aliases:['薇拉','乌伊拉'], rule:'coffee-origin-transliteration', confidence:0.94 },
  '乌伊拉': { field:'region', canonical:'Huila', aliases:['薇拉','惠拉'], rule:'coffee-origin-transliteration', confidence:0.94 },
  '耶加雪菲': { field:'region', canonical:'Yirgacheffe', rule:'coffee-origin-transliteration', confidence:0.97 },
  '耶加雪啡': { field:'region', canonical:'Yirgacheffe', rule:'coffee-origin-transliteration', confidence:0.94 },
  '西达摩': { field:'region', canonical:'Sidama', aliases:['Sidamo','西达马','锡达摩'], rule:'coffee-origin-transliteration', confidence:0.94 },
  '锡达摩': { field:'region', canonical:'Sidama', aliases:['Sidamo','西达摩','西达马'], rule:'coffee-origin-transliteration', confidence:0.94 },
  '西达马': { field:'region', canonical:'Sidama', aliases:['Sidamo','西达摩','锡达摩'], rule:'coffee-origin-transliteration', confidence:0.94 },
  '古吉': { field:'region', canonical:'Guji', rule:'coffee-origin-transliteration', confidence:0.97 },

  // Variety naming traditions.
  '艺伎': { field:'variety', canonical:'Gesha', aliases:['Geisha','瑰夏'], rule:'coffee-variety-alias', confidence:0.94 },
  '瑰夏': { field:'variety', canonical:'Gesha', aliases:['Geisha','艺伎'], rule:'coffee-variety-alias', confidence:0.94 },

  // Processing terminology in Chinese/Japanese/Korean.
  '水洗': { field:'process', canonical:'水洗', rule:'process-canonical', confidence:0.99 },
  '日晒': { field:'process', canonical:'日晒', rule:'process-canonical', confidence:0.99 },
  '蜜处理': { field:'process', canonical:'蜜处理', rule:'process-canonical', confidence:0.99 },
  '湿刨': { field:'process', canonical:'湿刨', rule:'process-canonical', confidence:0.99 },
  'ウォッシュド': { field:'process', canonical:'水洗', aliases:['Washed'], rule:'process-translation-ja', confidence:0.98 },
  'ナチュラル': { field:'process', canonical:'日晒', aliases:['Natural'], rule:'process-translation-ja', confidence:0.98 },
  'ハニー': { field:'process', canonical:'蜜处理', aliases:['Honey Process'], rule:'process-translation-ja', confidence:0.96 },
  '嫌気': { field:'process', canonical:'厌氧', aliases:['Anaerobic'], rule:'process-translation-ja', confidence:0.94 },
  '워시드': { field:'process', canonical:'水洗', aliases:['Washed'], rule:'process-translation-ko', confidence:0.98 },
  '내추럴': { field:'process', canonical:'日晒', aliases:['Natural'], rule:'process-translation-ko', confidence:0.98 },
  '허니': { field:'process', canonical:'蜜处理', aliases:['Honey Process'], rule:'process-translation-ko', confidence:0.96 },
  '무산소': { field:'process', canonical:'厌氧', aliases:['Anaerobic'], rule:'process-translation-ko', confidence:0.94 },

  // Roast terminology.
  '极浅焙': { field:'roast', canonical:'极浅烘', rule:'roast-terminology', confidence:0.99 },
  '浅焙': { field:'roast', canonical:'浅烘', rule:'roast-terminology', confidence:0.99 },
  '浅中焙': { field:'roast', canonical:'浅中烘', rule:'roast-terminology', confidence:0.99 },
  '中浅焙': { field:'roast', canonical:'浅中烘', rule:'roast-terminology', confidence:0.99 },
  '中焙': { field:'roast', canonical:'中烘', rule:'roast-terminology', confidence:0.99 },
  '中深焙': { field:'roast', canonical:'中深烘', rule:'roast-terminology', confidence:0.99 },
  '深焙': { field:'roast', canonical:'深烘', rule:'roast-terminology', confidence:0.99 },
  '极深焙': { field:'roast', canonical:'极深烘', rule:'roast-terminology', confidence:0.99 },
  '浅煎り': { field:'roast', canonical:'浅烘', rule:'roast-translation-ja', confidence:0.97 },
  '中浅煎り': { field:'roast', canonical:'浅中烘', rule:'roast-translation-ja', confidence:0.97 },
  '中煎り': { field:'roast', canonical:'中烘', rule:'roast-translation-ja', confidence:0.97 },
  '中深煎り': { field:'roast', canonical:'中深烘', rule:'roast-translation-ja', confidence:0.97 },
  '深煎り': { field:'roast', canonical:'深烘', rule:'roast-translation-ja', confidence:0.97 },
  '약배전': { field:'roast', canonical:'浅烘', rule:'roast-translation-ko', confidence:0.97 },
  '중약배전': { field:'roast', canonical:'浅中烘', rule:'roast-translation-ko', confidence:0.97 },
  '중배전': { field:'roast', canonical:'中烘', rule:'roast-translation-ko', confidence:0.97 },
  '중강배전': { field:'roast', canonical:'中深烘', rule:'roast-translation-ko', confidence:0.97 },
  '강배전': { field:'roast', canonical:'深烘', rule:'roast-translation-ko', confidence:0.97 }
});

const ENTITY_SUFFIX = /(?:庄园|农场|农园|处理站|水洗站|处理厂|合作社|estate|farm|finca|washing station|processing station|cooperative)$/iu;
const REGION_SUFFIX = /(?:省|州|县|地区|产区|region|province|district)$/iu;
const SENSORY_SCORE = /^(?:酸度|酸质|甜感|甜度|醇厚度|醇厚|口感|余韵|平衡|干净度|香气)\s*[0-9OoIl|]{1,3}$/iu;

function cleanRaw(value) {
  return String(value ?? '').normalize('NFKC').replace(/[﹕︰]/g, ':').replace(/[｜丨]/g, '|').replace(/\s+/g, ' ').trim();
}

export function foldRecognitionTraditional(value) {
  return [...cleanRaw(value)].map(character => TRADITIONAL_FOLD[character] || character).join('');
}

function flavorShadow(value) {
  const text = foldRecognitionTraditional(value);
  return text
    .replace(/([\p{Script=Han}])\s*[IⅠl|]\s*(?=[\p{Script=Han}])/gu, '$1、')
    .replace(/[|｜]+/g, '、')
    .replace(/、{2,}/g, '、')
    .replace(/^、|、$/g, '');
}

function flavorLike(value) {
  const pieces = flavorShadow(value).split(/[、,，;；/]+/).map(cleanRaw).filter(Boolean);
  return pieces.length >= 2 && pieces.length <= 10 && pieces.every(piece => !/\d/.test(piece) && piece.length <= 28);
}

function lineCandidate(rawText, normalizedBase) {
  if (!normalizedBase || SENSORY_SCORE.test(normalizedBase)) return null;
  const exact = EXACT_ALIASES[normalizedBase];
  if (exact) return { ...exact, value:exact.canonical, aliases:[...(exact.aliases || [])] };
  if (ENTITY_SUFFIX.test(normalizedBase)) {
    return { field:'entity', value:normalizedBase, aliases:[], rule:'typed-entity-suffix', confidence:0.93 };
  }
  if (REGION_SUFFIX.test(normalizedBase)) {
    const stripped = normalizedBase.replace(REGION_SUFFIX, '').trim();
    const transliteration = EXACT_ALIASES[stripped];
    return {
      field:'region', value:normalizedBase,
      aliases:transliteration?.field === 'region' ? [transliteration.canonical, ...(transliteration.aliases || [])] : [],
      rule:transliteration?.field === 'region' ? 'typed-region-suffix+transliteration' : 'typed-region-suffix',
      confidence:transliteration?.field === 'region' ? Math.max(0.95, transliteration.confidence) : 0.93
    };
  }
  if (flavorLike(rawText)) {
    return { field:'flavor', value:flavorShadow(rawText), aliases:[], rule:'flavor-separator-repair', confidence:0.9 };
  }
  return null;
}

function semanticShadow(base, candidate) {
  if (!candidate) return base;
  const label = FIELD_LABELS[candidate.field];
  if (!label) return base;
  const alternatives = [candidate.value, ...(candidate.aliases || [])].map(cleanRaw).filter(Boolean);
  const unique = [...new Set(alternatives)];
  return `${label}: ${unique.join(' / ')}`;
}

/**
 * Builds a non-destructive semantic shadow before field recognition.
 * Raw OCR is preserved byte-for-semantic-byte after NFKC/control cleanup; only
 * normalizedText is consumed by downstream field recognition. Every changed line
 * carries an auditable rule/confidence record so translation can never masquerade
 * as visual OCR evidence.
 */
export function preNormalizeRecognitionSemanticText(source, _book) {
  const rawLines = String(source || '').replace(/\r/g, '').split(/\n+/).map(cleanRaw).filter(Boolean);
  const lines = rawLines.map((rawText, index) => {
    const folded = foldRecognitionTraditional(rawText);
    const candidate = lineCandidate(rawText, folded);
    const normalizedText = semanticShadow(folded, candidate);
    const changed = normalizedText !== rawText;
    return {
      index,
      rawText,
      normalizedText,
      ...(candidate ? { candidates:[{
        field:candidate.field,
        value:candidate.value,
        aliases:[...(candidate.aliases || [])],
        rule:candidate.rule,
        confidence:candidate.confidence,
        authority:'normalization-shadow'
      }] } : { candidates:[] }),
      changed
    };
  });
  const changedLines = lines.filter(line => line.changed);
  return {
    schemaVersion:PRE_SEMANTIC_NORMALIZATION_SCHEMA,
    authority:'shadow-only',
    mayOverwriteRawEvidence:false,
    rawText:rawLines.join('\n'),
    normalizedText:lines.map(line => line.normalizedText).join('\n'),
    lines,
    audit:changedLines.map(line => ({
      index:line.index,
      rawText:line.rawText,
      normalizedText:line.normalizedText,
      candidates:line.candidates
    }))
  };
}
