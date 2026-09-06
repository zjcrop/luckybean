export const RECOGNITION_RECORD_CANDIDATE_SCHEMA = 'recognition-record-candidate/1.0';

const PROCESS_SIGNAL = /(?:水洗|日晒|日曬|厌氧|厭氧|蜜处理|蜜處理|湿刨|濕刨|酵素|發酵|发酵|washed|natural|anaerobic|honey\s*process|wet\s*hulled|semi[-\s]?washed|carbonic|ナチュラル|ウォッシュド|ハニー|嫌気|워시드|내추럴|허니|무산소)/iu;
const COFFEE_IDENTITY_SIGNAL = /(?:ethiopia|kenya|colombia|brazil|panama|guatemala|honduras|costa\s*rica|el\s*salvador|rwanda|burundi|indonesia|yirgacheffe|guji|sidamo|nyeri|huila|gesha|geisha|sl\s*28|sl\s*34|caturra|bourbon|typica|74110|74112|74158|衣索比亞|埃塞俄比亚|埃塞俄比亞|肯亞|肯尼亚|哥倫比亞|哥伦比亚|巴西|巴拿馬|巴拿马|瓜地馬拉|危地马拉|宏都拉斯|洪都拉斯|哥斯大黎加|薩爾瓦多|萨尔瓦多|盧安達|卢旺达|蒲隆地|布隆迪|印尼|耶加雪菲|古吉|瑰夏|藝伎|艺伎|波旁|卡杜拉|鐵皮卡|铁皮卡)/iu;
const IDENTITY_ANCHORS = new Set(['country','origin','region','farm','producer','station','cooperative','variety','species']);

function clean(value) {
  return String(value ?? '').normalize('NFKC').replace(/\s+/g, ' ').trim();
}

function validBox(box) {
  return box && ['left','top','right','bottom','width','height','centerX','centerY'].every(key => Number.isFinite(Number(box[key])));
}

function unionBox(blocks) {
  const boxes = blocks.map(block => block.box).filter(validBox);
  if (!boxes.length) return null;
  const left = Math.min(...boxes.map(box => Number(box.left)));
  const top = Math.min(...boxes.map(box => Number(box.top)));
  const right = Math.max(...boxes.map(box => Number(box.right)));
  const bottom = Math.max(...boxes.map(box => Number(box.bottom)));
  return {
    left, top, right, bottom,
    width: Math.max(1, right - left),
    height: Math.max(1, bottom - top),
    centerX: (left + right) / 2,
    centerY: (top + bottom) / 2
  };
}

function normalizedBox(box, frame) {
  const width = Math.max(1, frame.width);
  const height = Math.max(1, frame.height);
  const left = (box.left - frame.left) / width;
  const right = (box.right - frame.left) / width;
  const top = (box.top - frame.top) / height;
  const bottom = (box.bottom - frame.top) / height;
  return {
    left, top, right, bottom,
    width: Math.max(0.0001, right - left),
    height: Math.max(0.0001, bottom - top),
    centerX: (left + right) / 2,
    centerY: (top + bottom) / 2
  };
}

function preparedBlocks(document) {
  const blocks = (document?.blocks || []).filter(block => clean(block?.text) && validBox(block?.box));
  const frame = unionBox(blocks);
  if (!frame) return [];
  return blocks.map(block => ({ ...block, normalizedBox:normalizedBox(block.box, frame) }));
}

