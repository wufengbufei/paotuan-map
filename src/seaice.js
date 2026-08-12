/* =========================================================
   奇幻地图 / seaice — 流冰
   寒带海域生成浮冰：越冷越厚，噪声破裂成浮冰块
   ========================================================= */
(function(root){
"use strict";
const NS = root.FMAP = root.FMAP || {};
const C = NS.core;
const {clamp, makeField} = C;

function build(G,P){
  const {gw,gh,temp,biome,sea,elev}=G;
  const n=gw*gh;
  const B=NS.biome.BIOME;
  const ice=new Float32Array(n);
  const amt=P.iceAmount==null?1:P.iceAmount;
  if(amt<=0||!P.features.seaice) return {ice:null};
  const f=makeField(P.seed^0x1ce5ea, G.wrap);
  for(let y=0;y<gh;y++){
    for(let x=0;x<gw;x++){
      const i=y*gw+x;
      if(biome[i]>B.SHALLOW) continue;
      const t=temp[i];
      if(t>-1) continue;
      // 基础密接度：温度越低越密
      let c=clamp((-t-1)/16,0,1)*amt;
      // 破裂噪声形成浮冰纹理
      const brk=f.fbm01(x/gw,y/gw,7,3);
      c*=clamp(0.35+brk*0.95,0,1.2);
      // 岸边碎冰变薄
      ice[i]=clamp(c,0,1);
    }
  }
  return {ice};
}

NS.seaice={build};
})(typeof self!=='undefined'?self:this);
