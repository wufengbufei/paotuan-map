/* =========================================================
   奇幻地图 / render — Canvas 渲染（栅格/扁平/线画）
   ========================================================= */
(function(root){
"use strict";
const NS = root.FMAP = root.FMAP || {};
const C = NS.core, B = NS.biome, SY = NS.style;
const {clamp} = C;
const BI = B.BIOME;
const isLandB = b=>b>=B.LAND_MIN||b===BI.RIVER;

const toDisplay=(pts,sx,sy)=>pts.map(p=>[(p[0]+0.5)*sx,(p[1]+0.5)*sy]);

function regionLoops(G,pred,sx,sy,smooth){
  return C.contourMask(i=>pred(G.biome[i]),G.gw,G.gh)
    .filter(l=>l.length>=8)
    .map(l=>toDisplay(C.chaikin(l,smooth==null?1:smooth,true),sx,sy));
}

function landLoops(G,sx,sy,clip,mode){
  mode=mode||'crisp';
  const key=[G.gw,G.gh,G.sea,G._rev||0,clip?1:0,mode].join('|');
  if(!G._coast) G._coast={};
  if(!G._coast[key]){
    G._coast={};
    const gw=G.gw, gh=G.gh;
    let chains;
    if(mode==='smooth'){
      const elev=G.elev;
      chains=C.contourLevel((x,y)=>elev[y*gw+x],gw,gh,{interp:true,level:G.sea,clip:!!clip})
        .map(o=>({pts:C.chaikin(o.pts,1,o.closed),closed:o.closed}));
    } else {
      const bio=G.biome;
      chains=C.contourLevel((x,y)=>isLandB(bio[y*gw+x])?1:0,gw,gh,
        {interp:false,level:0.5,clip:!!clip})
        .map(o=>({pts:C.chaikin(o.pts,2,o.closed),closed:o.closed}));
    }
    G._coast[key]=chains.filter(o=>o.pts.length>=6);
  }
  return G._coast[key].map(o=>({pts:toDisplay(o.pts,sx,sy),closed:o.closed}));
}
function landFills(G,sx,sy,mode){ return landLoops(G,sx,sy,false,mode).map(o=>o.pts); }
function tracePath(ctx,loop,close){
  ctx.moveTo(loop[0][0],loop[0][1]);
  for(let i=1;i<loop.length;i++) ctx.lineTo(loop[i][0],loop[i][1]);
  if(close!==false) ctx.closePath();
}
function strokeLoops(ctx,loops,color,width,close){
  if(!loops.length)return;
  ctx.strokeStyle=color; ctx.lineWidth=width; ctx.lineJoin='round'; ctx.lineCap='round';
  ctx.beginPath();
  loops.forEach(l=>tracePath(ctx,l,close));
  ctx.stroke();
}
function fillLoops(ctx,loops,color){
  if(!loops.length)return;
  ctx.fillStyle=color;
  ctx.beginPath();
  loops.forEach(l=>tracePath(ctx,l,true));
  ctx.fill('evenodd');
}

/* 山体阴影（西北光） */
function shadeAt(x,y,F){
  const {gw,gh,elev}=F; const gm=F.gradMul||1;
  const xl=x>0?x-1:0, xr=x<gw-1?x+1:gw-1, yu=y>0?y-1:0, yd=y<gh-1?y+1:gh-1;
  const dzdx=(elev[y*gw+xr]-elev[y*gw+xl])*gm;
  const dzdy=(elev[yd*gw+x]-elev[yu*gw+x])*gm;
  const nl=(-dzdx-dzdy)*0.707;
  return clamp(0.5+nl*8.5,0,1);
}
const vnoise=C.vnoise;

/* ---------- 栅格渲染 ---------- */
function renderRaster(ctx,cw,ch,G,P,ST,F){
  if(ctx.isSVG){ renderVectorFills(ctx,cw,ch,G,P,ST); return; }
  F=F||G;
  const {gw,gh,biome,elev,sea}=F;
  // 2K 级超采样渲染，放大到 600% 仍然锐利
  const ss=6;
  const off=document.createElement('canvas'); off.width=gw*ss; off.height=gh*ss;
  const octx=off.getContext('2d');
  const img=octx.createImageData(gw*ss,gh*ss);
  const PAL=ST.pal;
  const shadeOn=P.features.shade&&ST.shade;
  const invSea=1/(1-sea), invSeaD=1/Math.max(0.001,sea*0.85);
  const mono=ST.id==='sumi';
  const fgw=gw*ss, fgh=gh*ss;
  for(let fy=0;fy<fgh;fy++){
    for(let fx=0;fx<fgw;fx++){
      const cx=(fx+0.5)/ss-0.5, cy=(fy+0.5)/ss-0.5;
      const i=Math.floor(cx)+Math.floor(cy)*gw;
      const bi=Math.min(i,biome.length-1);const b=biome[Math.max(0,bi)]||0;
      const c=PAL[b];
      let r=c[0],g=c[1],bl=c[2];
      const nx=fx/fgw, ny=fy/fgh;
      const e=C.sampleBilinear(elev,gw,gh,cx,cy);
      if(b>=B.LAND_MIN){
        const h=(e-sea)*invSea;
        if(shadeOn){ const f=0.72+0.52*shadeAt(Math.floor(cx),Math.floor(cy),F); r*=f; g*=f; bl*=f; }
        if(ST.texture!=='none'){
          const tx=(vnoise(nx*78,ny*58)-0.5)*(mono?0.045:0.075);
          r*=1+tx; g*=1+tx; bl*=1+tx;
        }
        if(ST.haze){
          const haze=clamp((h-0.66)/0.34,0,1)*0.17;
          r+=(230-r)*haze; g+=(234-g)*haze; bl+=(236-bl)*haze;
          const low=clamp((0.18-h)/0.18,0,1)*0.06;
          r*=1-low; g*=1-low*0.8; bl*=1-low*0.6;
        }
      } else if(b<=BI.SHALLOW){
        const dd=clamp((sea-e)*invSeaD,0,1);
        if(ST.id==='antique'){ r*=1-0.05*dd; g*=1-0.05*dd; bl*=1-0.06*dd; }
        else if(mono){ r*=1-0.16*dd; g*=1-0.15*dd; bl*=1-0.14*dd; }
        else {
          r*=1-0.34*dd; g*=1-0.26*dd; bl*=1-0.10*dd;
          const tw=(vnoise(nx*46,ny*34)-0.5)*0.035; r*=1+tw; g*=1+tw; bl*=1+tw;
        }
        const icf=F.seaice?C.sampleBilinear(F.seaice,gw,gh,cx,cy):0;
        if(icf>0.03&&ST.ice){
          const IC=ST.ice;
          const tex=(vnoise(nx*92,ny*70)-0.5)*0.10+(vnoise(nx*220,ny*180)-0.5)*0.05;
          const a=clamp(icf*1.12,0,1)*IC.a;
          r+=(IC.col[0]*(1+tex)-r)*a;
          g+=(IC.col[1]*(1+tex)-g)*a;
          bl+=(IC.col[2]*(1+tex*0.7)-bl)*a;
        }
      }
      const j=(fy*fgw+fx)*4;
      img.data[j]=clamp(r,0,255); img.data[j+1]=clamp(g,0,255); img.data[j+2]=clamp(bl,0,255); img.data[j+3]=255;
    }
  }
  octx.putImageData(img,0,0);
  ctx.imageSmoothingEnabled=true; ctx.imageSmoothingQuality='high';
  ctx.drawImage(off,0,0,cw,ch);
}

/* ---------- 扁平 ---------- */
function renderFlat(ctx,cw,ch,G,P,ST,F){
  if(ctx.isSVG){ renderVectorTiers(ctx,cw,ch,G,P,ST); return; }
  F=F||G;
  const {gw,gh,sea,biome,elev,lakeMask}=F;
  const off=document.createElement('canvas'); off.width=gw; off.height=gh;
  const octx=off.getContext('2d'); const img=octx.createImageData(gw,gh);
  const T=ST.tier;
  for(let i=0;i<gw*gh;i++){
    let c;
    const b=biome[i];
    if(b===BI.SNOW||b===BI.ICE) c=T[6];
    else if(b===BI.LAKE) c=T[5];
    else { const t=B.elevTier(elev[i],sea,b===BI.LAKE); c=T[t<0?5:t]; }
    let r=c[0],g=c[1],bl=c[2];
    const icf=(F.seaice&&b<=BI.SHALLOW)?F.seaice[i]:0;
    if(icf>0.03&&ST.ice){
      const a=Math.min(1,icf*1.1)*ST.ice.a;
      r+=(ST.ice.col[0]-r)*a; g+=(ST.ice.col[1]-g)*a; bl+=(ST.ice.col[2]-bl)*a;
    }
    const j=i*4; img.data[j]=r; img.data[j+1]=g; img.data[j+2]=bl; img.data[j+3]=255;
  }
  octx.putImageData(img,0,0);
  ctx.imageSmoothingEnabled=true; ctx.imageSmoothingQuality='high';
  ctx.drawImage(off,0,0,cw,ch);
}

/* ---------- 矢量面填色（SVG 导出用） ---------- */
const VECTOR_LAYERS=[
  ['ocean-deep', b=>b<=BI.SEA,        BI.SEA],
  ['ocean-shelf',b=>b===BI.SHALLOW,   BI.SHALLOW],
  ['land',       isLandB,             BI.BEACH],
  ['savanna',    b=>b===BI.SAVANNA,   BI.SAVANNA],
  ['steppe',     b=>b===BI.STEPPE,    BI.STEPPE],
  ['grass',      b=>b===BI.GRASS,     BI.GRASS],
  ['shrub',      b=>b===BI.SHRUB,     BI.SHRUB],
  ['desert',     b=>b===BI.DESERT,    BI.DESERT],
  ['wetland',    b=>b===BI.WETLAND,   BI.WETLAND],
  ['taiga',      b=>b===BI.TAIGA,     BI.TAIGA],
  ['forest',     b=>b===BI.FOREST,    BI.FOREST],
  ['rainforest', b=>b===BI.RAINFOREST,BI.RAINFOREST],
  ['tundra',     b=>b===BI.TUNDRA,    BI.TUNDRA],
  ['rock',       b=>b===BI.ROCK,      BI.ROCK],
  ['snow',       b=>b===BI.SNOW,      BI.SNOW],
  ['ice',        b=>b===BI.ICE,       BI.ICE],
  ['beach',      b=>b===BI.BEACH,     BI.BEACH],
  ['lake',       b=>b===BI.LAKE,      BI.LAKE]
];
function renderVectorFills(ctx,cw,ch,G,P,ST){
  const sx=cw/G.gw, sy=ch/G.gh;
  for(const [name,pred,bi] of VECTOR_LAYERS){
    const loops=regionLoops(G,pred,sx,sy,1);
    if(!loops.length) continue;
    if(ctx.group) ctx.group('biome-'+name);
    fillLoops(ctx,loops,SY.hex(ST.pal[bi]));
    if(ctx.endGroup) ctx.endGroup();
  }
}
function renderVectorTiers(ctx,cw,ch,G,P,ST){
  const sx=cw/G.gw, sy=ch/G.gh;
  const T=ST.tier;
  const tiers=[
    ['ocean', i=>G.elev[i]<G.sea-0.14, T[0]],
    ['shelf', i=>G.elev[i]>=G.sea-0.14&&G.elev[i]<G.sea, T[1]],
    ['lake',  i=>G.biome[i]===BI.LAKE, T[5]],
    ['low',   i=>{const b=G.biome[i]; if(!isLandB(b)||b===BI.LAKE)return false; const h=(G.elev[i]-G.sea)/(1-G.sea); return h<=0.28;}, T[2]],
    ['high',  i=>{const b=G.biome[i]; if(!isLandB(b)||b===BI.LAKE)return false; const h=(G.elev[i]-G.sea)/(1-G.sea); return h>0.28&&h<=0.60;}, T[3]],
    ['mtn',   i=>{const b=G.biome[i]; if(!isLandB(b))return false; const h=(G.elev[i]-G.sea)/(1-G.sea); return h>0.60&&b!==BI.SNOW&&b!==BI.ICE;}, T[4]],
    ['snow',  i=>G.biome[i]===BI.SNOW||G.biome[i]===BI.ICE, T[6]]
  ];
  for(const [name,pred,col] of tiers){
    const loops=C.contourMask(pred,G.gw,G.gh)
      .filter(l=>l.length>=8)
      .map(l=>toDisplay(C.chaikin(l,1,true),sx,sy));
    if(!loops.length) continue;
    if(ctx.group) ctx.group('tier-'+name);
    fillLoops(ctx,loops,SY.hex(col));
    if(ctx.endGroup) ctx.endGroup();
  }
}

/* ---------- 线画（等高线/白地图） ---------- */
function renderLine(ctx,cw,ch,G,P,ST){
  const {gw,gh,elev,sea}=G;
  const sx=cw/gw, sy=ch/gh, unit=cw/1000;
  if(ST.seaFill){
    ctx.fillStyle=ST.seaFill;
    fillLoops(ctx,landFills(G,sx,sy,'smooth').map(l=>l),'#000');
    // 先铺海面
    ctx.fillStyle=ST.seaFill; ctx.fillRect(0,0,cw,ch);
  }
  if(ST.contour){
    // 等高线
    const lv=[];
    for(let l=sea+0.04;l<0.98;l+=0.045) lv.push(l);
    lv.forEach((l,k)=>{
      const major=k%4===0;
      const chains=C.contourLevel((x,y)=>elev[y*gw+x],gw,gh,{interp:true,level:l,clip:true});
      const loops=chains.filter(o2=>o2.pts.length>=6)
        .map(o2=>toDisplay(C.chaikin(o2.pts,1,o2.closed),sx,sy));
      ctx.strokeStyle=major?ST.contour.major:ST.contour.color;
      ctx.lineWidth=(major?ST.contour.width*1.6:ST.contour.width)*unit;
      ctx.beginPath();
      loops.forEach(lp=>tracePath(ctx,lp,false));
      ctx.stroke();
    });
  }
}

/* ---------- 流冰面 ---------- */
function drawSeaIceFields(ctx,cw,ch,G,P,ST){
  if(!G.seaice||!ST.ice) return;
  const {gw,gh}=G, sx=cw/gw, sy=ch/gh;
  const IC=ST.ice;
  if(!G._iceSm){
    const src=G.seaice, tmp=new Float32Array(gw*gh), out=new Float32Array(gw*gh);
    const R=2;
    const wrapX=!!G.wrap;
    for(let y=0;y<gh;y++)for(let x=0;x<gw;x++){
      let a=0,c=0;
      for(let k=-R;k<=R;k++){
        let nx=x+k;
        if(wrapX){ nx=(nx+gw)%gw; } else if(nx<0||nx>=gw) continue;
        a+=src[y*gw+nx]; c++;
      }
      tmp[y*gw+x]=a/c;
    }
    for(let y=0;y<gh;y++)for(let x=0;x<gw;x++){
      let a=0,c=0;
      for(let k=-R;k<=R;k++){ const ny=y+k; if(ny<0||ny>=gh)continue; a+=tmp[ny*gw+x]; c++; }
      out[y*gw+x]=a/c;
    }
    G._iceSm=out;
  }
  const sm=G._iceSm;
  const loopsAt=(thr,minLen)=>C.contourMask(i=>sm[i]>thr,gw,gh)
    .filter(l=>l.length>=minLen)
    .map(l=>toDisplay(C.chaikin(l,2,true),sx,sy));
  const rgba=a=>`rgba(${IC.col[0]},${IC.col[1]},${IC.col[2]},${a.toFixed(2)})`;
  fillLoops(ctx,loopsAt(0.10,14),rgba(IC.a*0.40));
  fillLoops(ctx,loopsAt(0.42,14),rgba(IC.a*0.80));
}

/* ---------- 河川（锥形填充） ---------- */
function taperedFill(ctx,pts,wOf){
  if(pts.length<2)return;
  const L=[],R=[];
  for(let i=0;i<pts.length;i++){
    const p=pts[i];
    const a=pts[Math.max(0,i-1)], b=pts[Math.min(pts.length-1,i+1)];
    let dx=b[0]-a[0], dy=b[1]-a[1];
    const len=Math.hypot(dx,dy)||1;
    dx/=len; dy/=len;
    const w=wOf(p[2]||0)/2;
    L.push([p[0]-dy*w,p[1]+dx*w]);
    R.push([p[0]+dy*w,p[1]-dx*w]);
  }
  ctx.beginPath();
  ctx.moveTo(L[0][0],L[0][1]);
  for(let i=1;i<L.length;i++) ctx.lineTo(L[i][0],L[i][1]);
  for(let i=R.length-1;i>=0;i--) ctx.lineTo(R[i][0],R[i][1]);
  ctx.closePath();
}
function drawRivers(ctx,cw,ch,G,P,ST){
  if(!P.features.rivers||!G.rivers.length)return;
  const sx=cw/G.gw, sy=ch/G.gh, unit=cw/1000;
  const base=ST.river.width*unit;
  const wOf=w=>base*(0.42+1.85*w);
  ctx.save();
  ctx.fillStyle=ST.river.color;
  for(const r of G.rivers){
    if(r.length<3)continue;
    const pts=r.map(p=>[p[0]*sx,p[1]*sy,p[2]]);
    taperedFill(ctx,pts,wOf);
    ctx.fill();
  }
  ctx.restore();
}

/* ---------- 道路与航路 ---------- */
const ROUTE_STYLE={
  realistic:{road:'#6d5138',sea:'rgba(226,238,246,.62)'},
  antique:  {road:'#5f4326',sea:'rgba(74,52,30,.55)'},
  pictorial:{road:'#6b4a2c',sea:'rgba(52,84,104,.62)'},
  sumi:     {road:'rgba(40,40,40,.72)',sea:'rgba(238,236,228,.72)'},
  flat:     {road:'#8a6a4a',sea:'rgba(28,58,80,.78)'},
  contour:  {road:'#6a6a6a',sea:'rgba(120,120,120,.6)'},
  blank:    {road:'#9a9a9a',sea:'rgba(150,150,150,.6)'}
};
function routePts(pts,sx,sy){
  let p=pts.map(q=>[q[0]*sx,q[1]*sy]);
  p=C.chaikin(p,2);
  return p;
}
function strokePolyline(ctx,p){
  ctx.beginPath();
  ctx.moveTo(p[0][0],p[0][1]);
  for(let i=1;i<p.length;i++) ctx.lineTo(p[i][0],p[i][1]);
  ctx.stroke();
}
function drawRoutes(ctx,cw,ch,G,P,ST){
  const RS=ROUTE_STYLE[ST.id]||ROUTE_STYLE.antique;
  const sx=cw/G.gw, sy=ch/G.gh, unit=cw/1000;
  ctx.lineJoin='round'; ctx.lineCap='round';

  if(P.features.searoutes&&(G.searoutes||[]).length){
    ctx.strokeStyle=RS.sea;
    ctx.lineWidth=Math.max(0.9,unit*1.5);
    ctx.setLineDash([0.01,unit*3.6]);
    for(const r of G.searoutes){
      if(r.pts.length<3) continue;
      strokePolyline(ctx,routePts(r.pts,sx,sy));
    }
    ctx.setLineDash([]);
  }

  if(P.features.roads&&(G.roads||[]).length){
    ctx.strokeStyle=RS.road;
    for(const r of G.roads){
      if(r.pts.length<3) continue;
      const p=routePts(r.pts,sx,sy);
      if(r.major){ ctx.lineWidth=Math.max(0.6,unit*1.25); ctx.setLineDash([]); }
      else       { ctx.lineWidth=Math.max(0.9,unit*1.5);  ctx.setLineDash([0.01,unit*3.2]); }
      strokePolyline(ctx,p);
    }
    ctx.setLineDash([]);
    if((G.bridges||[]).length){
      ctx.lineWidth=Math.max(0.5,unit*0.9);
      const s=unit*2.0;
      for(const [bx,by] of G.bridges){
        const x=bx*sx, y=by*sy;
        ctx.beginPath();
        ctx.moveTo(x-s,y-s*0.55); ctx.lineTo(x+s,y-s*0.55);
        ctx.moveTo(x-s,y+s*0.55); ctx.lineTo(x+s,y+s*0.55);
        ctx.stroke();
      }
    }
  }
}

/* ---------- 国家领土 ---------- */
function hslToRgb(h,s,l){
  let r,g,b;
  if(s===0){ r=g=b=l; }
  else{
    const hue2rgb=(p,q,t)=>{
      if(t<0)t+=1; if(t>1)t-=1;
      if(t<1/6)return p+(q-p)*6*t;
      if(t<1/2)return q;
      if(t<2/3)return p+(q-p)*(2/3-t)*6;
      return p;
    };
    const q=l<0.5?l*(1+s):l+s-l*s;
    const p=2*l-q;
    r=hue2rgb(p,q,h+1/3); g=hue2rgb(p,q,h); b=hue2rgb(p,q,h-1/3);
  }
  return [Math.round(r*255),Math.round(g*255),Math.round(b*255)];
}
function hexToRgb(hx){
  const m=hx.replace('#','');
  return [parseInt(m.substr(0,2),16),parseInt(m.substr(2,2),16),parseInt(m.substr(4,2),16)];
}
function drawNations(ctx,cw,ch,G,P,ST){
  const N=G.nations;
  if(!N||!P.features.borders)return;
  const sx=cw/G.gw, sy=ch/G.gh, unit=cw/1000;
  if(ST.border.fill>0){
    const off=document.createElement('canvas'); off.width=G.gw; off.height=G.gh;
    const octx=off.getContext('2d'); const img=octx.createImageData(G.gw,G.gh);
    const cols=N.list.map(L=>hslToRgb(L.hue/360,
      ST.border.nationS==null?0.40:ST.border.nationS,
      ST.border.nationL==null?0.50:ST.border.nationL));
    for(let i=0;i<G.gw*G.gh;i++){
      const o=N.owner[i];
      const j=i*4;
      if(o<0||!isLandB(G.biome[i])){ img.data[j+3]=0; continue; }
      const c=cols[o];
      img.data[j]=c[0]; img.data[j+1]=c[1]; img.data[j+2]=c[2];
      img.data[j+3]=Math.round(255*ST.border.fill);
    }
    octx.putImageData(img,0,0);
    ctx.imageSmoothingEnabled=true;
    ctx.drawImage(off,0,0,cw,ch);
  }
  if(N.frontiers&&N.frontiers.length){
    ctx.save();
    ctx.setLineDash([0.01,unit*3.0]);
    ctx.globalAlpha=0.55;
    ctx.strokeStyle=ST.border.color; ctx.lineWidth=Math.max(0.6,ST.border.width*unit*0.85);
    ctx.lineJoin='round'; ctx.lineCap='round';
    ctx.beginPath();
    N.frontiers.forEach(chain=>{
      ctx.moveTo(chain[0][0]*sx,chain[0][1]*sy);
      for(let k=1;k<chain.length;k++) ctx.lineTo(chain[k][0]*sx,chain[k][1]*sy);
    });
    ctx.stroke();
    ctx.restore();
  }
  // 国境主线
  if(N.borders&&N.borders.length){
    ctx.save();
    ctx.strokeStyle=ST.border.color;
    ctx.lineWidth=Math.max(0.7,ST.border.width*unit);
    ctx.lineJoin='round'; ctx.lineCap='round';
    if(ST.border.dash) ctx.setLineDash(ST.border.dash.map(d=>d*unit));
    ctx.beginPath();
    N.borders.forEach(chain=>{
      ctx.moveTo(chain[0][0]*sx,chain[0][1]*sy);
      for(let k=1;k<chain.length;k++) ctx.lineTo(chain[k][0]*sx,chain[k][1]*sy);
    });
    ctx.stroke();
    ctx.restore();
  }
}

/* ---------- 海岸线 ---------- */
function drawCoast(ctx,cw,ch,G,P,ST){
  const sx=cw/G.gw, sy=ch/G.gh, unit=cw/1000;
  const mode=P.coastStyle||'crisp';
  const loops=landLoops(G,sx,sy,true,mode);
  const w=ST.coast.width*unit;
  if(ST.coast.halo){
    ctx.save();
    ctx.strokeStyle=ST.coast.halo;
    ctx.lineWidth=w+(ST.coast.haloWidth||5)*unit;
    ctx.lineJoin='round'; ctx.lineCap='round';
    ctx.beginPath();
    loops.forEach(l=>tracePath(ctx,l.pts,false));
    ctx.stroke();
    ctx.restore();
  }
  ctx.strokeStyle=ST.coast.color;
  ctx.lineWidth=w;
  ctx.lineJoin='round'; ctx.lineCap='round';
  ctx.beginPath();
  loops.forEach(l=>tracePath(ctx,l.pts,false));
  ctx.stroke();
  // 湖岸
  if(G.lakes&&G.lakes.length){
    const lakeLoops=C.contourMask(i=>G.lakeMask[i]===1,G.gw,G.gh)
      .filter(l=>l.length>=8)
      .map(l=>toDisplay(C.chaikin(l,1,true),sx,sy));
    ctx.strokeStyle=ST.lakeEdge.color;
    ctx.lineWidth=ST.lakeEdge.width*unit;
    ctx.beginPath();
    lakeLoops.forEach(l=>tracePath(ctx,l,true));
    ctx.stroke();
  }
}

/* ---------- 经纬网 ---------- */
function drawGraticule(ctx,cw,ch,G,P,ST){
  if(!P.features.grid) return;
  const unit=cw/1000;
  ctx.save();
  ctx.strokeStyle=ST.ink;
  ctx.globalAlpha=0.13;
  ctx.lineWidth=Math.max(0.4,unit*0.5);
  const nLon=12, nLat=6;
  for(let k=1;k<nLon;k++){
    const x=cw*k/nLon;
    ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,ch); ctx.stroke();
  }
  for(let k=1;k<nLat;k++){
    const y=ch*k/nLat;
    ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(cw,y); ctx.stroke();
  }
  ctx.restore();
}

/* ---------- 纹理与暗角 ---------- */
let TEX={};
function getTexture(kind){
  if(TEX[kind]) return TEX[kind];
  const s=256, cv=document.createElement('canvas');
  cv.width=s; cv.height=s;
  const c2=cv.getContext('2d');
  const img=c2.createImageData(s,s);
  for(let i=0;i<s*s;i++){
    const x=i%s, y=(i/s)|0;
    let v=0;
    if(kind==='grain') v=(vnoise(x*0.45,y*0.45)-0.5)*36+(vnoise(x*0.13,y*0.13)-0.5)*22;
    else if(kind==='washi') v=(vnoise(x*0.3,y*0.06)-0.5)*30+(vnoise(x*0.9,y*0.9)-0.5)*18;
    else if(kind==='ground') v=(vnoise(x*0.6,y*0.6)-0.5)*24+(vnoise(x*0.2,y*0.2)-0.5)*16;
    const j=i*4;
    img.data[j]=img.data[j+1]=img.data[j+2]=128+v;
    img.data[j+3]=kind==='none'?0:48;  // 纸张纹理强度：羊皮纸需更明显
  }
  c2.putImageData(img,0,0);
  TEX[kind]=cv;
  return cv;
}
function drawTexture(ctx,cw,ch,G,P,ST){
  if(!ST.texture||ST.texture==='none')return;
  const tex=getTexture(ST.texture);
  ctx.save();
  ctx.globalCompositeOperation='overlay';
  ctx.globalAlpha=0.65;  // 使纸张纹理更明显
  const pat=ctx.createPattern(tex,'repeat');
  ctx.fillStyle=pat;
  ctx.fillRect(0,0,cw,ch);
  ctx.restore();
}
function drawVignette(ctx,cw,ch,ST){
  if(!ST.vignette||ST.vignette==='none')return;
  const g=ctx.createRadialGradient(cw/2,ch/2,Math.min(cw,ch)*0.36,cw/2,ch/2,Math.max(cw,ch)*0.72);
  if(ST.vignette==='warm'){ g.addColorStop(0,'rgba(60,40,16,0)'); g.addColorStop(1,'rgba(60,40,16,0.30)'); }
  else if(ST.vignette==='cool'){ g.addColorStop(0,'rgba(8,20,32,0)'); g.addColorStop(1,'rgba(8,20,32,0.34)'); }
  else { g.addColorStop(0,'rgba(30,30,30,0)'); g.addColorStop(1,'rgba(30,30,30,0.26)'); }
  ctx.fillStyle=g;
  ctx.fillRect(0,0,cw,ch);
}

/* ---------- 主入口 ---------- */
function drawMap(ctx,cw,ch,G,P,opt){
  opt=opt||{};
  const ST=SY.get(P.style);
  ctx.clearRect(0,0,cw,ch);
  ctx.fillStyle=SY.hex(ST.paper); ctx.fillRect(0,0,cw,ch);

  if(ST.base==='raster')      renderRaster(ctx,cw,ch,G,P,ST,opt.F);
  else if(ST.base==='flat')   renderFlat(ctx,cw,ch,G,P,ST,opt.F);
  else if(ST.base==='line')   renderLine(ctx,cw,ch,G,P,ST);
  else if(ST.base==='pictorial') NS.symbols.renderPictorialBase(ctx,cw,ch,G,P,ST);

  const layer=(id,fn)=>{
    if(ctx.group){ ctx.group(id); fn(); ctx.endGroup(); } else fn();
  };
  if(P.features.seaice!==false && G.seaice &&
     (ctx.isSVG || ST.base==='line' || ST.base==='pictorial'))
    layer('seaice',()=>drawSeaIceFields(ctx,cw,ch,G,P,ST));
  drawNations(ctx,cw,ch,G,P,ST);
  if(ST.base!=='line') layer('coast',()=>drawCoast(ctx,cw,ch,G,P,ST));
  layer('rivers',()=>drawRivers(ctx,cw,ch,G,P,ST));
  layer('routes',()=>drawRoutes(ctx,cw,ch,G,P,ST));
  if(P.features.symbols && (ST.base==='pictorial'||ST.id==='antique'||ST.id==='sumi'))
    layer('symbols',()=>NS.symbols.drawSymbols(ctx,cw,ch,G,P,ST));
  layer('graticule',()=>drawGraticule(ctx,cw,ch,G,P,ST));
  drawTexture(ctx,cw,ch,G,P,ST);
  drawVignette(ctx,cw,ch,ST);
  layer('decor',()=>NS.decor.draw(ctx,cw,ch,G,P,ST,opt));
  return ST;
}

NS.render={drawMap,drawSeaIceFields,renderVectorFills,renderVectorTiers,VECTOR_LAYERS,
           regionLoops,landLoops,landFills,toDisplay,
           strokeLoops,fillLoops,tracePath,shadeAt,vnoise,
           drawRivers,drawCoast,drawNations,drawGraticule,
           taperedFill,hslToRgb,hexToRgb,isLandB,getTexture};
})(typeof self!=='undefined'?self:this);
