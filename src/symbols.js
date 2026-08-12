/* =========================================================
   奇幻地图 / symbols — 象形符号（绘地图样式）
   山/丘/针叶树/阔叶树/棕榈/沙丘/沼泽/冰川
   ========================================================= */
(function(root){
"use strict";
const NS = root.FMAP = root.FMAP || {};
const C = NS.core, B = NS.biome, SY = NS.style;
const {clamp} = C;
const BI = B.BIOME;

function blockPeaks(rng){ return rng(); }
function fitHalfWidth(ctx,text,hw){
  if(!ctx.measureText) return text;
  let t=text;
  while(t.length>1&&ctx.measureText(t).width>hw*2) t=t.slice(0,-1);
  return t;
}
function scatter(rng,cells,n){
  const out=[];
  for(const i of cells){ if(out.length>=n)break; if(rng()<0.5)out.push(i); }
  return out;
}

/* 山峰符号 */
function mountainGlyph(ctx,x,y,s,snowy,ink,light,shade){
  const w=s*1.30;
  ctx.beginPath();
  ctx.moveTo(x-w,y);
  ctx.lineTo(x-s*0.30,y-s*0.82);
  ctx.lineTo(x-s*0.06,y-s);
  ctx.lineTo(x+s*0.36,y-s*0.74);
  ctx.lineTo(x+w,y);
  ctx.closePath();
  ctx.fillStyle=light; ctx.fill();
  ctx.beginPath();
  ctx.moveTo(x-s*0.06,y-s);
  ctx.lineTo(x+s*0.36,y-s*0.74);
  ctx.lineTo(x+w,y);
  ctx.lineTo(x-s*0.06,y);
  ctx.closePath();
  ctx.fillStyle=shade; ctx.fill();
  ctx.strokeStyle=shade; ctx.lineWidth=Math.max(0.3,s*0.055);
  for(let k=1;k<=3;k++){
    const t=k/4;
    ctx.beginPath();
    ctx.moveTo(x-s*0.06+ (w+s*0.06)*t*0.25, y-s+(s)*t*0.55);
    ctx.lineTo(x-s*0.06+ (w+s*0.06)*t, y);
    ctx.stroke();
  }
  if(snowy){
    ctx.beginPath();
    ctx.moveTo(x-s*0.30,y-s*0.82);
    ctx.lineTo(x-s*0.06,y-s);
    ctx.lineTo(x+s*0.36,y-s*0.74);
    ctx.lineTo(x+s*0.16,y-s*0.62);
    ctx.lineTo(x+s*0.02,y-s*0.74);
    ctx.lineTo(x-s*0.14,y-s*0.60);
    ctx.closePath();
    ctx.fillStyle='rgba(255,255,255,.92)'; ctx.fill();
  }
  ctx.beginPath();
  ctx.moveTo(x-w,y);
  ctx.lineTo(x-s*0.30,y-s*0.82);
  ctx.lineTo(x-s*0.06,y-s);
  ctx.lineTo(x+s*0.36,y-s*0.74);
  ctx.lineTo(x+w,y);
  ctx.strokeStyle=ink; ctx.lineWidth=Math.max(0.4,s*0.10);
  ctx.lineJoin='round'; ctx.lineCap='round';
  ctx.stroke();
}
function hillGlyph(ctx,x,y,s,ink,fill){
  ctx.beginPath();
  ctx.moveTo(x-s,y);
  ctx.quadraticCurveTo(x-s*0.35,y-s*0.95,x,y-s*0.72);
  ctx.quadraticCurveTo(x+s*0.55,y-s*0.42,x+s,y);
  ctx.closePath();
  ctx.fillStyle=fill; ctx.fill();
  ctx.strokeStyle=ink; ctx.lineWidth=Math.max(0.3,s*0.11); ctx.stroke();
}
function coniferGlyph(ctx,x,y,s,ink,fill){
  ctx.strokeStyle=ink; ctx.lineWidth=Math.max(0.3,s*0.16); ctx.lineCap='round';
  ctx.beginPath(); ctx.moveTo(x,y); ctx.lineTo(x,y-s*0.30); ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x-s*0.55,y-s*0.26);
  ctx.lineTo(x,y-s*1.12);
  ctx.lineTo(x+s*0.55,y-s*0.26);
  ctx.closePath();
  ctx.fillStyle=fill; ctx.fill(); ctx.stroke();
}
function broadleafGlyph(ctx,x,y,s,ink,fill){
  ctx.strokeStyle=ink; ctx.lineWidth=Math.max(0.3,s*0.13); ctx.lineCap='round';
  ctx.beginPath(); ctx.moveTo(x,y); ctx.lineTo(x,y-s*0.38); ctx.stroke();
  ctx.beginPath(); ctx.arc(x,y-s*0.62,s*0.5,0,Math.PI*2);
  ctx.fillStyle=fill; ctx.fill(); ctx.stroke();
}
function palmGlyph(ctx,x,y,s,ink,fill){
  ctx.strokeStyle=ink; ctx.lineWidth=Math.max(0.3,s*0.13); ctx.lineCap='round';
  ctx.beginPath(); ctx.moveTo(x,y); ctx.quadraticCurveTo(x+s*0.15,y-s*0.5,x+s*0.1,y-s*0.9); ctx.stroke();
  for(let k=0;k<5;k++){
    const a=-Math.PI*0.85+k*Math.PI*0.28;
    ctx.beginPath();
    ctx.moveTo(x+s*0.1,y-s*0.9);
    ctx.quadraticCurveTo(x+s*0.1+Math.cos(a)*s*0.5,y-s*0.9+Math.sin(a)*s*0.35,
                         x+s*0.1+Math.cos(a)*s*0.75,y-s*0.9+Math.sin(a)*s*0.62);
    ctx.stroke();
  }
}
function duneGlyph(ctx,x,y,s,ink){
  ctx.strokeStyle=ink; ctx.lineWidth=Math.max(0.3,s*0.1); ctx.lineCap='round';
  ctx.beginPath();
  ctx.moveTo(x-s,y);
  ctx.quadraticCurveTo(x-s*0.3,y-s*0.5,x+s*0.2,y-s*0.2);
  ctx.quadraticCurveTo(x+s*0.6,y-s*0.02,x+s,y-s*0.14);
  ctx.stroke();
}
function marshGlyph(ctx,x,y,s,ink){
  ctx.strokeStyle=ink; ctx.lineWidth=Math.max(0.3,s*0.1); ctx.lineCap='round';
  for(const dx of [-0.4,0,0.4]){
    ctx.beginPath();
    ctx.moveTo(x+dx*s,y);
    ctx.quadraticCurveTo(x+dx*s-s*0.1,y-s*0.5,x+dx*s+s*0.12,y-s*0.8);
    ctx.stroke();
  }
}
function iceGlyph(ctx,x,y,s,ink){
  ctx.strokeStyle=ink; ctx.lineWidth=Math.max(0.3,s*0.1);
  ctx.beginPath();
  ctx.moveTo(x-s*0.8,y);
  ctx.lineTo(x-s*0.3,y-s*0.7);
  ctx.lineTo(x+s*0.1,y-s*0.3);
  ctx.lineTo(x+s*0.5,y-s*0.85);
  ctx.lineTo(x+s*0.8,y);
  ctx.closePath();
  ctx.stroke();
}

/* 绘地图底图（柔和淡彩 + 不画阴影） */
function renderPictorialBase(ctx,cw,ch,G,P,ST){
  const {gw,gh,biome,elev,sea}=G;
  const off=document.createElement('canvas'); off.width=gw; off.height=gh;
  const octx=off.getContext('2d');
  const img=octx.createImageData(gw,gh);
  const PAL=ST.pal;
  const invSea=1/(1-sea), invSeaD=1/Math.max(0.001,sea*0.85);
  for(let i=0;i<gw*gh;i++){
    const b=biome[i], c=PAL[b];
    let r=c[0],g=c[1],bl=c[2];
    const x=i%gw, y=(i/gw)|0, e=elev[i];
    if(b>=B.LAND_MIN){
      const h=(e-sea)*invSea;
      // 柔和的明度渐变代替阴影
      const f=0.94+0.10*clamp(h,0,1);
      r*=f; g*=f; bl*=f;
      const tx=(C.vnoise(x*0.31,y*0.23)-0.5)*0.05;
      r*=1+tx; g*=1+tx; bl*=1+tx;
    } else if(b<=BI.SHALLOW){
      const dd=clamp((sea-e)*invSeaD,0,1);
      r*=1-0.16*dd; g*=1-0.12*dd; bl*=1-0.05*dd;
    }
    const j=i*4;
    img.data[j]=clamp(r,0,255); img.data[j+1]=clamp(g,0,255); img.data[j+2]=clamp(bl,0,255); img.data[j+3]=255;
  }
  octx.putImageData(img,0,0);
  ctx.imageSmoothingEnabled=true; ctx.imageSmoothingQuality='high';
  ctx.drawImage(off,0,0,cw,ch);
}

/* 绘制全部象形符号 */
function drawSymbols(ctx,cw,ch,G,P,ST){
  const {gw,gh,biome,elev,sea}=G;
  const sx=cw/gw, sy=ch/gh, unit=cw/1000;
  const ink=ST.ink;
  const rnd=C.makeRng(P.seed^0x51ab80);
  const invSea=1/(1-sea);
  const step=Math.max(2,Math.round(gw/110));
  const sBase=unit*5.2;

  const forestFill=ST.id==='sumi'?'rgba(60,64,66,.85)':(ST.id==='antique'?'#5a6838':'#4a6b46');
  const mtnLight=ST.id==='sumi'?'rgba(200,202,204,.9)':(ST.id==='antique'?'#cdb894':'#e0d7c0');
  const mtnShade=ST.id==='sumi'?'rgba(120,124,128,.9)':(ST.id==='antique'?'#9a8260':'#a89878');
  const hillFill=ST.id==='sumi'?'rgba(150,154,158,.7)':(ST.id==='antique'?'#b8a57e':'#c9bb96');

  for(let y=step;y<gh-step;y+=step){
    for(let x=step;x<gw-step;x+=step){
      const i=y*gw+x;
      const b=biome[i];
      if(b<B.LAND_MIN) continue;
      // 抖动位置，避免机械网格感
      const jx=(C.vnoise(x*0.7,y*0.7)-0.5)*step*0.8;
      const jy=(C.vnoise(x*0.7+9,y*0.7+9)-0.5)*step*0.8;
      const px=(x+0.5+jx)*sx, py=(y+0.5+jy)*sy;
      const h=(elev[i]-sea)*invSea;
      const s=sBase*(0.7+C.vnoise(x*0.13,y*0.13)*0.6);

      if(b===BI.SNOW) mountainGlyph(ctx,px,py,s*1.15,true,ink,mtnLight,mtnShade);
      else if(b===BI.ROCK) mountainGlyph(ctx,px,py,s,false,ink,mtnLight,mtnShade);
      else if(b===BI.ICE) iceGlyph(ctx,px,py,s,ink);
      else if(b===BI.TAIGA) coniferGlyph(ctx,px,py,s*0.9,ink,forestFill);
      else if(b===BI.FOREST) broadleafGlyph(ctx,px,py,s*0.9,ink,forestFill);
      else if(b===BI.RAINFOREST) palmGlyph(ctx,px,py,s*0.95,ink,forestFill);
      else if(b===BI.DESERT){ if(h<0.3) duneGlyph(ctx,px,py,s*0.8,ink); }
      else if(b===BI.WETLAND) marshGlyph(ctx,px,py,s*0.8,ink);
      else if(b===BI.TUNDRA){ if(h>0.3) hillGlyph(ctx,px,py,s*0.7,ink,hillFill); }
      else if(h>0.42&&h<=0.62) hillGlyph(ctx,px,py,s*0.85,ink,hillFill);
    }
  }
}

NS.symbols={drawSymbols,renderPictorialBase,mountainGlyph,hillGlyph,coniferGlyph,
            broadleafGlyph,palmGlyph,duneGlyph,marshGlyph,iceGlyph};
})(typeof self!=='undefined'?self:this);
