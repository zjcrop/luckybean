const PREVIEW_MAX_EDGE = 900;
const OUTPUT_MAX_EDGE = 2200;
const OUTPUT_QUALITY = 0.94;

function clamp01(value) { return Math.max(0, Math.min(1, Number(value) || 0)); }
function bounded(width, height, maxEdge) {
  const scale = Math.min(1, maxEdge / Math.max(width, height));
  return { width:Math.max(1, Math.round(width * scale)), height:Math.max(1, Math.round(height * scale)) };
}
async function decodeBitmap(blob, maxEdge) {
  if (typeof createImageBitmap !== 'function') throw new Error('当前浏览器不支持高效图片解码');
  const probe = await createImageBitmap(blob, { imageOrientation:'from-image' });
  const width = probe.width, height = probe.height;
  if (Math.max(width, height) <= maxEdge) return probe;
  const target = bounded(width, height, maxEdge);
  probe.close?.();
  try {
    return await createImageBitmap(blob, { imageOrientation:'from-image', resizeWidth:target.width, resizeHeight:target.height, resizeQuality:'high' });
  } catch {
    return createImageBitmap(blob, { imageOrientation:'from-image' });
  }
}
function makeCanvas(width, height) {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width));
  canvas.height = Math.max(1, Math.round(height));
  return canvas;
}
function imageDataForAnalysis(bitmap) {
  const size = bounded(bitmap.width, bitmap.height, PREVIEW_MAX_EDGE);
  const canvas = makeCanvas(size.width, size.height);
  const ctx = canvas.getContext('2d', { willReadFrequently:true, alpha:false });
  ctx.drawImage(bitmap, 0, 0, size.width, size.height);
  return { canvas, ctx, imageData:ctx.getImageData(0, 0, size.width, size.height) };
}
function grayscaleEdges(imageData) {
  const { width, height, data } = imageData;
  const gray = new Float32Array(width * height);
  for (let i=0,p=0; i<data.length; i+=4,p+=1) gray[p] = 0.299*data[i] + 0.587*data[i+1] + 0.114*data[i+2];
  const mag = new Float32Array(width * height);
  for (let y=1; y<height-1; y+=1) {
    for (let x=1; x<width-1; x+=1) {
      const p = y*width+x;
      const gx = gray[p+1]-gray[p-1];
      const gy = gray[p+width]-gray[p-width];
      mag[p] = Math.abs(gx) + Math.abs(gy);
    }
  }
  return { width, height, mag };
}
function estimateDeskew(imageData, region) {
  const { width, height, mag } = grayscaleEdges(imageData);
  const left = Math.floor(clamp01(region.left) * width), right = Math.ceil(clamp01(region.right) * width);
  const top = Math.floor(clamp01(region.top) * height), bottom = Math.ceil(clamp01(region.bottom) * height);
  const points = [];
  for (let y=Math.max(1,top); y<Math.min(height-1,bottom); y+=2) {
    for (let x=Math.max(1,left); x<Math.min(width-1,right); x+=2) {
      const m = mag[y*width+x];
      if (m > 72) points.push([x,y,m]);
    }
  }
  if (points.length < 120) return { angle:0, confidence:0 };
  let bestAngle = 0, bestScore = -Infinity, secondScore = -Infinity;
  const bins = new Float64Array(Math.max(width, height) * 2 + 8);
  for (let angle=-12; angle<=12.001; angle+=0.5) {
    bins.fill(0);
    const rad = angle * Math.PI / 180;
    const sin = Math.sin(rad), cos = Math.cos(rad);
    for (const [x,y,m] of points) {
      const yr = Math.round(y*cos + x*sin) + Math.max(width,height);
      if (yr >= 0 && yr < bins.length) bins[yr] += Math.min(150,m);
    }
    let score = 0;
    for (let i=1; i<bins.length-1; i+=1) {
      const local = bins[i] - 0.5*(bins[i-1]+bins[i+1]);
      if (local > 0) score += local*local;
    }
    if (score > bestScore) { secondScore = bestScore; bestScore = score; bestAngle = angle; }
    else if (score > secondScore) secondScore = score;
  }
  const confidence = bestScore > 0 ? Math.max(0, Math.min(1, (bestScore-secondScore)/bestScore*8)) : 0;
  return { angle:Math.abs(bestAngle) < 0.75 ? 0 : -bestAngle, confidence };
}
function weightedLineFit(points, mode) {
  if (points.length < 6) return null;
  let sw=0,sx=0,sy=0,sxx=0,sxy=0;
  for (const point of points) {
    const a = mode === 'yx' ? point.x : point.y;
    const b = mode === 'yx' ? point.y : point.x;
    const w = Math.max(1, point.w);
    sw += w; sx += w*a; sy += w*b; sxx += w*a*a; sxy += w*a*b;
  }
  const denom = sw*sxx - sx*sx;
  if (Math.abs(denom) < 1e-6) return null;
  const slope = (sw*sxy - sx*sy)/denom;
  const intercept = (sy - slope*sx)/sw;
  return { slope, intercept };
}
function lineIntersection(topOrBottom, leftOrRight) {
  if (!topOrBottom || !leftOrRight) return null;
  // y = a*x+b; x = c*y+d
  const a=topOrBottom.slope,b=topOrBottom.intercept,c=leftOrRight.slope,d=leftOrRight.intercept;
  const denom = 1 - c*a;
  if (Math.abs(denom) < 1e-6) return null;
  const x = (c*b+d)/denom;
  const y = a*x+b;
  return { x,y };
}
function polygonArea(points) {
  let sum=0;
  for (let i=0;i<points.length;i+=1) {
    const a=points[i], b=points[(i+1)%points.length];
    sum += a.x*b.y - b.x*a.y;
  }
  return Math.abs(sum)/2;
}
function detectPerspectiveQuad(imageData, region) {
  const { width, height, mag } = grayscaleEdges(imageData);
  const left = Math.max(1,Math.floor(clamp01(region.left)*width));
  const right = Math.min(width-2,Math.ceil(clamp01(region.right)*width));
  const top = Math.max(1,Math.floor(clamp01(region.top)*height));
  const bottom = Math.min(height-2,Math.ceil(clamp01(region.bottom)*height));
  const rw=right-left, rh=bottom-top;
  if (rw<80 || rh<80) return { quad:null, confidence:0 };
  const topPts=[],bottomPts=[],leftPts=[],rightPts=[];
  const edgeAt=(x,y)=>mag[y*width+x];
  for (let x=left+Math.round(rw*0.08); x<=right-Math.round(rw*0.08); x+=Math.max(4,Math.round(rw/48))) {
    let ty=top,tm=0,by=bottom,bm=0;
    for (let y=top; y<=top+rh*0.35; y+=2) { const m=edgeAt(x,Math.round(y)); if(m>tm){tm=m;ty=y;} }
    for (let y=bottom-rh*0.35; y<=bottom; y+=2) { const m=edgeAt(x,Math.round(y)); if(m>bm){bm=m;by=y;} }
    if(tm>55) topPts.push({x,y:ty,w:tm});
    if(bm>55) bottomPts.push({x,y:by,w:bm});
  }
  for (let y=top+Math.round(rh*0.08); y<=bottom-Math.round(rh*0.08); y+=Math.max(4,Math.round(rh/48))) {
    let lx=left,lm=0,rx=right,rm=0;
    for (let x=left; x<=left+rw*0.35; x+=2) { const m=edgeAt(Math.round(x),y); if(m>lm){lm=m;lx=x;} }
    for (let x=right-rw*0.35; x<=right; x+=2) { const m=edgeAt(Math.round(x),y); if(m>rm){rm=m;rx=x;} }
    if(lm>55) leftPts.push({x:lx,y,w:lm});
    if(rm>55) rightPts.push({x:rx,y,w:rm});
  }
  const t=weightedLineFit(topPts,'yx'), b=weightedLineFit(bottomPts,'yx');
  const l=weightedLineFit(leftPts,'xy'), r=weightedLineFit(rightPts,'xy');
  const corners=[lineIntersection(t,l),lineIntersection(t,r),lineIntersection(b,r),lineIntersection(b,l)];
  if (corners.some(point=>!point)) return { quad:null, confidence:0 };
  const quad=corners;
  const area=polygonArea(quad), regionArea=rw*rh;
  const inside=quad.every(point=>point.x>=left-rw*0.12&&point.x<=right+rw*0.12&&point.y>=top-rh*0.12&&point.y<=bottom+rh*0.12);
  const support=Math.min(topPts.length,bottomPts.length,leftPts.length,rightPts.length)/Math.max(1,Math.min(48,Math.round(Math.min(rw,rh)/4)));
  const areaRatio=area/Math.max(1,regionArea);
  const confidence=Math.max(0,Math.min(1,Math.min(1,support)*Math.min(1,areaRatio/0.72)));
  if(!inside||areaRatio<0.48||confidence<0.58) return { quad:null, confidence };
  return { quad:quad.map(point=>({x:point.x/width,y:point.y/height})), confidence };
}
function affineFromTriangles(s,d) {
  const [s0,s1,s2]=s,[d0,d1,d2]=d;
  const den=s0.x*(s1.y-s2.y)+s1.x*(s2.y-s0.y)+s2.x*(s0.y-s1.y);
  if(Math.abs(den)<1e-8)return null;
  const a=(d0.x*(s1.y-s2.y)+d1.x*(s2.y-s0.y)+d2.x*(s0.y-s1.y))/den;
  const c=(d0.x*(s2.x-s1.x)+d1.x*(s0.x-s2.x)+d2.x*(s1.x-s0.x))/den;
  const e=(d0.x*(s1.x*s2.y-s2.x*s1.y)+d1.x*(s2.x*s0.y-s0.x*s2.y)+d2.x*(s0.x*s1.y-s1.x*s0.y))/den;
  const b=(d0.y*(s1.y-s2.y)+d1.y*(s2.y-s0.y)+d2.y*(s0.y-s1.y))/den;
  const dcoef=(d0.y*(s2.x-s1.x)+d1.y*(s0.x-s2.x)+d2.y*(s1.x-s0.x))/den;
  const f=(d0.y*(s1.x*s2.y-s2.x*s1.y)+d1.y*(s2.x*s0.y-s0.x*s2.y)+d2.y*(s0.x*s1.y-s1.x*s0.y))/den;
  return {a,b,c,d:dcoef,e,f};
}
function drawTriangle(ctx, bitmap, source, dest) {
  const matrix=affineFromTriangles(source,dest); if(!matrix)return;
  ctx.save();
  ctx.beginPath(); ctx.moveTo(dest[0].x,dest[0].y); ctx.lineTo(dest[1].x,dest[1].y); ctx.lineTo(dest[2].x,dest[2].y); ctx.closePath(); ctx.clip();
  ctx.setTransform(matrix.a,matrix.b,matrix.c,matrix.d,matrix.e,matrix.f);
  ctx.drawImage(bitmap,0,0);
  ctx.restore();
}
function bilinearQuad(quad,u,v) {
  const [tl,tr,br,bl]=quad;
  return {
    x:(1-u)*(1-v)*tl.x+u*(1-v)*tr.x+u*v*br.x+(1-u)*v*bl.x,
    y:(1-u)*(1-v)*tl.y+u*(1-v)*tr.y+u*v*br.y+(1-u)*v*bl.y
  };
}
function warpPerspectiveMesh(bitmap, quadNormalized, region) {
  const quad=quadNormalized.map(point=>({x:point.x*bitmap.width,y:point.y*bitmap.height}));
  const top=Math.hypot(quad[1].x-quad[0].x,quad[1].y-quad[0].y), bottom=Math.hypot(quad[2].x-quad[3].x,quad[2].y-quad[3].y);
  const left=Math.hypot(quad[3].x-quad[0].x,quad[3].y-quad[0].y), right=Math.hypot(quad[2].x-quad[1].x,quad[2].y-quad[1].y);
  const size=bounded(Math.max(top,bottom),Math.max(left,right),OUTPUT_MAX_EDGE);
  const canvas=makeCanvas(size.width,size.height),ctx=canvas.getContext('2d',{alpha:false});
  ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);
  const grid=12;
  for(let gy=0;gy<grid;gy+=1){
    for(let gx=0;gx<grid;gx+=1){
      const u0=gx/grid,u1=(gx+1)/grid,v0=gy/grid,v1=(gy+1)/grid;
      const s00=bilinearQuad(quad,u0,v0),s10=bilinearQuad(quad,u1,v0),s11=bilinearQuad(quad,u1,v1),s01=bilinearQuad(quad,u0,v1);
      const d00={x:u0*canvas.width,y:v0*canvas.height},d10={x:u1*canvas.width,y:v0*canvas.height},d11={x:u1*canvas.width,y:v1*canvas.height},d01={x:u0*canvas.width,y:v1*canvas.height};
      drawTriangle(ctx,bitmap,[s00,s10,s11],[d00,d10,d11]);
      drawTriangle(ctx,bitmap,[s00,s11,s01],[d00,d11,d01]);
    }
  }
  return canvas;
}
function cropCanvas(bitmap, region) {
  const left=Math.floor(clamp01(region.left)*bitmap.width),top=Math.floor(clamp01(region.top)*bitmap.height);
  const right=Math.max(left+1,Math.ceil(clamp01(region.right)*bitmap.width)),bottom=Math.max(top+1,Math.ceil(clamp01(region.bottom)*bitmap.height));
  const size=bounded(right-left,bottom-top,OUTPUT_MAX_EDGE);
  const canvas=makeCanvas(size.width,size.height),ctx=canvas.getContext('2d',{alpha:false});
  ctx.drawImage(bitmap,left,top,right-left,bottom-top,0,0,size.width,size.height);
  return canvas;
}
function rotateCanvas(source, degrees) {
  const normalized=((degrees%360)+360)%360;
  if(Math.abs(normalized)<0.01)return source;
  const rad=degrees*Math.PI/180,cos=Math.abs(Math.cos(rad)),sin=Math.abs(Math.sin(rad));
  const width=Math.ceil(source.width*cos+source.height*sin),height=Math.ceil(source.width*sin+source.height*cos);
  const canvas=makeCanvas(width,height),ctx=canvas.getContext('2d',{alpha:false});
  ctx.fillStyle='#fff';ctx.fillRect(0,0,width,height);
  ctx.translate(width/2,height/2);ctx.rotate(rad);ctx.drawImage(source,-source.width/2,-source.height/2);
  return canvas;
}
function canvasBlob(canvas) {
  return new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(new Error('图片处理失败')),'image/jpeg',OUTPUT_QUALITY));
}
async function processFile(file, options) {
  const bitmap=await decodeBitmap(file,2800);
  try {
    const base=options.perspectiveQuad ? warpPerspectiveMesh(bitmap,options.perspectiveQuad,options.region) : cropCanvas(bitmap,options.region);
    const rotated=rotateCanvas(base,options.quarterTurns*90 + options.deskewDegrees);
    let output=rotated;
    if(Math.max(rotated.width,rotated.height)>OUTPUT_MAX_EDGE){
      const size=bounded(rotated.width,rotated.height,OUTPUT_MAX_EDGE); const scaled=makeCanvas(size.width,size.height); scaled.getContext('2d',{alpha:false}).drawImage(rotated,0,0,size.width,size.height); output=scaled;
    }
    const blob=await canvasBlob(output);
    const stem=String(file.name||'image').replace(/\.[^.]+$/,'');
    return new File([blob],`${stem}-ocr-crop.jpg`,{type:'image/jpeg',lastModified:Date.now()});
  } finally { bitmap.close?.(); }
}
function installStyles(){
  if(document.head.querySelector('style[data-lb-gallery-preprocess]'))return;
  const style=document.createElement('style');style.dataset.lbGalleryPreprocess='1';style.textContent=`
  .lb-img-pre{position:fixed;inset:0;z-index:16000;display:grid;place-items:center;padding:12px;background:rgba(0,0,0,.82)}
  .lb-img-pre__panel{width:min(920px,100%);max-height:96dvh;overflow:auto;padding:14px;border:1px solid rgba(194,157,83,.45);border-radius:14px;background:#151515;color:#f5efe3}
  .lb-img-pre__head{display:flex;justify-content:space-between;gap:12px;align-items:flex-start}.lb-img-pre__head h2{margin:0;font-size:18px}.lb-img-pre__head p{margin:4px 0 0;color:#aaa;font-size:11px;line-height:1.5}
  .lb-img-pre__stage{position:relative;width:max-content;max-width:100%;margin:12px auto;touch-action:none;cursor:crosshair}.lb-img-pre__stage img{display:block;max-width:100%;max-height:62dvh;border-radius:8px;pointer-events:none}.lb-img-pre__sel{position:absolute;box-sizing:border-box;border:2px solid #d0a85a;background:rgba(208,168,90,.08);box-shadow:0 0 0 9999px rgba(0,0,0,.28);pointer-events:none}
  .lb-img-pre__tools,.lb-img-pre__actions{display:flex;flex-wrap:wrap;gap:8px}.lb-img-pre button{min-height:38px;border-radius:9px;border:1px solid rgba(208,168,90,.38);background:#242424;color:#e8d9b8;padding:7px 11px;font-weight:700}.lb-img-pre button.primary{background:#b99148;color:#111;border-color:#b99148}.lb-img-pre__status{min-height:20px;margin:8px 0;color:#aaa;font-size:11px}.lb-img-pre__actions{justify-content:flex-end;margin-top:10px}
  `;document.head.append(style);
}
async function openDialog(file){
  installStyles();
  const bitmap=await decodeBitmap(file,PREVIEW_MAX_EDGE);
  const analysis=imageDataForAnalysis(bitmap);
  const previewBlob=await new Promise((resolve,reject)=>analysis.canvas.toBlob(blob=>blob?resolve(blob):reject(new Error('预览生成失败')),'image/jpeg',0.8));
  bitmap.close?.();
  const url=URL.createObjectURL(previewBlob);
  return new Promise(resolve=>{
    const overlay=document.createElement('div');overlay.className='lb-img-pre';
    overlay.innerHTML=`<section class="lb-img-pre__panel"><div class="lb-img-pre__head"><div><h2>裁切识别范围</h2><p>上传图片先保留有效文字区域；可自动校正轻微倾斜，检测到可靠四边时可做透视修正。拍照入口不经过此步骤。</p></div></div><div class="lb-img-pre__stage"><img alt="待裁切图片"><div class="lb-img-pre__sel"></div></div><div class="lb-img-pre__tools"><button data-rot-l>左转 90°</button><button data-rot-r>右转 90°</button><button data-deskew>自动角度校正</button><button data-perspective>自动透视修正</button><button data-reset>重置</button></div><p class="lb-img-pre__status">拖动框选需要识别的区域</p><div class="lb-img-pre__actions"><button data-cancel>取消</button><button class="primary" data-confirm>使用该区域</button></div></section>`;
    document.body.append(overlay);
    const image=overlay.querySelector('img'),stage=overlay.querySelector('.lb-img-pre__stage'),sel=overlay.querySelector('.lb-img-pre__sel'),status=overlay.querySelector('.lb-img-pre__status');image.src=url;
    let region={left:0,top:0,right:1,bottom:1},quarterTurns=0,deskewDegrees=0,perspectiveQuad=null,pointer=null,start={x:0,y:0};
    const finish=value=>{URL.revokeObjectURL(url);overlay.remove();resolve(value);};
    const showRegion=()=>{const r=image.getBoundingClientRect();sel.style.left=`${region.left*r.width}px`;sel.style.top=`${region.top*r.height}px`;sel.style.width=`${(region.right-region.left)*r.width}px`;sel.style.height=`${(region.bottom-region.top)*r.height}px`;};
    image.addEventListener('load',showRegion,{once:true});
    const point=e=>{const r=image.getBoundingClientRect();return{x:clamp01((e.clientX-r.left)/r.width),y:clamp01((e.clientY-r.top)/r.height)};};
    stage.addEventListener('pointerdown',e=>{if(e.button>0)return;pointer=e.pointerId;start=point(e);stage.setPointerCapture?.(e.pointerId);e.preventDefault();});
    stage.addEventListener('pointermove',e=>{if(pointer!==e.pointerId)return;const p=point(e);region={left:Math.min(start.x,p.x),top:Math.min(start.y,p.y),right:Math.max(start.x,p.x),bottom:Math.max(start.y,p.y)};showRegion();e.preventDefault();});
    const stop=e=>{if(pointer!==e.pointerId)return;pointer=null;const span=(region.right-region.left)*(region.bottom-region.top);if(span<0.01){region={left:0,top:0,right:1,bottom:1};showRegion();}perspectiveQuad=null;e.preventDefault();};stage.addEventListener('pointerup',stop);stage.addEventListener('pointercancel',stop);
    overlay.querySelector('[data-rot-l]').onclick=()=>{quarterTurns=(quarterTurns+3)%4;deskewDegrees=0;status.textContent=`将左转 90° × ${quarterTurns===3?1:quarterTurns}`;};
    overlay.querySelector('[data-rot-r]').onclick=()=>{quarterTurns=(quarterTurns+1)%4;deskewDegrees=0;status.textContent=`将右转 ${quarterTurns*90}°`;};
    overlay.querySelector('[data-deskew]').onclick=()=>{if(quarterTurns!==0){status.textContent='已设置 90° 旋转时不叠加自动小角度校正';return;}const result=estimateDeskew(analysis.imageData,region);deskewDegrees=result.confidence>=0.18?result.angle:0;status.textContent=deskewDegrees?`自动角度校正：${deskewDegrees.toFixed(1)}°（置信度 ${Math.round(result.confidence*100)}%）`:'未检测到可靠的倾斜角度';};
    overlay.querySelector('[data-perspective]').onclick=()=>{const result=detectPerspectiveQuad(analysis.imageData,region);perspectiveQuad=result.quad;status.textContent=perspectiveQuad?`检测到可靠四边，已启用透视修正（置信度 ${Math.round(result.confidence*100)}%）`:`未检测到可靠四边，保持普通矩形裁切（置信度 ${Math.round(result.confidence*100)}%）`;};
    overlay.querySelector('[data-reset]').onclick=()=>{region={left:0,top:0,right:1,bottom:1};quarterTurns=0;deskewDegrees=0;perspectiveQuad=null;showRegion();status.textContent='已重置';};
    overlay.querySelector('[data-cancel]').onclick=()=>finish(null);
    overlay.querySelector('[data-confirm]').onclick=async()=>{const button=overlay.querySelector('[data-confirm]');button.disabled=true;status.textContent='正在生成 OCR 专用裁切图…';try{const processed=await processFile(file,{region,quarterTurns,deskewDegrees,perspectiveQuad});finish(processed);}catch(error){button.disabled=false;status.textContent=`处理失败：${error?.message||error}`;}};
  });
}
async function preprocessFiles(files){
  const output=[];
  for(const file of files){const processed=await openDialog(file);if(processed)output.push(processed);}
  return output;
}
function installGalleryInterceptor(){
  document.addEventListener('change',async event=>{
    const input=event.target;
    if(!(input instanceof HTMLInputElement)||input.id!=='bagGalleryInput'||input.dataset.lbPreprocessed==='1')return;
    if(typeof DataTransfer!=='function')return;
    const files=[...(input.files||[])].filter(file=>file.type.startsWith('image/'));
    if(!files.length)return;
    event.preventDefault();event.stopImmediatePropagation();
    input.value='';
    try{
      const processed=await preprocessFiles(files);
      if(!processed.length)return;
      const transfer=new DataTransfer();processed.forEach(file=>transfer.items.add(file));
      input.dataset.lbPreprocessed='1';input.files=transfer.files;input.dispatchEvent(new Event('change',{bubbles:true}));
    } finally { delete input.dataset.lbPreprocessed; }
  },true);
}
installGalleryInterceptor();
globalThis.LuckyBeanGalleryImagePreprocess=Object.freeze({openDialog,preprocessFiles,estimateDeskew,detectPerspectiveQuad});