function median(values, fallback = 0) {
  const sorted = values.map(Number).filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return fallback;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function overlapRatio(a1, a2, b1, b2) {
  const overlap = Math.max(0, Math.min(a2, b2) - Math.max(a1, b1));
  return overlap / Math.max(0.0001, Math.min(a2 - a1, b2 - b1));
}

function verticalOverlap(a, b) {
  return overlapRatio(a.top, a.bottom, b.top, b.bottom);
}

function evidence(blocks) {
  const text = blocks.map(block => clean(block.text)).join(' ');
  const anchors = new Set(blocks.map(block => String(block.fieldAnchor || '')).filter(Boolean));
  const identityAnchor = [...anchors].some(anchor => IDENTITY_ANCHORS.has(anchor));
  return {
    process:Boolean(PROCESS_SIGNAL.test(text) || anchors.has('process')),
    identity:Boolean(COFFEE_IDENTITY_SIGNAL.test(text) || identityAnchor),
    anchors:[...anchors]
  };
}

function orderBlocks(blocks) {
  return [...blocks].sort((a, b) => {
    const ay = a.normalizedBox?.top ?? a.box?.top ?? 0;
    const by = b.normalizedBox?.top ?? b.box?.top ?? 0;
    const ah = a.normalizedBox?.height ?? a.box?.height ?? 1;
    const bh = b.normalizedBox?.height ?? b.box?.height ?? 1;
    if (Math.abs((a.normalizedBox?.centerY ?? a.box?.centerY ?? 0) - (b.normalizedBox?.centerY ?? b.box?.centerY ?? 0)) <= Math.max(ah, bh) * 0.55) {
      return (a.normalizedBox?.left ?? a.box?.left ?? 0) - (b.normalizedBox?.left ?? b.box?.left ?? 0);
    }
    return ay - by;
  });
}

function candidate(document, blocks, index, method, confidence) {
  const ordered = orderBlocks(blocks);
  const ev = evidence(ordered);
  return {
    schemaVersion:RECOGNITION_RECORD_CANDIDATE_SCHEMA,
    id:`${String(document?.images?.[0]?.id || 'recognition')}:record-${index + 1}`,
    index,
    method,
    confidence,
    requiresUserConfirmation:true,
    imageIds:[...new Set(ordered.map(block => String(block.imageId || '')).filter(Boolean))],
    blockIds:ordered.map(block => String(block.id)),
    box:unionBox(ordered),
    text:ordered.map(block => clean(block.text)).filter(Boolean).join('\n'),
    evidence:ev
  };
}

function sideBySideCandidates(document, blocks) {
  if (blocks.length < 6) return [];
  const byX = [...blocks].sort((a, b) => a.normalizedBox.centerX - b.normalizedBox.centerX);
  let splitIndex = -1;
  let largestGap = 0;
  for (let index = 1; index < byX.length; index += 1) {
    const gap = byX[index].normalizedBox.centerX - byX[index - 1].normalizedBox.centerX;
    if (gap > largestGap) { largestGap = gap; splitIndex = index; }
  }
  if (splitIndex < 3 || byX.length - splitIndex < 3 || largestGap < 0.22) return [];
  const left = byX.slice(0, splitIndex);
  const right = byX.slice(splitIndex);
  const leftCenter = median(left.map(block => block.normalizedBox.centerX));
  const rightCenter = median(right.map(block => block.normalizedBox.centerX));
  if (rightCenter - leftCenter < 0.3) return [];
  const splitX = (byX[splitIndex - 1].normalizedBox.centerX + byX[splitIndex].normalizedBox.centerX) / 2;
  if (blocks.some(block => block.normalizedBox.left < splitX - 0.025 && block.normalizedBox.right > splitX + 0.025)) return [];
  const leftBox = unionBox(left.map(block => ({ box:block.normalizedBox }))) || null;
  const rightBox = unionBox(right.map(block => ({ box:block.normalizedBox }))) || null;
  if (!leftBox || !rightBox || verticalOverlap(leftBox, rightBox) < 0.6) return [];
  if (leftBox.height < 0.18 || rightBox.height < 0.18) return [];
  const leftEvidence = evidence(left), rightEvidence = evidence(right);
  if (!leftEvidence.process || !leftEvidence.identity || !rightEvidence.process || !rightEvidence.identity) return [];
  return [candidate(document, left, 0, 'geometry-side-by-side-v1', 0.82), candidate(document, right, 1, 'geometry-side-by-side-v1', 0.82)];
}

function buildRows(blocks) {
  const rows = [];
  for (const block of [...blocks].sort((a, b) => a.normalizedBox.top - b.normalizedBox.top || a.normalizedBox.left - b.normalizedBox.left)) {
    const match = rows.find(row =>
      verticalOverlap(row.box, block.normalizedBox) >= 0.45 ||
      Math.abs(row.box.centerY - block.normalizedBox.centerY) <= Math.max(row.box.height, block.normalizedBox.height) * 0.55
    );
    if (!match) {
      rows.push({ blocks:[block], box:{ ...block.normalizedBox } });
      continue;
    }
    match.blocks.push(block);
    const boxes = match.blocks.map(item => item.normalizedBox);
    const left = Math.min(...boxes.map(box => box.left));
    const top = Math.min(...boxes.map(box => box.top));
    const right = Math.max(...boxes.map(box => box.right));
    const bottom = Math.max(...boxes.map(box => box.bottom));
    match.box = { left, top, right, bottom, width:right-left, height:bottom-top, centerX:(left+right)/2, centerY:(top+bottom)/2 };
  }
  return rows.sort((a, b) => a.box.top - b.box.top || a.box.left - b.box.left);
}

function rowCandidates(document, blocks) {
  const rows = buildRows(blocks).filter(row => row.blocks.map(block => clean(block.text)).join('').length >= 6);
  if (rows.length < 2) return [];
  const records = rows.filter(row => {
    const ev = evidence(row.blocks);
    return ev.process && ev.identity;
  });
  if (records.length < 2 || records.length / rows.length < 0.72) return [];
  return records.map((row, index) => candidate(document, row.blocks, index, 'geometry-process-rows-v1', 0.8));
}

function verticalGapCandidates(document, blocks) {
  if (blocks.length < 4) return [];
  const ordered = [...blocks].sort((a, b) => a.normalizedBox.top - b.normalizedBox.top || a.normalizedBox.left - b.normalizedBox.left);
  const medianHeight = median(ordered.map(block => block.normalizedBox.height), 0.04);
  const threshold = Math.max(0.055, medianHeight * 1.7);
  const groups = [[ordered[0]]];
  for (let index = 1; index < ordered.length; index += 1) {
    const current = ordered[index], previous = ordered[index - 1];
    const gap = Math.max(0, current.normalizedBox.top - previous.normalizedBox.bottom);
    if (gap >= threshold) groups.push([current]); else groups[groups.length - 1].push(current);
  }
  const viable = groups.filter(group => group.length >= 2 && evidence(group).process && evidence(group).identity);
  if (viable.length < 2) return [];
  const covered = viable.reduce((sum, group) => sum + group.length, 0) / ordered.length;
  if (covered < 0.7) return [];
  return viable.map((group, index) => candidate(document, group, index, 'geometry-vertical-gap-v1', 0.78));
}

/**
 * Geometry-first, segmentation-only grouping of independent coffee records.
 * It never performs semantic/canonical mutation. Every geometry candidate remains
 * review-required and preserves source block/image identity for downstream parsing.
 */
export function groupRecognitionRecordCandidates(document) {
  if (!document || typeof document !== 'object') return { grouped:false, method:'none', candidates:[], schemaVersion:RECOGNITION_RECORD_CANDIDATE_SCHEMA };
  if ((document.images || []).length !== 1) return { grouped:false, method:'none', candidates:[], schemaVersion:RECOGNITION_RECORD_CANDIDATE_SCHEMA };
  const blocks = preparedBlocks(document);
  if (blocks.length < 2) return { grouped:false, method:'none', candidates:[], schemaVersion:RECOGNITION_RECORD_CANDIDATE_SCHEMA };
  for (const detector of [sideBySideCandidates, rowCandidates, verticalGapCandidates]) {
    const candidates = detector(document, blocks);
    if (candidates.length >= 2) return { grouped:true, method:candidates[0].method, candidates, schemaVersion:RECOGNITION_RECORD_CANDIDATE_SCHEMA };
  }
  return { grouped:false, method:'none', candidates:[], schemaVersion:RECOGNITION_RECORD_CANDIDATE_SCHEMA };
}
