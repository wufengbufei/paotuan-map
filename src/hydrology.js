/* =========================================================
   奇幻地图 / hydrology — 洼地填充 → D8流向 → 流量累积 → 河川・湖
   ========================================================= */
(function(root){
"use strict";
const NS = root.FMAP = root.FMAP || {};
const C = NS.core;
const {clamp, MinHeap, N8, N4} = C;
const EPS=1e-9;

/* Priority-Flood 洼地填充 */
function fillDepressions(gw,gh,elev,sea,wrap){
  const n=gw*gh;
  const filled=new Float64Array(n);
  for(let i=0;i<n;i++) filled[i]=elev[i];
  const closed=new Uint8Array(n);
  const heap=new MinHeap(Math.max(1024,(n>>1)));
  for(let y=0;y<gh;y++)for(let x=0;x<gw;x++){
    const i=y*gw+x;
    const border = wrap ? (y===0||y===gh-1) : (x===0||y===0||x===gw-1||y===gh-1);
    if(elev[i]<sea||border){ closed[i]=1; heap.push(i,filled[i]); }
  }
  while(heap.size){
    const i=heap.pop(), e=filled[i];
    const x=i%gw, y=(i/gw)|0;
    for(let k=0;k<8;k++){
      let nx=x+N8[k][0]; const ny=y+N8[k][1];
      if(ny<0||ny>=gh)continue;
      if(wrap){ nx=(nx+gw)%gw; } else if(nx<0||nx>=gw) continue;
      const j=ny*gw+nx;
      if(closed[j])continue;
      closed[j]=1;
      if(filled[j]<=e) filled[j]=e+EPS;
      heap.push(j,filled[j]);
    }
  }
  return filled;
}

/* 湖：填充量超阈值的连通区域 */
function findLakes(gw,gh,elev,filled,sea,minArea,minDepth,maxCount,minAreaAfter,precip){
  const n=gw*gh;
  const cand=new Uint8Array(n);
  for(let i=0;i<n;i++) if(elev[i]>=sea && filled[i]-elev[i]>minDepth) cand[i]=1;
  const {label,sizes,count}=C.labelComponents(i=>cand[i]===1,gw,gh);
  const keep=new Uint8Array(count);
  const idx=[];
  for(let k=0;k<count;k++) if(sizes[k]>=minArea) idx.push(k);
  idx.sort((a,b)=>sizes[b]-sizes[a]);
  const lim=Math.min(idx.length, maxCount||idx.length);
  for(let k=0;k<lim;k++) keep[idx[k]]=1;
  const maxArea=Math.max(minArea*3, Math.round(n*0.005));
  const comp={};
  for(let i=0;i<n;i++){
    const l=label[i];
    if(l<0||!keep[l])continue;
    (comp[l]=comp[l]||[]).push(i);
  }
  const mask=new Uint8Array(n);
  const lakes=[];
  let pSum=0,pN=0;
  if(precip){ for(let i=0;i<n;i++) if(elev[i]>=sea){ pSum+=precip[i]; pN++; } }
  const pMean=pN?pSum/pN:1;
  for(const l in comp){
    const cells=comp[l];
    let minE=Infinity, spill=-Infinity, pB=0;
    for(const i of cells){
      if(elev[i]<minE)minE=elev[i];
      if(filled[i]>spill)spill=filled[i];
      if(precip) pB+=precip[i];
    }
    const wetness=precip?Math.min(1,Math.max(0,(pB/cells.length)/(pMean*0.85))):1;
    if(wetness<0.22) continue;
    let lo=minE, hi=minE+(spill-minE)*0.5*wetness, level=hi;
    let wet=cells.filter(i=>elev[i]<=level);
    for(let it=0; it<7 && wet.length>maxArea; it++){
      hi=level; level=(lo+level)/2;
      wet=cells.filter(i=>elev[i]<=level);
    }
    if(wet.length<(minAreaAfter||minArea)) continue;
    let sx=0,sy=0;
    for(const i of wet){ mask[i]=1; sx+=i%gw; sy+=(i/gw)|0; }
    lakes.push({id:+l, cells:wet.length, level, x:sx/wet.length, y:sy/wet.length, area:wet.length});
  }
  lakes.sort((a,b)=>b.area-a.area);
  return {mask,lakes};
}

/* D8 流向 */
function flowDirections(gw,gh,filled,elev,sea,wrap){
  const n=gw*gh, recv=new Int32Array(n).fill(-1);
  const D=[1,1,1,1,1.4142135,1.4142135,1.4142135,1.4142135];
  for(let i=0;i<n;i++){
    if(elev[i]<sea) continue;
    const x=i%gw, y=(i/gw)|0;
    let best=-1, bestDrop=0;
    for(let k=0;k<8;k++){
      let nx=x+N8[k][0]; const ny=y+N8[k][1];
      if(ny<0||ny>=gh)continue;
      if(wrap){ nx=(nx+gw)%gw; } else if(nx<0||nx>=gw) continue;
      const j=ny*gw+nx;
      const drop=(filled[i]-filled[j])/D[k];
      if(drop>bestDrop){ bestDrop=drop; best=j; }
    }
    recv[i]=best;
  }
  return recv;
}

/* 流量累积 */
function flowAccumulation(gw,gh,filled,recv,elev,sea,precip){
  const n=gw*gh;
  const acc=new Float32Array(n);
  for(let i=0;i<n;i++) acc[i]= elev[i]<sea ? 0 : 0.25+precip[i];
  const order=new Int32Array(n);
  for(let i=0;i<n;i++) order[i]=i;
  order.sort((a,b)=>filled[b]-filled[a]);
  for(let k=0;k<n;k++){
    const i=order[k], r=recv[i];
    if(r>=0) acc[r]+=acc[i];
  }
  return acc;
}

function smoothPolyline(pts,iter){
  let p=pts;
  const dim=p[0].length;
  for(let k=0;k<(iter||1);k++){
    const out=[p[0]];
    for(let i=0;i<p.length-1;i++){
      const a=p[i], b=p[i+1], q=new Array(dim), r=new Array(dim);
      for(let d=0;d<dim;d++){ q[d]=a[d]*0.75+b[d]*0.25; r[d]=a[d]*0.25+b[d]*0.75; }
      out.push(q,r);
    }
    out.push(p[p.length-1]);
    p=out;
  }
  return p;
}

/* 河川折线提取 */
function traceRivers(gw,gh,acc,recv,elev,sea,lakeMask,threshold,wrap){
  const n=gw*gh;
  const isRiver=new Uint8Array(n);
  let accMax=0;
  for(let i=0;i<n;i++){
    if(elev[i]<sea||lakeMask[i])continue;
    if(acc[i]>=threshold){ isRiver[i]=1; if(acc[i]>accMax)accMax=acc[i]; }
  }
  if(accMax<=0) return {isRiver,lines:[],mouths:[],confluences:[],accMax:0};

  const mainChild=new Int32Array(n).fill(-1);
  const hasChild=new Uint8Array(n);
  const childCnt=new Uint8Array(n);
  for(let i=0;i<n;i++){
    if(!isRiver[i])continue;
    const r=recv[i];
    if(r<0||!isRiver[r])continue;
    hasChild[r]=1;
    if(childCnt[r]<255) childCnt[r]++;
    if(mainChild[r]<0||acc[i]>acc[mainChild[r]]) mainChild[r]=i;
  }

  const wOf=a=>Math.pow(clamp(a/accMax,0,1),0.42);
  const px=i=>(i%gw)+0.5, py=i=>((i/gw)|0)+0.5;
  const lines=[], mouths=[];
  for(let s=0;s<n;s++){
    if(!isRiver[s]||hasChild[s])continue;
    const pts=[[px(s),py(s),wOf(acc[s])]];
    let i=s, guard=0, lastX=px(s);
    while(guard++<n){
      const r=recv[i];
      if(r<0) break;
      let rx=px(r);
      if(wrap && Math.abs(rx-lastX)>gw*0.5) break;
      pts.push([rx,py(r),wOf(Math.max(acc[r],acc[i]))]);
      lastX=rx;
      if(elev[r]<sea){ mouths.push(r); break; }
      if(lakeMask[r]) break;
      if(!isRiver[r]) break;
      if(mainChild[r]!==i) break;
      i=r;
    }
    if(pts.length>=3) lines.push(smoothPolyline(pts,2));
  }
  const confluences=[];
  for(let i=0;i<n;i++) if(isRiver[i]&&childCnt[i]>=2) confluences.push(i);
  return {isRiver,lines,mouths,confluences,accMax};
}

/* 河畔湿润化 */
function riparianBoost(gw,gh,precip,isRiver,lakeMask,elev,sea,reach,amount){
  const n=gw*gh;
  const d=new Int32Array(n).fill(-1);
  const q=new Int32Array(n); let qh=0,qt=0;
  for(let i=0;i<n;i++) if(isRiver[i]||lakeMask[i]){ d[i]=0; q[qt++]=i; }
  while(qh<qt){
    const i=q[qh++], dd=d[i];
    if(dd>=reach)continue;
    const x=i%gw, y=(i/gw)|0;
    for(let k=0;k<4;k++){
      const nx=x+N4[k][0], ny=y+N4[k][1];
      if(nx<0||ny<0||nx>=gw||ny>=gh)continue;
      const j=ny*gw+nx;
      if(d[j]===-1&&elev[j]>=sea){ d[j]=dd+1; q[qt++]=j; }
    }
  }
  const add=new Float32Array(n);
  for(let i=0;i<n;i++){
    if(d[i]<0)continue;
    add[i]=amount*(1-d[i]/(reach+1));
  }
  return {dist:d,add};
}

/* 泛滥原均整 */
function floodplain(gw,gh,elev,sea,isRiver,acc,accMax,plain){
  const n=gw*gh;
  const reach=Math.max(2,Math.round(gw*(0.010+0.030*plain)));
  const src=new Float64Array(n);
  const d=new Int32Array(n).fill(-1);
  const q=new Int32Array(n); let qh=0,qt=0;
  const big=accMax*0.10;
  for(let i=0;i<n;i++){
    if(isRiver[i]&&acc[i]>=big){ d[i]=0; src[i]=elev[i]; q[qt++]=i; }
  }
  while(qh<qt){
    const i=q[qh++], dd=d[i];
    if(dd>=reach)continue;
    const x=i%gw, y=(i/gw)|0;
    for(let k=0;k<4;k++){
      const nx=x+N4[k][0], ny=y+N4[k][1];
      if(nx<0||ny<0||nx>=gw||ny>=gh)continue;
      const j=ny*gw+nx;
      if(d[j]!==-1||elev[j]<sea)continue;
      d[j]=dd+1; src[j]=src[i]; q[qt++]=j;
    }
  }
  const add=new Float32Array(n);
  const strength=0.55+0.45*plain;
  for(let i=0;i<n;i++){
    if(d[i]<0)continue;
    const t=1-d[i]/(reach+1);
    const target=src[i];
    add[i]=(target-elev[i])*t*strength*0.5;
  }
  return add;
}

/* 河谷雕刻 */
function carveValleys(elev,gw,gh,sea,rivers,lakeMask){
  for(const r of rivers){
    let minE=Infinity;
    for(const p of r){
      const x=Math.floor(p[0]), y=Math.floor(p[1]);
      if(x<0||y<0||x>=gw||y>=gh)continue;
      const i=y*gw+x;
      if(elev[i]<minE) minE=elev[i];
      else elev[i]=Math.max(sea+0.001, minE+0.0005);
    }
  }
}

function build(T,CL,P){
  const {gw,gh,elev,sea,wrap}=T;
  const n=gw*gh;
  const filled=fillDepressions(gw,gh,elev,sea,wrap);
  const lakeRes=findLakes(gw,gh,elev,filled,sea,
    Math.max(6,Math.round(n*0.00006*(0.2+P.lakeAmount*2.2))),
    0.004,
    Math.round(4+P.lakeAmount*14),
    Math.max(4,Math.round(n*0.00004)),
    CL.precip);
  const recv=flowDirections(gw,gh,filled,elev,sea,wrap);
  const acc=flowAccumulation(gw,gh,filled,recv,elev,sea,CL.precip);
  let accMax=0;
  for(let i=0;i<n;i++) if(acc[i]>accMax)accMax=acc[i];
  const threshold=accMax*(0.055-0.038*(P.riverDensity==null?0.45:P.riverDensity));
  const riverRes=traceRivers(gw,gh,acc,recv,elev,sea,lakeRes.mask,threshold,wrap);
  const rip=riparianBoost(gw,gh,CL.precip,riverRes.isRiver,lakeRes.mask,elev,sea,
    Math.max(3,Math.round(gw*0.02)),0.16);
  const plain=clamp(P.plain==null?0:P.plain,0,1);
  const elevAdd=plain>0?floodplain(gw,gh,elev,sea,riverRes.isRiver,acc,riverRes.accMax,plain):null;
  return {filled,recv,acc,accMax:riverRes.accMax,
          lakeMask:lakeRes.mask,lakes:lakeRes.lakes,
          isRiver:riverRes.isRiver,rivers:riverRes.lines,
          mouths:riverRes.mouths,confluences:riverRes.confluences,
          waterDist:rip.dist,precipAdd:rip.add,elevAdd};
}

NS.hydrology={build,fillDepressions,findLakes,flowDirections,flowAccumulation,
              smoothPolyline,traceRivers,riparianBoost,floodplain,carveValleys};
})(typeof self!=='undefined'?self:this);
