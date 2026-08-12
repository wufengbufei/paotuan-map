/* =========================================================
   奇幻地图 / climate — 气温(℃)与降水(0..1)场
   气温 = 纬度 − 高度递减 + 海洋调节 + 局部扰动
   降水 = 地形性降雨(雨影) + 纬度带 + 扰动
   ========================================================= */
(function(root){
"use strict";
const NS = root.FMAP = root.FMAP || {};
const C = NS.core;
const {clamp, makeField, normalize01} = C;
const TYPE_KM=C.TYPE_KM;

function latitudeOf(y, gh, worldType, climate){
  if(worldType==='world') return Math.abs(y/gh-0.5)*2;
  const kmNS=(TYPE_KM[worldType]||3000)*9/16;
  const span=clamp(kmNS/111/90, 0.02, 0.5);
  return clamp(climate+(y/gh-0.5)*span, 0, 1);
}

function latitudeRain(deg){
  const g=(c,w)=>Math.exp(-((deg-c)/w)*((deg-c)/w));
  let v=0.16
        + 1.00*g(2,13)      // 热带辐合带
        + 0.52*g(52,17)     // 中纬度低压带
        - 0.42*g(28,11)     // 亚热带高压带
        - 0.34*g(88,20);    // 极高压带
  return clamp(v,0,1);
}

/* 地形性降雨：迎风降水、背风雨影 */
function orographicSweep(gw,gh,elev,sea,wind,out){
  const horiz=(wind===0||wind===1);
  const lines=horiz?gh:gw, len=horiz?gw:gh;
  const fwd=(wind===0||wind===2);
  for(let l=0;l<lines;l++){
    let m=0.85, pe=-1;
    for(let s=0;s<len;s++){
      const t=fwd?s:len-1-s;
      const x=horiz?t:l, y=horiz?l:t;
      const i=y*gw+x, e=elev[i];
      if(pe<0) pe=e;
      if(e<sea){
        m=Math.min(1,m+0.10);
      } else {
        const slope=Math.max(0,e-pe);
        const rain=m*(0.015+slope*5.0);
        m=Math.max(0,m-rain)-0.0015;
        if(m<0)m=0;
      }
      out[i]=m; pe=e;
    }
  }
}

function windDegOf(P){ return P.windDeg==null ? [0,180,90,270][P.wind||0] : P.windDeg; }
const WIND_AXIS={0:[1,0],90:[0,1],180:[-1,0],270:[0,-1]};
function windVecOf(P){
  const deg=((windDegOf(P)%360)+360)%360;
  const ax=WIND_AXIS[deg];
  if(ax) return {x:ax[0], y:ax[1], deg};
  const a=deg*Math.PI/180;
  return {x:Math.cos(a), y:Math.sin(a), deg};
}

function build(T,P,opts){
  const {gw,gh,elev,sea,wrap,worldType}=T;
  const n=gw*gh;
  const latOf=(opts&&opts.latOf)||(y=>latitudeOf(y,gh,worldType,P.climate));
  const tempF  =makeField(P.seed^0x2f6a1d3b, wrap);
  const moistF =makeField(P.seed^0x51ed270b, wrap);

  // 距海距离（BFS）
  const seaDist=new Int32Array(n).fill(-1);
  const q=new Int32Array(n); let qh=0,qt=0;
  for(let i=0;i<n;i++) if(elev[i]<sea){ seaDist[i]=0; q[qt++]=i; }
  while(qh<qt){
    const i=q[qh++], x=i%gw, y=(i/gw)|0, d=seaDist[i];
    for(let k=0;k<4;k++){
      const nx=x+C.N4[k][0], ny=y+C.N4[k][1];
      if(nx<0||ny<0||nx>=gw||ny>=gh)continue;
      const j=ny*gw+nx;
      if(seaDist[j]===-1){ seaDist[j]=d+1; q[qt++]=j; }
    }
  }
  const coastScale=gw*0.16;
  let hasSea=false;
  for(let i=0;i<n;i++) if(elev[i]<sea){ hasSea=true; break; }

  // 曝光度（风浪大小）
  const wv=windVecOf(P);
  const W=[wv.x,wv.y];
  const exposure=new Int8Array(n);
  if(hasSea){
    const landDist=new Int16Array(n).fill(-1);
    const q2=new Int32Array(n); let h2=0,t2=0;
    const bandSea=Math.max(3,Math.round(gw*0.05));
    for(let i=0;i<n;i++) if(elev[i]>=sea){ landDist[i]=0; q2[t2++]=i; }
    while(h2<t2){
      const i=q2[h2++], d=landDist[i];
      if(d>=bandSea)continue;
      const x=i%gw, y=(i/gw)|0;
      for(let k=0;k<4;k++){
        let nx=x+C.N4[k][0]; const ny=y+C.N4[k][1];
        if(ny<0||ny>=gh)continue;
        if(wrap){ nx=(nx+gw)%gw; } else if(nx<0||nx>=gw) continue;
        const j=ny*gw+nx;
        if(elev[j]>=sea||landDist[j]>=0)continue;
        landDist[j]=d+1; q2[t2++]=j;
      }
    }
    const F=Math.max(6,Math.round(gw*0.15));
    for(let y=0;y<gh;y++)for(let x=0;x<gw;x++){
      const i=y*gw+x;
      const nearCoast=(elev[i]>=sea&&seaDist[i]<=3)||(elev[i]<sea&&landDist[i]>=1);
      if(!nearCoast)continue;
      let open=F;
      for(let s=1;s<=F;s++){
        let sx2=x-W[0]*s; const sy2=y-W[1]*s;
        if(sy2<0||sy2>=gh){ break; }
        if(wrap){ sx2=(sx2+gw)%gw; } else if(sx2<0||sx2>=gw){ break; }
        if(elev[(sy2|0)*gw+(sx2|0)]>=sea){ open=s; break; }
      }
      exposure[i]= open>=F*0.6 ? 1 : open<=F*0.2 ? -1 : 0;
    }
  }

  // 潮流（东岸暖、西岸寒）
  const curAmp=hasSea?clamp((TYPE_KM[worldType]||3000)/9000,0,1):0;
  const curBand=Math.max(4,Math.round(gw*0.10));
  const curP=new Float32Array(n);
  const eastnessOf=(x,y)=>{
    const idx=(xx)=>{ if(wrap) xx=(xx+gw)%gw; else xx=Math.max(0,Math.min(gw-1,xx)); return y*gw+xx; };
    const a=seaDist[idx(x-2)], b=seaDist[idx(x+2)];
    return clamp((a-b)/3,-1,1);
  };

  // 气温
  const temp=new Float32Array(n);
  const invSea=1/(1-sea);
  for(let y=0;y<gh;y++){
    const lat=latOf(y);
    const deg=lat*90;
    const baseT=32-46*Math.pow(lat,1.35);
    const dryF=Math.exp(-((deg-24)/14)*((deg-24)/14));
    for(let x=0;x<gw;x++){
      const i=y*gw+x, u=x/gw, v=y/gw;
      const h=Math.max(0,(elev[i]-sea)*invSea);
      let t=baseT-28*h;
      const cont=clamp((seaDist[i]<0?0:seaDist[i])/coastScale,0,1);
      t-=cont*3.2*Math.pow(lat,0.6);
      t+=tempF.fbm(u,v,3.2,3)*2.6;
      if(curAmp>0.05&&elev[i]>=sea&&seaDist[i]<=curBand){
        const en=eastnessOf(x,y);
        const bandF=1-seaDist[i]/curBand;
        if(en>0){ t+=2.2*en*bandF*curAmp; curP[i]+= 0.10*en*bandF*curAmp; }
        else    { t+=1.6*en*bandF*curAmp; curP[i]-=(0.10+0.26*dryF)*(-en)*bandF*curAmp; }
      }
      temp[i]=t;
    }
  }

  // 降水
  const oro=new Float32Array(n);
  if(wv.deg%90===0){
    const wcode=wv.x>0?0:wv.x<0?1:wv.y>0?2:3;
    orographicSweep(gw,gh,elev,sea,wcode,oro);
  } else {
    const ax=Math.abs(wv.x), ay=Math.abs(wv.y);
    const oX=new Float32Array(n), oY=new Float32Array(n);
    orographicSweep(gw,gh,elev,sea, wv.x>0?0:1, oX);
    orographicSweep(gw,gh,elev,sea, wv.y>0?2:3, oY);
    const inv=1/(ax+ay);
    for(let i=0;i<n;i++) oro[i]=(oX[i]*ax+oY[i]*ay)*inv;
  }
  const precip=new Float32Array(n);
  for(let y=0;y<gh;y++){
    const lat=latOf(y);
    const band=latitudeRain(lat*90);
    for(let x=0;x<gw;x++){
      const i=y*gw+x, u=x/gw, v=y/gw;
      const noise=moistF.fbm01(u,v,2.2,4);
      const warm=clamp((temp[i]+14)/44,0.15,1);
      precip[i]=(oro[i]*0.46+band*0.32+noise*0.22)*(0.55+0.45*warm);
    }
  }
  normalize01(precip);
  for(let i=0;i<n;i++) precip[i]=clamp(precip[i]-P.arid+curP[i],0,1);

  return {temp,precip,seaDist,exposure};
}

NS.climate={build,latitudeOf,latitudeRain,windVecOf,windDegOf};
})(typeof self!=='undefined'?self:this);
