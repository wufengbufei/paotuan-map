/* =========================================================
   奇幻地图 / terrain — 标高场生成
   陆块掩码 + fBm + 棱线噪声 + 简易板块 + 水力侵蚀
   ========================================================= */
(function(root){
"use strict";
const NS = root.FMAP = root.FMAP || {};
const C = NS.core;
const {clamp, makeRng, makeField, normalize01} = C;

function isWrapped(worldType){ return worldType==='world'; }
function wrapPlates(wt){ return wt==='world'?10 : wt==='continent'?7 : 8; }

function build(P){
  const gw=P.detail, gh=Math.round(gw*9/16);
  const wrap=isWrapped(P.worldType);
  const base =makeField(P.seed,            wrap);
  const ridgeF=makeField(P.seed^0x9e3779b9, wrap);
  const warpF =makeField(P.seed^0x68bc21eb, wrap);
  const muraF =makeField(P.seed^0x3c6ef372, wrap);
  const rand=makeRng(P.seed^0x6d2b79f5);
  const mura=clamp(P.mura==null?0:P.mura,0,1);

  const elev =new Float32Array(gw*gh);
  const ridge=new Float32Array(gw*gh);
  const beltC=new Float32Array(gw*gh);
  const beltD=new Float32Array(gw*gh);

  /* ---- 简易板块：维诺板块 + 相对速度 → 碰撞带/裂谷带 ---- */
  const prand=makeRng(P.seed^0x51f15eed);
  const nPlates = (P.plates|0)>0 ? Math.max(2,Math.min(14,P.plates|0)) : wrapPlates(P.worldType);
  const tect = P.tect==null ? 1 : clamp(P.tect,0,2);
  const plates=[];
  for(let k=0;k<nPlates;k++){
    const a=prand()*Math.PI*2;
    plates.push({x:prand(), y:prand()*9/16,
                 vx:Math.cos(a)*(0.5+prand()*0.5), vy:Math.sin(a)*(0.5+prand()*0.5)});
  }

  /* ---- 地形类型参数 ---- */
  let falloffPow=2.0, falloffScale=1.0, freq=2.6;
  const mtnWeight=P.features.mountains?P.mtn:0;
  let openOcean=false;
  const wt=P.worldType;
  const isContinent=wt==='continent';
  const isInterior =wt==='interior';
  const isPeninsula=wt==='peninsula';
  const clipType=isInterior||isPeninsula;
  if(isContinent) freq=2.4;
  if(wt==='archipelago'){ freq=5.0; openOcean=true; }
  let arcCos=1, arcSin=0;
  if(wt==='archipelago'){
    const aa=prand()*Math.PI;
    arcCos=Math.cos(aa); arcSin=Math.sin(aa);
  }
  if(wt==='world'){ freq=2.9; openOcean=true; }
  if(wt==='island'){ falloffPow=2.6; falloffScale=0.78; freq=2.8; }
  if(wt==='inland'){ falloffPow=2.5; falloffScale=1.12; freq=2.7; }
  if(isInterior) freq=2.9;
  if(isPeninsula) freq=2.8;

  // 大陆形状多样化
  const cAng=rand()*Math.PI, cCa=Math.cos(cAng), cSa=Math.sin(cAng);
  const cSemiX=0.34+rand()*0.21, cSemiY=0.34+rand()*0.21;
  // 近岸小岛
  const cIslands=[];
  if(isContinent){
    const nI = rand()<0.40 ? 0 : 1+Math.floor(rand()*3);
    let tries=0;
    while(cIslands.length<nI && tries++<80){
      const a=rand()*Math.PI*2, ca2=Math.cos(a), sa2=Math.sin(a);
      const rxd=ca2*cCa+sa2*cSa, ryd=-ca2*cSa+sa2*cCa;
      const contEdge=1/Math.hypot(rxd/cSemiX, ryd/cSemiY);
      const place=contEdge+0.14+rand()*0.10;
      const ix=ca2*place, iy=sa2*place;
      if(Math.abs(ix)>0.45||Math.abs(iy)>0.45) continue;
      if(cIslands.some(s=>Math.hypot(s.x-ix,s.y-iy)<0.13)) continue;
      cIslands.push({x:ix,y:iy,r:0.055+rand()*0.045,sd:rand()*100});
    }
  }
  const pAng=rand()*Math.PI*2, pAx=Math.cos(pAng)*0.85, pAy=Math.sin(pAng)*0.85;
  // 相邻大陆碎片（画框外窥视）
  const cFrags=[];
  if(isContinent){
    const nF=rand()<0.30?0:(rand()<0.68?1:2);
    for(let k=0;k<nF;k++){
      const side=Math.floor(rand()*4);
      const off=0.50+rand()*0.06;
      const t2=(rand()-0.5)*0.7;
      cFrags.push({
        x: side===0? off : side===1? -off : t2,
        y: side===2? -off : side===3? off : t2,
        rx:0.16+rand()*0.16, ry:0.16+rand()*0.16, sd:rand()*100});
    }
  }

  const aspect=gh/gw;
  for(let y=0;y<gh;y++){
    for(let x=0;x<gw;x++){
      const u=x/gw, v=y/gw;
      const nx=u-0.5, ny=(y/gh-0.5);
      const wu=u+0.18*warpF.fbm(u,v,2,3),
            wv=v+0.18*warpF.fbm(u,v,2,3,5.2,1.3);
      let e=base.fbm01(wu,wv,freq,P.rough);
      const i=y*gw+x;
      let fragT=0;
      let regAmp=1;
      if(mura>0){
        const low=base.fbm01(wu,wv,freq*0.45,2);
        const m=muraF.fbm01(u,v,1.15,3);
        const reg=0.18+1.55*m*m;
        regAmp=(1-mura)+mura*reg;
        e=low+(e-low)*regAmp;
      }
      if(mtnWeight>0||tect>0)
        ridge[i]=ridgeF.ridged(wu,wv,freq*1.15,Math.min(P.rough+1,6),0.52)*Math.min(1.25,regAmp);

      // 板块边界距离与汇聚度
      {
        let d1=1e9,d2=1e9,p1=null,p2=null;
        const pu=wu, pv=wv;
        for(const pl of plates){
          let du=Math.abs(pu-pl.x);
          if(wrap) du=Math.min(du,1-du);
          const dv=pv-pl.y;
          const d=du*du+dv*dv;
          if(d<d1){ d2=d1;p2=p1; d1=d;p1=pl; }
          else if(d<d2){ d2=d;p2=pl; }
        }
        if(p2){
          const bd=Math.sqrt(d2)-Math.sqrt(d1);
          const belt=Math.exp(-(bd*bd)/(2*0.045*0.045));
          let bx=p2.x-p1.x;
          if(wrap){ if(bx>0.5)bx-=1; if(bx<-0.5)bx+=1; }
          const by=p2.y-p1.y, bl=Math.hypot(bx,by)||1;
          const conv=((p1.vx-p2.vx)*bx+(p1.vy-p2.vy)*by)/bl;
          if(conv>0) beltC[i]=belt*Math.min(1,conv*1.6);
          else       beltD[i]=belt*Math.min(1,-conv*1.6);
        }
      }

      if(openOcean){
        const isArch=wt==='archipelago';
        let mu=wu, mv=wv;
        if(isArch){
          const au=u+(wu-u)*0.35, av=v+(wv-v)*0.35;
          const ru=au*arcCos+av*arcSin, rv=-au*arcSin+av*arcCos;
          mu=ru; mv=rv*1.85;
        }
        const maskFreq = isArch?3.0:1.35;
        const cont=base.fbm01(mu,mv,maskFreq,5,0.5,13.7,7.2);
        const mix  = isArch?0.72:0.74;
        let land=cont*mix + e*(1-mix);
        const ocean=base.fbm01(wu,wv,1.25,3,0.5,40.0,22.0);
        land -= Math.pow(clamp(1-ocean,0,1),1.4)*(isArch?0.22:0.34);
        if(isArch){
          const room=clamp((0.62-land)/0.30,0,1);
          land += beltC[i]*0.30*room;
        }
        e=land;
      } else if(isContinent){
        const rxN=nx*cCa+ny*cSa, ryN=-nx*cSa+ny*cCa;
        let d=Math.hypot(rxN/cSemiX, ryN/cSemiY);
        d += base.fbm(u,v,1.7,4,0.5,30,12)*0.42;
        const fo=Math.pow(clamp((d-0.07)/0.93,0,1),2.0);
        e=e*(1-fo)+(-0.18)*fo;
        for(const isl of cIslands){
          const di=Math.hypot((nx-isl.x)/isl.r,(ny-isl.y)/isl.r);
          if(di<1.4){
            const wob=0.6+0.6*base.fbm(u,v,7,3,0.5,isl.sd,isl.sd);
            const target=0.60*clamp(1-di,0,1)*wob;
            if(target>e) e=target;
          }
        }
        for(const fr of cFrags){
          const di=Math.hypot((nx-fr.x)/fr.rx,(ny-fr.y)/fr.ry);
          if(di<1.5){
            const wob=0.68+0.52*base.fbm(u,v,5.5,3,0.5,fr.sd,fr.sd);
            const target=0.80*clamp(1.15-di,0,1)*wob;
            if(target>fragT) fragT=target;
          }
        }
      } else if(isInterior){
        // 全域为陆
      } else if(isPeninsula){
        const dd=Math.hypot(nx-pAx, ny-pAy);
        const fo=clamp((dd-0.45)/0.72,0,1);
        e=e*(1-fo)+(-0.20)*fo;
      } else {
        const d=Math.sqrt(nx*nx+ny*ny*1.15)/falloffScale*2;
        const fo=Math.pow(clamp(d,0,1),falloffPow);
        e=e*(1-fo)+(-0.15)*fo;
        if(wt==='inland'){
          const basin=Math.exp(-(nx*nx+ny*ny)*9);
          e-=basin*0.35;
        }
      }

      // 缘掩码：用海留白围边
      if(!clipType && wt!=='archipelago'){
        const px=Math.abs(nx)/0.5, py=Math.abs(ny)/0.5;
        const rr=wrap?py:Math.max(px,py);
        let frame=Math.pow(clamp((rr-0.86)/0.14,0,1),1.7);
        if(!wrap){
          const corner=clamp((Math.hypot(px,py)-1.10)/0.32,0,1);
          frame=Math.max(frame,Math.pow(corner,1.2));
        }
        frame*=clamp(1-fragT*3.5,0,1);
        e=e*(1-frame)+(-0.20)*frame;
      }
      if(fragT>e) e=fragT;
      elev[i]=e;
    }
  }

  // 归一化
  let eLo=Infinity, eHi=-Infinity;
  for(let i=0;i<elev.length;i++){ const v2=elev[i]; if(v2<eLo)eLo=v2; if(v2>eHi)eHi=v2; }
  {
    const r2=(eHi-eLo)||1;
    for(let i=0;i<elev.length;i++) elev[i]=(elev[i]-eLo)/r2;
  }
  if(isInterior){
    for(let i=0;i<elev.length;i++) elev[i]=P.sea+0.04+(1-P.sea-0.04)*elev[i];
  }

  // 海面（世界/群岛按海洋率分位数）
  let seaLevel=P.sea;
  if(openOcean){
    const oceanFrac = wt==='archipelago'
      ? clamp(0.62+P.sea*0.55, 0.55, 0.92)
      : clamp(0.54+P.sea*0.50, 0.45, 0.85);
    const arr=Float32Array.from(elev); arr.sort();
    seaLevel=arr[Math.min(arr.length-1, Math.floor(oceanFrac*arr.length))];
  }

  // 平原扩展
  {
    const plain=clamp(P.plain==null?0:P.plain,0,1);
    if(plain>0){
      const g=1+2.6*plain;
      for(let i=0;i<elev.length;i++){
        if(elev[i]<=seaLevel)continue;
        const h=(elev[i]-seaLevel)/(1-seaLevel);
        elev[i]=seaLevel+(1-seaLevel)*Math.pow(h,g);
      }
      if(isInterior){
        const base0=P.sea+0.04, k=1-0.62*plain;
        for(let i=0;i<elev.length;i++)
          if(elev[i]>base0) elev[i]=base0+(elev[i]-base0)*k;
      }
    }
  }

  // 山体隆起
  if(mtnWeight>0||tect>0){
    let maxE=seaLevel;
    const beltAmp=Math.max(mtnWeight,0.35);
    for(let i=0;i<elev.length;i++){
      if(elev[i]<=seaLevel) continue;
      const h=(elev[i]-seaLevel)/(1-seaLevel);
      const highMask=clamp((h-0.05)/0.95,0,1);
      const r=ridge[i];
      const beltMask=wt==='archipelago'
        ? clamp((h-0.12)/0.60,0,1)
        : clamp((h-0.02)/0.45,0,1);
      const beltGain=wt==='archipelago'?0.55:0.95;
      let add=r*r*r*1.85*(0.80*highMask*mtnWeight + beltGain*beltC[i]*beltMask*tect*beltAmp);
      add=add/(1+add*0.9);
      elev[i]+=add;
      if(beltD[i]>0.2){
        elev[i]=Math.max(seaLevel+0.002, elev[i]-beltD[i]*0.16*highMask*tect);
      }
      if(elev[i]>maxE) maxE=elev[i];
    }
    if(maxE>1){
      const span=maxE-seaLevel, inv=(1-seaLevel)/span;
      for(let i=0;i<elev.length;i++)
        if(elev[i]>seaLevel) elev[i]=seaLevel+(elev[i]-seaLevel)*inv;
    }
  }

  // 水力侵蚀
  erode(elev,gw,gh,seaLevel,6,0.0065);

  // 棱线锐化
  if(P.ridgeSharp>0) C.sharpenRidges(elev,gw,gh,seaLevel,P.ridgeSharp);

  return {gw,gh,aspect,elev,ridge,sea:seaLevel,wrap,
          worldType:P.worldType,clipType};
}

/* 简易水力侵蚀：流_power_律 */
function erode(elev,gw,gh,sea,iters,rate){
  const n=gw*gh;
  const N8=C.N8;
  const acc=new Float32Array(n);
  const recv=new Int32Array(n).fill(-1);
  for(let it=0;it<iters;it++){
    // D8 流向
    for(let y=0;y<gh;y++)for(let x=0;x<gw;x++){
      const i=y*gw+x;
      if(elev[i]<=sea) continue;
      let best=-1, bestDrop=0;
      for(let k=0;k<8;k++){
        const nx=x+N8[k][0], ny=y+N8[k][1];
        if(nx<0||ny<0||nx>=gw||ny>=gh) continue;
        const j=ny*gw+nx;
        const drop=elev[i]-elev[j];
        if(drop>bestDrop){ bestDrop=drop; best=j; }
      }
      recv[i]=best;
    }
    // 流量（高→低累计）
    acc.fill(1);
    const order=new Int32Array(n);
    for(let i=0;i<n;i++) order[i]=i;
    order.sort((a,b)=>elev[b]-elev[a]);
    for(let k=0;k<n;k++){
      const i=order[k], r=recv[i];
      if(r>=0) acc[r]+=acc[i];
    }
    // 按流量下切
    for(let i=0;i<n;i++){
      if(elev[i]<=sea) continue;
      const cut=rate*Math.sqrt(acc[i]);
      const nv=elev[i]-cut;
      elev[i]=Math.max(sea+0.001, nv*0.5+elev[i]*0.5);
    }
  }
}

NS.terrain={build,isWrapped};
})(typeof self!=='undefined'?self:this);
