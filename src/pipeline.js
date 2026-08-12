/* =========================================================
   奇幻地图 / pipeline — 生成管线编排 + 笔刷覆盖层
   ========================================================= */
(function(root){
"use strict";
const NS = root.FMAP = root.FMAP || {};
const C = NS.core;
const {clamp} = C;

const DEFAULTS={
  seed:1054, worldType:'continent', style:'antique', detail:420,
  labelScale:1,
  sea:0.40, rough:5, mtn:0.45, arid:-0.20, wind:0,
  plain:0,
  mura:0,
  ridgeSharp:0.45,
  plates:0,
  tect:1,
  lakeAmount:0.4,
  iceAmount:1,
  windDeg:null,
  coastStyle:'crisp',
  climate:0.42,
  riverDensity:0.45,
  nations:4, cityCount:14, nameCulture:'fantasy',
  geo:{ mountains:1, rivers:1, deserts:1, frontier:1, sail:1 },
  lore:{},
  pins:{cities:[],removed:[],marks:[]},
  features:{
    mountains:true, deserts:true, forests:true, lakes:true, rivers:true,
    wetlands:true, snow:true, snowfield:false, seaice:true,
    shade:true, grid:true, symbols:false,
    cities:true, borders:true, labels:true, roads:true, searoutes:true,
    frame:true, compass:true, scalebar:true, title:true
  }
};

function cloneParams(p){ return JSON.parse(JSON.stringify(p)); }

/* ---------- 覆盖层（手绘编辑差分） ---------- */
function newOverlay(gw,gh){
  return {gw,gh,
    dElev:new Float32Array(gw*gh),
    dTemp:new Float32Array(gw*gh),
    dPrecip:new Float32Array(gw*gh),
    mask:new Uint8Array(gw*gh),
    owner:new Int16Array(gw*gh).fill(-32768),
    ownerStable:null,
    rev:0,ownerRev:0};
}
function cloneOverlay(o){
  if(!o) return null;
  return {gw:o.gw,gh:o.gh,
    dElev:Float32Array.from(o.dElev),
    dTemp:Float32Array.from(o.dTemp),
    dPrecip:Float32Array.from(o.dPrecip),
    mask:Uint8Array.from(o.mask),
    owner:Int16Array.from(o.owner||[]),
    ownerStable:o.ownerStable?Int32Array.from(o.ownerStable):null,
    rev:o.rev||0,ownerRev:o.ownerRev||0};
}
function hasEdits(o){
  if(!o) return false;
  for(let i=0;i<o.mask.length;i++) if(o.mask[i]) return true;
  if(o.owner) for(let i=0;i<o.owner.length;i++) if(o.owner[i]!==-32768) return true;
  return false;
}
function resampleOverlay(o,gw,gh){
  if(!o) return null;
  const out=newOverlay(gw,gh);
  out.dElev=C.resampleGrid(o.dElev,o.gw,o.gh,gw,gh);
  out.dTemp=C.resampleGrid(o.dTemp,o.gw,o.gh,gw,gh);
  out.dPrecip=C.resampleGrid(o.dPrecip,o.gw,o.gh,gw,gh);
  const m=C.resampleGrid(o.mask,o.gw,o.gh,gw,gh);
  for(let i=0;i<m.length;i++) out.mask[i]=m[i]>0.35?1:0;
  if(o.owner){
    for(let y=0;y<gh;y++)for(let x=0;x<gw;x++){
      const sx=Math.min(o.gw-1,Math.round(x*o.gw/gw)),
            sy=Math.min(o.gh-1,Math.round(y*o.gh/gh));
      out.owner[y*gw+x]=o.owner[sy*o.gw+sx];
      if(o.ownerStable)out.ownerStable[y*gw+x]=o.ownerStable[sy*o.gw+sx];
    }
  }
  out.rev=o.rev||0; out.ownerRev=o.ownerRev||0;
  return out;
}

/* ---------- 缓存键 ---------- */
function keyTerrain(P){
  return ['T',P.seed,P.worldType,P.detail,P.sea,P.rough,P.mtn,P.plain,P.mura,
          P.ridgeSharp,P.plates,P.tect,P.features.mountains].join('|');
}
function keyClimate(P){
  return ['C',P.seed,P.worldType,P.detail,P.sea,P.climate,P.arid,P.windDeg,P.wind,
          P.rough,P.mtn,P.plates,P.tect,P.features.mountains].join('|');
}
function keyHydro(P){
  return ['H',P.seed,P.worldType,P.detail,P.sea,P.rough,P.mtn,P.plain,P.mura,
          P.ridgeSharp,P.plates,P.tect,P.lakeAmount,P.riverDensity,
          P.features.mountains,P.features.lakes].join('|');
}
function keyWorld(P){
  return ['W',P.seed,P.worldType,P.detail,P.nations,P.cityCount,P.nameCulture,
          JSON.stringify(P.geo),JSON.stringify(P.pins),P.features.cities,
          P.features.borders,P.features.labels].join('|');
}
function overlayFingerprints(ov){
  if(!ov) return {terrain:'0',owner:'0'};
  return {terrain:'r'+(ov.rev||0), owner:'o'+(ov.ownerRev||0)};
}

/* ---------- 管线 ---------- */
function createPipeline(){
  const cache={};
  return {
    cache,
    run(P,overlay){
      const kT=keyTerrain(P);
      if(cache.kT!==kT){ cache.kT=kT; cache.T=NS.terrain.build(P); cache.kC=null; }
      const T=cache.T;

      const kC=keyClimate(P);
      if(cache.kC!==kC){ cache.kC=kC; cache.CL=NS.climate.build(T,P); }
      const CL=cache.CL;

      const n=T.gw*T.gh;
      const ov=(overlay&&overlay.gw===T.gw&&overlay.gh===T.gh)?overlay:null;
      const elev  =Float32Array.from(T.elev);
      const temp  =Float32Array.from(CL.temp);
      const precip=Float32Array.from(CL.precip);
      if(ov){
        for(let i=0;i<n;i++){
          if(!ov.mask[i])continue;
          elev[i]  =clamp(T.elev[i]+ov.dElev[i],0,1);
          temp[i]  =CL.temp[i]+ov.dTemp[i];
          precip[i]=clamp(CL.precip[i]+ov.dPrecip[i],0,1);
        }
      }

      const ovKey=overlayFingerprints(ov);
      const kH=keyHydro(P)+'|'+ovKey.terrain;
      let H;
      if(cache.kH===kH&&cache.H){ H=cache.H; }
      else {
        H=NS.hydrology.build({gw:T.gw,gh:T.gh,elev,sea:T.sea,wrap:T.wrap,worldType:T.worldType},{precip},P);
        cache.kH=kH; cache.H=H;
      }
      if(H.precipAdd){
        for(let i=0;i<n;i++)
          if(H.precipAdd[i]>0) precip[i]=clamp(precip[i]+H.precipAdd[i],0,1);
      }
      if(H.elevAdd){
        for(let i=0;i<n;i++)
          if(H.elevAdd[i]!==0) elev[i]=clamp(elev[i]+H.elevAdd[i],0,1);
      }

      const biome=new Uint8Array(n);
      const G={
        gw:T.gw, gh:T.gh, aspect:T.aspect, sea:T.sea, wrap:T.wrap, outer:T.outer,
        worldType:T.worldType, clipType:T.clipType,
        elev, ridge:T.ridge, temp, precip,
        baseElev:T.elev, baseTemp:CL.temp, basePrecip:CL.precip,
        seaDist:CL.seaDist, exposure:CL.exposure, biome,
        filled:H.filled, recv:H.recv, acc:H.acc, accMax:H.accMax,
        lakeMask:H.lakeMask, lakes:H.lakes, isRiver:H.isRiver, rivers:H.rivers,
        mouths:H.mouths, confluences:H.confluences, waterDist:H.waterDist,
        cities:[], nations:null, labels:[]
      };
      NS.hydrology.carveValleys(elev,T.gw,T.gh,T.sea,H.rivers,H.lakeMask);
      NS.biome.classifyAll(G,P.features);
      G.seaice=NS.seaice?NS.seaice.build(G,P).ice:null;

      const kW=keyWorld(P)+'|'+ovKey.terrain+'|'+ovKey.owner;
      if(cache.kW===kW&&cache.W){ /* 复用 */ }
      else { cache.kW=kW; cache.W=NS.world.build(G,P,ov); }
      G.cities=cache.W.cities; G.nations=cache.W.nations;
      G.labels=cache.W.labels; G.title=cache.W.title;
      G.roads=cache.W.roads||[]; G.searoutes=cache.W.searoutes||[];
      G.bridges=cache.W.bridges||[]; G.marks=cache.W.marks||[];
      return G;
    },
    reclassify(G,P){ NS.biome.classifyAll(G,P.features); G.seaice=NS.seaice?NS.seaice.build(G,P).ice:null; },
    invalidate(){ cache.kT=cache.kC=cache.kH=cache.kW=null; }
  };
}

/* ---------- 笔刷 ---------- */
const BRUSH_MODES=[
  {v:'sea',      label:'海・水源'},
  {v:'land',     label:'陆地'},
  {v:'raise',    label:'隆起'},
  {v:'lower',    label:'沉降'},
  {v:'rock',     label:'山岳'},
  {v:'snowpeak', label:'雪山'},
  {v:'forest',   label:'森林'},
  {v:'desert',   label:'沙漠'},
  {v:'snowfield',label:'雪原'},
  {v:'smooth',   label:'平滑'}
];

/* 应用笔刷到覆盖层。cx,cy 为格子坐标，r 为半径（格） */
function applyBrush(ov,T,mode,cx,cy,r,strength,sea){
  const gw=ov.gw, gh=ov.gh;
  const r2=r*r;
  for(let dy=-r;dy<=r;dy++){
    for(let dx=-r;dx<=r;dx++){
      const x=cx+dx, y=cy+dy;
      if(x<0||y<0||x>=gw||y>=gh) continue;
      const d2=dx*dx+dy*dy;
      if(d2>r2) continue;
      const fall=1-Math.sqrt(d2)/r;
      const f=fall*fall*strength*0.02;
      const i=y*gw+x;
      const base=T.elev[i];
      const cur=base+(ov.mask[i]?ov.dElev[i]:0);
      let target=cur;
      switch(mode){
        case 'sea':       target=sea-0.06; break;
        case 'land':      target=sea+0.04; break;
        case 'raise':     target=cur+f; break;
        case 'lower':     target=cur-f; break;
        case 'rock':      target=Math.max(cur, sea+0.45*(1-sea)+f); break;
        case 'snowpeak':  target=Math.max(cur, sea+0.72*(1-sea)+f); break;
        case 'forest':    ov.dPrecip[i]=clamp((ov.mask[i]?ov.dPrecip[i]:0)+f*2,-1,1); break;
        case 'desert':    ov.dPrecip[i]=clamp((ov.mask[i]?ov.dPrecip[i]:0)-f*2,-1,1); break;
        case 'snowfield': ov.dTemp[i]=(ov.mask[i]?ov.dTemp[i]:0)-f*30; break;
        case 'smooth': {
          // 邻域均值
          let s=0,n=0;
          for(let oy=-2;oy<=2;oy++)for(let ox=-2;ox<=2;ox++){
            const xx=x+ox, yy=y+dy*0+oy;
            if(xx<0||yy<0||xx>=gw||yy>=gh) continue;
            const j=yy*gw+xx;
            s+=T.elev[j]+(ov.mask[j]?ov.dElev[j]:0); n++;
          }
          target=cur+(s/n-cur)*fall*0.4;
          break;
        }
      }
      if(mode!=='forest'&&mode!=='desert'&&mode!=='snowfield'){
        target=clamp(target,0,1);
        ov.dElev[i]=target-base;
      }
      ov.mask[i]=1;
    }
  }
  ov.rev=(ov.rev||0)+1;
}

NS.pipeline={DEFAULTS,cloneParams,createPipeline,newOverlay,cloneOverlay,hasEdits,
             resampleOverlay,BRUSH_MODES,applyBrush,
             keyTerrain,keyClimate,keyHydro,keyWorld};
})(typeof self!=='undefined'?self:this);
