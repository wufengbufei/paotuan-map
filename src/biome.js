/* =========================================================
   奇幻地图 / biome — Whittaker 生物群系分类（气温 × 降水）
   ========================================================= */
(function(root){
"use strict";
const NS = root.FMAP = root.FMAP || {};

const BIOME={
  DEEP:0, SEA:1, SHALLOW:2, LAKE:3, RIVER:4,
  BEACH:5, DESERT:6, STEPPE:7, SAVANNA:8, GRASS:9, SHRUB:10, WETLAND:11,
  FOREST:12, RAINFOREST:13, TAIGA:14, TUNDRA:15, ROCK:16, SNOW:17, ICE:18
};
const LAND_MIN=BIOME.BEACH;
const isWater=b=>b<LAND_MIN;
const isLand =b=>b>=LAND_MIN;

const BIOME_ZH=[
  '深海','海','浅海','湖','河川',
  '沙滩','沙漠','干草原','稀树草原','草原','灌丛','湿地',
  '温带林','热带雨林','针叶林','苔原','岩山','雪山','冰原'
];

const TH_DEFAULT={bW:0.045,bN:0.045,sW:0.04,sN:0.04};
function classifyCell(e,sea,h,t,p,lake,river,F,xpo,TH){
  TH=TH||TH_DEFAULT;
  if(e<sea){
    if(e<sea-0.14) return BIOME.DEEP;
    const shelf = xpo<0?TH.sW : xpo>0?TH.sN : 0.04;
    return e<sea-shelf?BIOME.SEA:BIOME.SHALLOW;
  }
  if(lake)  return BIOME.LAKE;
  if(river) return BIOME.RIVER;

  if(F.mountains){
    if(h>0.80) return (t<-4&&F.snow)?BIOME.SNOW:BIOME.ROCK;
    if(h>0.60) return BIOME.ROCK;
  }
  if(t<-9)  return F.snowfield?BIOME.ICE:BIOME.TUNDRA;
  if(t<0.5) return BIOME.TUNDRA;
  if(h<(xpo<0?TH.bW : xpo>0?TH.bN : 0.045)) return BIOME.BEACH;
  if(F.wetlands && h<0.13 && p>0.74) return BIOME.WETLAND;

  if(t<7) return (p>0.34&&F.forests)?BIOME.TAIGA:BIOME.TUNDRA;
  if(t<18){
    if(p<0.18) return F.deserts?BIOME.DESERT:BIOME.STEPPE;
    if(p<0.30) return BIOME.STEPPE;
    if(p<0.56) return BIOME.GRASS;
    return F.forests?BIOME.FOREST:BIOME.GRASS;
  }
  if(p<0.16) return F.deserts?BIOME.DESERT:BIOME.SAVANNA;
  if(p<0.28) return BIOME.SAVANNA;
  if(p<0.44) return BIOME.SHRUB;
  if(p<0.70) return F.forests?BIOME.FOREST:BIOME.GRASS;
  return F.forests?BIOME.RAINFOREST:BIOME.GRASS;
}

/* 海拔层级（扁平样式用） */
function elevTier(e,sea,lake){
  if(lake) return 5;
  if(e<sea-0.14) return 0;
  if(e<sea) return 1;
  const h=(e-sea)/(1-sea);
  if(h>0.60) return 4;
  if(h>0.28) return 3;
  return 2;
}

function classifyAll(o,F){
  const {gw,gh,elev,sea,temp,precip,lakeMask,isRiver,biome,exposure}=o;
  const n=gw*gh, invSea=1/(1-sea);
  const km=(NS.core.TYPE_KM&&NS.core.TYPE_KM[o.worldType])||3000;
  const widenF=Math.min(1,Math.max(0.08,1500/km));
  const shelfF=Math.min(1,Math.max(0.25,2500/km));
  const TH={
    bW:0.045+0.030*widenF,
    bN:0.045*widenF,
    sW:0.04+0.05*shelfF,
    sN:0.04*shelfF
  };
  for(let i=0;i<n;i++){
    const e=elev[i];
    const h=Math.max(0,(e-sea)*invSea);
    biome[i]=classifyCell(e,sea,h,temp[i],precip[i],
      lakeMask?lakeMask[i]:0, isRiver?isRiver[i]:0, F,
      exposure?exposure[i]:0, TH);
  }
  return biome;
}

NS.biome={BIOME,LAND_MIN,isWater,isLand,BIOME_ZH,classifyCell,classifyAll,elevTier};
})(typeof self!=='undefined'?self:this);
