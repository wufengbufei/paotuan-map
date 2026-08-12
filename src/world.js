/* =========================================================
   奇幻地图 / world — 城市・国家（领土与国境）・地名标签
   ========================================================= */
(function(root){
"use strict";
const NS = root.FMAP = root.FMAP || {};
const C = NS.core, B = NS.biome;
const {clamp, makeRng, MinHeap, N4, N8, labelComponents, distanceInside} = C;
const BI = B.BIOME;

/* 连通区域的主轴（标签沿地形走向旋转） */
function principalAxis(cells,gw){
  const n=cells.length;
  let sx=0,sy=0;
  for(let k=0;k<n;k++){ sx+=cells[k]%gw; sy+=(cells[k]/gw)|0; }
  const cx=sx/n, cy=sy/n;
  let sxx=0,sxy=0,syy=0;
  for(let k=0;k<n;k++){
    const dx=(cells[k]%gw)-cx, dy=((cells[k]/gw)|0)-cy;
    sxx+=dx*dx; sxy+=dx*dy; syy+=dy*dy;
  }
  sxx/=n; sxy/=n; syy/=n;
  const angle=0.5*Math.atan2(2*sxy, sxx-syy);
  const tr=sxx+syy, det=sxx*syy-sxy*sxy;
  const d=Math.sqrt(Math.max(0,tr*tr/4-det));
  const l1=tr/2+d, l2=tr/2-d;
  return {cx,cy,angle,elong:l2>0?Math.sqrt(l1/l2):99,len:Math.sqrt(Math.max(l1,0))*2};
}

function groupComponents(test,gw,gh,minArea,wrapX){
  const {label,sizes,count}=labelComponents(test,gw,gh,wrapX);
  const groups=[];
  for(let k=0;k<count;k++) groups.push(sizes[k]>=minArea?[]:null);
  for(let i=0;i<label.length;i++){
    const l=label[i];
    if(l>=0&&groups[l]) groups[l].push(i);
  }
  return {label,groups:groups.filter(Boolean).sort((a,b)=>b.length-a.length)};
}

function innerPoint(cells,gw,gh){
  const set=new Uint8Array(gw*gh);
  for(const i of cells) set[i]=1;
  const d=distanceInside(i=>set[i]===1,gw,gh);
  let best=cells[0], bd=-1;
  for(const i of cells) if(d[i]>bd){ bd=d[i]; best=i; }
  return {x:(best%gw)+0.5, y:((best/gw)|0)+0.5, r:bd};
}

/* ---------- 城市选址 ---------- */
function pickCities(o,P){
  const {gw,gh,elev,sea,temp,biome,lakeMask,isRiver,acc,accMax,waterDist}=o;
  const n=gw*gh, invSea=1/(1-sea);
  const score=new Float32Array(n);
  const coastal=new Uint8Array(n);
  const mouth=new Uint8Array(n);

  for(let y=1;y<gh-1;y++)for(let x=1;x<gw-1;x++){
    const i=y*gw+x, b=biome[i];
    if(b<B.LAND_MIN) continue;
    const h=(elev[i]-sea)*invSea;
    if(h>0.58) continue;
    if(b===BI.ICE||b===BI.SNOW||b===BI.ROCK) continue;

    let s=0.25;
    let nearOcean=false, nearRiver=false, nearLake=false;
    for(let k=0;k<8;k++){
      const j=(y+N8[k][1])*gw+(x+N8[k][0]);
      const bj=biome[j];
      if(bj<=BI.SHALLOW) nearOcean=true;
      else if(bj===BI.RIVER) nearRiver=true;
      else if(bj===BI.LAKE) nearLake=true;
    }
    if(b===BI.RIVER) nearRiver=true;
    if(nearOcean){ s+=0.75; coastal[i]=1; }
    if(nearRiver) s+=0.70+0.55*clamp(acc[i]/(accMax||1),0,1);
    if(nearOcean&&nearRiver){ s+=0.55; mouth[i]=1; }
    if(nearLake) s+=0.40;
    const sl=Math.abs(elev[i+1]-elev[i-1])+Math.abs(elev[i+gw]-elev[i-gw]);
    const flat=clamp(1-sl*26,0,1);
    s+=0.55*flat;
    if(nearRiver&&!nearOcean){
      const flow=acc[i]/(accMax||1);
      const bigRiver=clamp(flow/0.22,0,1);
      s+=1.5*bigRiver*flat;
    }
    const dt=(temp[i]-14)/17; s+=0.55*Math.exp(-dt*dt);
    switch(b){
      case BI.GRASS: case BI.FOREST: s+=0.45; break;
      case BI.STEPPE: case BI.SHRUB: s+=0.30; break;
      case BI.SAVANNA: s+=0.18; break;
      case BI.TAIGA: s-=0.10; break;
      case BI.WETLAND: s-=0.35; break;
      case BI.TUNDRA: s-=0.55; break;
      case BI.DESERT: s-=0.70; break;
    }
    if(waterDist&&waterDist[i]>=0) s+=0.20;
    score[i]=Math.max(0,s);
  }

  const cand=[];
  for(let i=0;i<n;i++) if(score[i]>0.55) cand.push(i);
  cand.sort((a,b)=>score[b]-score[a]);
  const want=P.cityCount|0;
  const minSep=Math.max(4, gw*0.052);
  const cities=[];
  for(const i of cand){
    if(cities.length>=want) break;
    const x=(i%gw)+0.5, y=((i/gw)|0)+0.5;
    let ok=true;
    for(const c of cities) if(Math.hypot(c.x-x,c.y-y)<minSep){ ok=false; break; }
    if(!ok) continue;
    cities.push({id:'auto-city-'+i,i,x,y,score:score[i],coastal:coastal[i]===1,mouth:mouth[i]===1,
                 type:'town',name:'',region:-1});
  }
  return cities;
}

/* ---------- 国家生长 ---------- */
function geoOf(P){
  return Object.assign({mountains:1,rivers:1,deserts:1,frontier:1,sail:1},P.geo||{});
}
function ownerCodeFor(stableId){
  const s=String(stableId||'');
  let h=2166136261>>>0;
  for(let i=0;i<s.length;i++){
    const c=s.charCodeAt(i);
    h^=c&255; h=Math.imul(h,16777619);
    h^=c>>>8; h=Math.imul(h,16777619);
  }
  return (0x40000000|(h&0x3fffffff))|0;
}

function annexIslands(o,owner,P){
  const geo=geoOf(P);
  if(geo.sail<=0) return;
  const {gw,gh,biome}=o;
  const n=gw*gh;
  const isWater=i=>biome[i]<=BI.SHALLOW;
  const land=i=>biome[i]>=B.LAND_MIN||biome[i]===BI.RIVER;
  const limit=Math.max(3,Math.round(gw*0.05*geo.sail));
  const wrapX=!!o.wrap;
  const wOwn=new Int32Array(n).fill(-1);
  const wDist=new Int32Array(n).fill(-1);
  const q=[];
  for(let y=0;y<gh;y++)for(let x=0;x<gw;x++){
    const i=y*gw+x;
    if(owner[i]<0||!land(i)) continue;
    for(let k=0;k<4;k++){
      let nx=x+N4[k][0]; const ny=y+N4[k][1];
      if(ny<0||ny>=gh) continue;
      if(wrapX){ nx=(nx+gw)%gw; } else if(nx<0||nx>=gw) continue;
      if(isWater(ny*gw+nx)){ wOwn[i]=owner[i]; wDist[i]=0; q.push(i); break; }
    }
  }
  for(let h=0;h<q.length;h++){
    const i=q[h], d=wDist[i];
    if(d>=limit) continue;
    const x=i%gw, y=(i/gw)|0;
    for(let k=0;k<4;k++){
      let nx=x+N4[k][0]; const ny=y+N4[k][1];
      if(ny<0||ny>=gh) continue;
      if(wrapX){ nx=(nx+gw)%gw; } else if(nx<0||nx>=gw) continue;
      const j=ny*gw+nx;
      if(!isWater(j)||wDist[j]>=0) continue;
      wDist[j]=d+1; wOwn[j]=wOwn[i]; q.push(j);
    }
  }
  const maxCells=Math.max(20,n*0.02);
  groupComponents(i=>owner[i]<0&&land(i),gw,gh,1,wrapX).groups.forEach(cells=>{
    if(cells.length>maxCells) return;
    let touchesOwned=false;
    let bestOwn=-1, bestD=Infinity;
    for(const i of cells){
      const x=i%gw, y=(i/gw)|0;
      for(let k=0;k<4;k++){
        let nx=x+N4[k][0];
        const ny=y+N4[k][1];
        if(ny<0||ny>=gh) continue;
        if(wrapX){ nx=(nx+gw)%gw; } else if(nx<0||nx>=gw) continue;
        const j=ny*gw+nx;
        if(land(j)&&owner[j]>=0){ touchesOwned=true; break; }
        if(isWater(j)&&wOwn[j]>=0&&wDist[j]<bestD){ bestD=wDist[j]; bestOwn=wOwn[j]; }
      }
      if(touchesOwned) break;
    }
    if(touchesOwned||bestOwn<0) return;
    for(const i of cells) owner[i]=bestOwn;
  });
}

function growNations(o,capitals,P){
  const {gw,gh,elev,sea,biome}=o;
  const n=gw*gh, invSea=1/(1-sea);
  const owner=new Int32Array(n).fill(-1);
  const dist=new Float64Array(n).fill(Infinity);
  const heap=new MinHeap(Math.max(1024,n>>1));
  capitals.forEach((c,id)=>{ owner[c.i]=id; dist[c.i]=0; heap.push(c.i,0); });

  const geo=geoOf(P);
  const costOf=i=>{
    const b=biome[i];
    if(b<B.LAND_MIN&&b!==BI.RIVER) return Infinity;
    const h=(elev[i]-sea)*invSea;
    let c=1;
    if(h>0.60) c+=7*geo.mountains;
    else if(h>0.40) c+=2*geo.mountains;
    if(b===BI.DESERT||b===BI.ICE) c+=3*geo.deserts;
    if(b===BI.TUNDRA||b===BI.WETLAND) c+=1.5*geo.deserts;
    if(b===BI.RIVER) c+=2.5*geo.rivers;
    return c;
  };

  const wrapX=!!o.wrap;
  while(heap.size){
    const i=heap.pop();
    const x=i%gw, y=(i/gw)|0, d0=dist[i], id=owner[i];
    for(let k=0;k<4;k++){
      let nx=x+N4[k][0]; const ny=y+N4[k][1];
      if(ny<0||ny>=gh)continue;
      if(wrapX){ nx=(nx+gw)%gw; } else if(nx<0||nx>=gw) continue;
      const j=ny*gw+nx;
      const c=costOf(j);
      if(!isFinite(c))continue;
      const nd=d0+c;
      if(nd<dist[j]){ dist[j]=nd; owner[j]=id; heap.push(j,nd); }
    }
  }
  const fr=geo.frontier;
  if(fr>0){
    const reach=Math.max(gw*0.55, 40)*(1+P.nations*0.05)/fr;
    for(let i=0;i<n;i++) if(dist[i]>reach) owner[i]=-1;
  }
  return {owner,dist};
}

/* 国境线链 */
function borderChains(owner,gw,gh,biome){
  const segs=[];
  const land=i=>biome[i]>=B.LAND_MIN||biome[i]===BI.RIVER;
  const outer=i=>owner[i]<0||!land(i);
  for(let y=0;y<gh;y++)for(let x=0;x<gw;x++){
    const i=y*gw+x;
    if(outer(i))continue;
    if(x+1<gw){
      const j=i+1;
      if(!outer(j)&&owner[j]!==owner[i]) segs.push([[x+1,y],[x+1,y+1]]);
    }
    if(y+1<gh){
      const j=i+gw;
      if(!outer(j)&&owner[j]!==owner[i]) segs.push([[x,y+1],[x+1,y+1]]);
    }
  }
  return C.stitchChains(segs,true)
    .filter(o=>o.pts.length>=4)
    .map(o=>C.chaikin(o.pts,2,o.closed));
}

/* 领土与无主地的边界 */
function frontierChains(owner,gw,gh,biome){
  const segs=[];
  const land=i=>biome[i]>=B.LAND_MIN||biome[i]===BI.RIVER;
  for(let y=0;y<gh;y++)for(let x=0;x<gw;x++){
    const i=y*gw+x;
    if(owner[i]<0||!land(i))continue;
    if(x+1<gw){
      const j=i+1;
      if(land(j)&&owner[j]<0) segs.push([[x+1,y],[x+1,y+1]]);
    }
    if(x>0){
      const j=i-1;
      if(land(j)&&owner[j]<0) segs.push([[x,y],[x,y+1]]);
    }
    if(y+1<gh){
      const j=i+gw;
      if(land(j)&&owner[j]<0) segs.push([[x,y+1],[x+1,y+1]]);
    }
    if(y>0){
      const j=i-gw;
      if(land(j)&&owner[j]<0) segs.push([[x,y],[x+1,y]]);
    }
  }
  return C.stitchChains(segs,true)
    .filter(o=>o.pts.length>=6)
    .map(o=>C.chaikin(o.pts,2,o.closed));
}

/* 3D 光壁用海上国境 */
function seaBorderChains(o,owner){
  const {gw,gh,biome}=o;
  const n=gw*gh;
  const limit=Math.max(6,Math.round(gw*0.05));
  const ext=Int32Array.from(owner);
  const dist=new Int32Array(n).fill(-1);
  const q=[];
  const isWater=i=>biome[i]<=BI.SHALLOW;
  for(let i=0;i<n;i++){
    if(owner[i]>=0&&!isWater(i)){ dist[i]=0; q.push(i); }
    else if(isWater(i)) ext[i]=-1;
  }
  for(let h=0;h<q.length;h++){
    const i=q[h], d=dist[i];
    if(d>=limit) continue;
    const x=i%gw, y=(i/gw)|0;
    for(let k=0;k<4;k++){
      const nx=x+N4[k][0], ny=y+N4[k][1];
      if(nx<0||ny<0||nx>=gw||ny>=gh) continue;
      const j=ny*gw+nx;
      if(!isWater(j)||dist[j]>=0) continue;
      dist[j]=d+1; ext[j]=ext[i]; q.push(j);
    }
  }
  const segs=[];
  const outer=i=>ext[i]<0;
  for(let y=0;y<gh;y++)for(let x=0;x<gw;x++){
    const i=y*gw+x;
    if(outer(i))continue;
    if(x+1<gw){
      const j=i+1;
      if(!outer(j)&&ext[j]!==ext[i]) segs.push([[x+1,y],[x+1,y+1]]);
    }
    if(y+1<gh){
      const j=i+gw;
      if(!outer(j)&&ext[j]!==ext[i]) segs.push([[x,y+1],[x+1,y+1]]);
    }
  }
  return C.stitchChains(segs,true)
    .filter(c2=>c2.pts.length>=4)
    .map(c2=>C.chaikin(c2.pts,2,c2.closed));
}

/* ---------- 封闭海域检测（湾/地域海） ---------- */
function findEnclosedSeas(biome,gw,gh,Rfrac,thr,minAreaFrac,wrapX){
  const sat=new Float64Array((gw+1)*(gh+1));
  for(let y=0;y<gh;y++)for(let x=0;x<gw;x++){
    const land=biome[y*gw+x]>=B.LAND_MIN?1:0;
    sat[(y+1)*(gw+1)+x+1]=land+sat[y*(gw+1)+x+1]+sat[(y+1)*(gw+1)+x]-sat[y*(gw+1)+x];
  }
  const R=Math.max(5,Math.round(gw*Rfrac));
  const frac=(x,y)=>{
    const x0=Math.max(0,x-R),y0=Math.max(0,y-R),x1=Math.min(gw,x+R+1),y1=Math.min(gh,y+R+1);
    const s=sat[y1*(gw+1)+x1]-sat[y0*(gw+1)+x1]-sat[y1*(gw+1)+x0]+sat[y0*(gw+1)+x0];
    return s/((x1-x0)*(y1-y0));
  };
  const enclosed=i=>{
    if(biome[i]>BI.SHALLOW) return false;
    return frac(i%gw,(i/gw)|0)>thr;
  };
  return groupComponents(enclosed,gw,gh,Math.max(24,gw*gh*minAreaFrac),wrapX).groups;
}

/* ---------- 标签候选 ---------- */
function buildLabels(o,LN,cities,nations,P,marks){
  const {gw,gh,biome,elev,sea,lakes,rivers}=o;
  const out=[];
  const area=gw*gh;
  const push=(kind,text,x,y,opt)=>{
    if(!text)return;
    const item=Object.assign({kind,text,x,y,angle:0,priority:1},opt);
    if(!item.entityId)item.entityId='geo-'+kind+'-'+Math.round(x*2)+'-'+Math.round(y*2);
    out.push(item);
  };
  const wrapX=!!o.wrap;
  const spansSeam=cells=>{
    let a=false,b=false;
    for(const i of cells){ const x=i%gw; if(x===0)a=true; else if(x===gw-1)b=true; if(a&&b)return true; }
    return false;
  };
  const axisOf=cells=>{
    if(wrapX&&spansSeam(cells)){
      const half=gw>>1;
      const ax=principalAxis(cells.map(i=>{const x=i%gw; return i-x+((x+half)%gw);}),gw);
      ax.cx=(ax.cx+gw-half)%gw;
      return ax;
    }
    return principalAxis(cells,gw);
  };

  if(P.features.labels){
    const oc=groupComponents(i=>biome[i]<=BI.SHALLOW,gw,gh,Math.max(60,area*0.012),wrapX);
    oc.groups.slice(0,3).forEach((cells,k)=>{
      const p=innerPoint(cells,gw,gh);
      if(p.r<Math.max(5,gw*0.035))return;
      push('ocean', LN.ocean.sea(), p.x,p.y, {priority:5,scale:k===0?1.35:1.1});
    });
    oc.groups.slice(3,6).forEach(cells=>{
      const p=innerPoint(cells,gw,gh);
      if(p.r<Math.max(3,gw*0.02))return;
      push('bay', LN.inner.bay(), p.x,p.y, {priority:2,scale:0.85});
    });
    findEnclosedSeas(biome,gw,gh,0.09,0.30,0.004,wrapX).slice(0,2).forEach(cells=>{
      const p=innerPoint(cells,gw,gh);
      if(p.r<Math.max(3,gw*0.02))return;
      push('ocean', LN.seaR.seaSmall(), p.x,p.y, {priority:4,scale:0.85});
    });
    findEnclosedSeas(biome,gw,gh,0.045,0.46,0.0009,wrapX).slice(0,3).forEach((cells,k)=>{
      const p=innerPoint(cells,gw,gh);
      if(p.r<Math.max(2,gw*0.012))return;
      push('bay', k%2?LN.gulf.seaSmall():LN.gulf.bay(), p.x,p.y, {priority:2,scale:0.72});
    });

    const isl=groupComponents(i=>biome[i]>=B.LAND_MIN,gw,gh,Math.max(20,area*0.0016),wrapX);
    const isleOK=cells=>{
      if(cells.length>area*0.16)return false;
      for(const i of cells){ const x=i%gw,y=(i/gw)|0;
        if(y===0||y===gh-1)return false;
        if(!wrapX&&(x===0||x===gw-1))return false; }
      return true;
    };
    const isleCands=isl.groups.filter(isleOK);
    const isleMax=Math.max(4,Math.min(10,Math.round(isleCands.length*0.6)));
    let isleCount=0;
    isleCands.forEach(cells=>{
      if(isleCount>=isleMax)return;
      const p=innerPoint(cells,gw,gh);
      const ax=axisOf(cells);
      isleCount++;
      push('isle', LN.isle.isle(), p.x,p.y, {priority:3,scale:0.95,
        angle: ax.elong>1.7?clampAngle(ax.angle):0});
    });

    const rng=groupComponents(i=>biome[i]===BI.ROCK||biome[i]===BI.SNOW,gw,gh,Math.max(30,area*0.0035),wrapX);
    rng.groups.slice(0,5).forEach(cells=>{
      const ax=axisOf(cells);
      push('range', LN.range.range(), ax.cx+0.5, ax.cy+0.5,
        {priority:4,scale:1.0,angle:clampAngle(ax.angle),spread:true});
    });
    groupComponents(i=>biome[i]===BI.DESERT,gw,gh,Math.max(40,area*0.006),wrapX).groups.slice(0,3)
      .forEach(cells=>{
        const p=innerPoint(cells,gw,gh), ax=axisOf(cells);
        push('desert', LN.desert.desert(), p.x,p.y,
          {priority:3,scale:1.05,angle:ax.elong>1.7?clampAngle(ax.angle):0,spread:true});
      });
    groupComponents(i=>biome[i]===BI.FOREST||biome[i]===BI.RAINFOREST||biome[i]===BI.TAIGA,
      gw,gh,Math.max(40,area*0.007),wrapX).groups.slice(0,3)
      .forEach(cells=>{
        const p=innerPoint(cells,gw,gh), ax=axisOf(cells);
        push('forest', LN.forest.forest(), p.x,p.y,
          {priority:2,scale:0.92,angle:ax.elong>1.8?clampAngle(ax.angle):0});
      });
    (lakes||[]).slice(0,6).forEach(L=>{
      if(L.area<Math.max(10,area*0.0012))return;
      push('lake', LN.lake.lake(), L.x+0.5,L.y+0.5,{priority:3,scale:0.85});
    });
    const longRivers=(rivers||[]).filter(r=>r.length>Math.max(24,gw*0.35))
      .sort((a,b)=>b.length-a.length).slice(0,4);
    longRivers.forEach(r=>{
      const k=Math.floor(r.length*0.42);
      const a=r[Math.max(0,k-3)], b=r[Math.min(r.length-1,k+3)];
      push('river', LN.river.river(), r[k][0], r[k][1],
        {priority:2,scale:0.78,angle:clampAngle(Math.atan2(b[1]-a[1],b[0]-a[0])),italic:true});
    });
  }

  if(nations&&P.features.labels){
    nations.list.forEach(N=>{
      if(N.cells<12)return;
      const room=(N.inner||0)/(gw*0.075);
      const scale=clamp(0.62+room*0.62,0.95,1.24);
      push('region', N.name, N.labelX, N.labelY,
        {priority:8,scale,spread:scale>0.9,regionId:N.id,entityId:N.stableId,shrink:true});
    });
    (nations.wilds||[]).forEach(W=>{
      const room=(W.inner||0)/(gw*0.075);
      const scale=clamp(0.56+room*0.5,0.82,1.0);
      push('region', W.name, W.labelX, W.labelY,
        {priority:6,scale,wild:true,entityId:W.stableId,shrink:true});
    });
  }

  if(P.features.cities&&P.features.labels){
    cities.forEach(c=>{
      push('city', c.name, c.x, c.y,
        {priority:c.type==='capital'?7:c.type==='city'?4:2,
         scale:c.type==='capital'?0.82:c.type==='city'?0.82:0.72, anchor:true,
         cityType:c.type,entityId:c.id});
    });
  }
  if(P.features.labels&&marks){
    marks.forEach(m=>{
      if(m.name) push('mark', m.name, m.x, m.y,
        {priority:6,scale:0.8,anchor:true,entityId:m.id});
    });
  }
  return out;
}
function clampAngle(a){
  while(a>Math.PI/2) a-=Math.PI;
  while(a<-Math.PI/2) a+=Math.PI;
  const lim=62*Math.PI/180;
  return clamp(a,-lim,lim);
}

/* ---------- 用户放置的吸附 ---------- */
function snapToLand(o,px,py,maxR){
  const {gw,gh,biome}=o;
  const cx=Math.round(px-0.5), cy=Math.round(py-0.5);
  maxR=maxR||Math.max(6,Math.round(o.gw*0.04));
  for(let r=0;r<=maxR;r++){
    for(let dy=-r;dy<=r;dy++)for(let dx=-r;dx<=r;dx++){
      if(Math.max(Math.abs(dx),Math.abs(dy))!==r) continue;
      const x=cx+dx, y=cy+dy;
      if(x<1||y<1||x>=gw-1||y>=gh-1) continue;
      const i=y*gw+x, b=biome[i];
      if(b>=B.LAND_MIN&&b!==BI.ICE) return {i,x:x+0.5,y:y+0.5};
    }
  }
  return null;
}
function isCoastalCell(o,i){
  const {gw,gh,biome}=o;
  const x=i%gw, y=(i/gw)|0;
  for(let k=0;k<8;k++){
    const nx=x+N8[k][0], ny=y+N8[k][1];
    if(nx<0||ny<0||nx>=gw||ny>=gh) continue;
    if(biome[ny*gw+nx]<=BI.SHALLOW) return true;
  }
  return false;
}

/* ---------- 道路与航路 ---------- */
function astarGrid(gw,gh,startI,goalI,cellCost,moveExtra,wrapX){
  const n=gw*gh;
  const dist=new Float64Array(n).fill(Infinity);
  const from=new Int32Array(n).fill(-1);
  const gx=goalI%gw, gy=(goalI/gw)|0;
  const heap=new MinHeap(1024);
  dist[startI]=0; heap.push(startI,0);
  const SQ2=Math.SQRT2;
  let guard=n*6;
  while(heap.size&&guard-->0){
    const i=heap.pop();
    if(i===goalI) break;
    const x=i%gw, y=(i/gw)|0, d0=dist[i];
    for(let k=0;k<8;k++){
      let nx=x+N8[k][0];
      const ny=y+N8[k][1];
      if(ny<0||ny>=gh) continue;
      if(wrapX){ nx=(nx+gw)%gw; } else if(nx<0||nx>=gw) continue;
      const j=ny*gw+nx;
      const cc=cellCost(j);
      if(cc===Infinity) continue;
      const step=(N8[k][0]&&N8[k][1])?SQ2:1;
      const nd=d0+step*(cc+(moveExtra?moveExtra(i,j):0));
      if(nd<dist[j]-1e-9){
        dist[j]=nd; from[j]=i;
        let hx=Math.abs(nx-gx);
        if(wrapX&&hx>gw/2) hx=gw-hx;
        heap.push(j, nd+Math.hypot(hx,ny-gy));
      }
    }
  }
  if(from[goalI]<0&&startI!==goalI) return null;
  const path=[]; let i=goalI;
  while(i>=0){ path.push(i); if(i===startI)break; i=from[i]; }
  return path.reverse();
}
function mstEdges(pts,wrapW){
  const n=pts.length, edges=[];
  if(n<2) return edges;
  const dOf=(p,q)=>{
    let dx=Math.abs(p.x-q.x);
    if(wrapW&&dx>wrapW/2) dx=wrapW-dx;
    return Math.hypot(dx,p.y-q.y);
  };
  const inT=new Uint8Array(n), best=new Float64Array(n).fill(Infinity), link=new Int32Array(n);
  inT[0]=1;
  for(let k=0;k<n;k++){ best[k]=dOf(pts[k],pts[0]); link[k]=0; }
  for(let t=1;t<n;t++){
    let bi=-1,bd=Infinity;
    for(let k=0;k<n;k++) if(!inT[k]&&best[k]<bd){ bd=best[k]; bi=k; }
    if(bi<0) break;
    inT[bi]=1; edges.push([link[bi],bi]);
    for(let k=0;k<n;k++) if(!inT[k]){
      const d=dOf(pts[k],pts[bi]);
      if(d<best[k]){ best[k]=d; link[k]=bi; }
    }
  }
  return edges;
}

function buildRoutes(o,cities,P){
  const {gw,gh,elev,sea,biome}=o;
  const out={roads:[],searoutes:[],bridges:[],passes:[],junctions:[]};
  const invSea=1/(1-sea);
  const wrapX=!!o.wrap;
  const wdx=(a2,b2)=>{ let d=Math.abs(a2-b2); if(wrapX&&d>gw/2) d=gw-d; return d; };
  const pushSplit=(arr,pts,extra)=>{
    let cur=[];
    for(const p of pts){
      if(cur.length){
        const q=cur[cur.length-1];
        if(wrapX&&Math.abs(p[0]-q[0])>gw/2){
          const yMid=(p[1]+q[1])/2;
          if(q[0]>p[0]){ cur.push([gw,yMid]); arr.push(Object.assign({pts:cur},extra)); cur=[[0,yMid]]; }
          else         { cur.push([0,yMid]); arr.push(Object.assign({pts:cur},extra)); cur=[[gw,yMid]]; }
        }
      }
      cur.push(p);
    }
    if(cur.length>=2) arr.push(Object.assign({pts:cur},extra));
  };

  if(cities.length>=2){
    const onRoad=new Uint8Array(gw*gh);
    const costCore=j=>{
      const b=biome[j];
      if(b===BI.RIVER) return 7;
      if(b<B.LAND_MIN) return Infinity;
      let c=1;
      const h=(elev[j]-sea)*invSea;
      if(h>0.55) c+=3.0*(h-0.55)*4;
      if(b===BI.ROCK||b===BI.SNOW||b===BI.ICE) c+=3.0;
      else if(b===BI.WETLAND) c+=1.6;
      else if(b===BI.DESERT) c+=0.8;
      else if(b===BI.RAINFOREST) c+=0.8;
      else if(b===BI.FOREST||b===BI.TAIGA) c+=0.35;
      return c;
    };
    const cellCost=j=>{
      const c=costCore(j);
      return (c!==Infinity&&onRoad[j])?c*0.30:c;
    };
    const cellCostX=j=>{
      const c=costCore(j);
      return (c!==Infinity&&onRoad[j])?c*0.85:c;
    };
    const moveExtra=(i,j)=>Math.abs(elev[j]-elev[i])*invSea*46;
    const isMajor=c=>c.type==='capital'||c.type==='city';
    const deg=new Map(), degMajor=new Map();
    const link=(m,a2,b2)=>{
      let s=m.get(a2); if(!s){ s=new Set(); m.set(a2,s); } s.add(b2);
      let s2=m.get(b2); if(!s2){ s2=new Set(); m.set(b2,s2); } s2.add(a2);
    };
    const mstE=mstEdges(cities,wrapX?gw:0);
    const linked=new Set();
    const ekey=(a2,b2)=>Math.min(a2,b2)+'-'+Math.max(a2,b2);
    for(const [a2,b2] of mstE) linked.add(ekey(a2,b2));
    const extras=[];
    for(let a2=0;a2<cities.length;a2++){
      const cand=[];
      for(let b2=0;b2<cities.length;b2++){
        if(a2===b2||linked.has(ekey(a2,b2)))continue;
        const d=Math.hypot(wdx(cities[a2].x,cities[b2].x),cities[a2].y-cities[b2].y);
        if(d<gw*0.28) cand.push([d,b2]);
      }
      cand.sort((p2,q2)=>p2[0]-q2[0]);
      if(cand.length){ extras.push([cand[0][0],a2,cand[0][1]]); }
    }
    extras.sort((p2,q2)=>p2[0]-q2[0]);
    const nExtra=Math.min(5,Math.max(1,Math.round(cities.length*0.22)));
    const allEdges=mstE.slice();
    for(const [,a2,b2] of extras){
      if(allEdges.length>=mstE.length+nExtra)break;
      if(linked.has(ekey(a2,b2)))continue;
      linked.add(ekey(a2,b2));
      allEdges.push([a2,b2]);
    }
    for(let ei=0;ei<allEdges.length;ei++){
      const [a,b]=allEdges[ei];
      const A=cities[a], B2=cities[b];
      const path=astarGrid(gw,gh,A.i,B2.i,ei<mstE.length?cellCost:cellCostX,moveExtra,wrapX);
      if(!path||path.length<3) continue;
      const major=isMajor(A)&&isMajor(B2);
      const pts=[];
      let passI=-1, passH=0.34, prev=-1;
      for(const i of path){
        const x=(i%gw)+0.5, y=((i/gw)|0)+0.5;
        pts.push([x,y]);
        if(biome[i]===BI.RIVER) out.bridges.push([x,y]);
        const hh=(elev[i]-sea)*invSea;
        if(hh>passH){ passH=hh; passI=i; }
        onRoad[i]=1;
        if(prev>=0){ link(deg,prev,i); if(major) link(degMajor,prev,i); }
        prev=i;
      }
      if(passI>=0) out.passes.push([(passI%gw)+0.5,((passI/gw)|0)+0.5]);
      pushSplit(out.roads,pts,{major});
    }
    for(const [i,s] of deg){
      if(s.size<3) continue;
      const mj=degMajor.get(i);
      out.junctions.push({x:(i%gw)+0.5, y:((i/gw)|0)+0.5,
                          major:!!(mj&&mj.size>=3)});
    }
  }

  const ports=cities.filter(c=>c.coastal);
  if(ports.length>=2){
    const OFFING=Math.max(3,Math.round(gw*0.02));
    const landDist=new Int16Array(gw*gh).fill(-1);
    const q=[];
    for(let y=0;y<gh;y++)for(let x=0;x<gw;x++){
      const i=y*gw+x;
      if(biome[i]>BI.SHALLOW) continue;
      for(let k=0;k<8;k++){
        let nx=x+N8[k][0];
        const ny=y+N8[k][1];
        if(ny<0||ny>=gh) continue;
        if(wrapX){ nx=(nx+gw)%gw; } else if(nx<0||nx>=gw) continue;
        if(biome[ny*gw+nx]>=B.LAND_MIN){ landDist[i]=0; q.push(i); break; }
      }
    }
    for(let h=0;h<q.length;h++){
      const i=q[h], d=landDist[i];
      if(d>=OFFING) continue;
      const x=i%gw, y=(i/gw)|0;
      for(let k=0;k<8;k++){
        let nx=x+N8[k][0];
        const ny=y+N8[k][1];
        if(ny<0||ny>=gh) continue;
        if(wrapX){ nx=(nx+gw)%gw; } else if(nx<0||nx>=gw) continue;
        const j=ny*gw+nx;
        if(biome[j]>BI.SHALLOW||landDist[j]>=0) continue;
        landDist[j]=d+1; q.push(j);
      }
    }
    const ice=o.seaice;
    const seaCostFor=offing=>j=>{
      if(biome[j]>BI.SHALLOW) return Infinity;
      if(ice){
        const c=ice[j];
        if(c>0.55) return Infinity;
        if(c>0.06){
          const d0=landDist[j]<0?OFFING:landDist[j];
          const base0=d0>=offing?1:1+((offing-d0)/offing)*2.2;
          return base0*(1+c*3.5);
        }
      }
      const d=landDist[j]<0?OFFING:landDist[j];
      if(d>=offing) return 1;
      return 1+((offing-d)/offing)*2.2;
    };
    const gate=c=>{
      const x=c.i%gw, y=(c.i/gw)|0;
      for(let k=0;k<8;k++){
        let nx=x+N8[k][0];
        const ny=y+N8[k][1];
        if(ny<0||ny>=gh) continue;
        if(wrapX){ nx=(nx+gw)%gw; } else if(nx<0||nx>=gw) continue;
        const j=ny*gw+nx;
        if(biome[j]<=BI.SHALLOW) return j;
      }
      return -1;
    };
    const gates=ports.map(gate);
    for(const [a,b] of mstEdges(ports,wrapX?gw:0)){
      const ga=gates[a], gb=gates[b];
      if(ga<0||gb<0) continue;
      const span=Math.hypot(wdx(ports[a].x,ports[b].x),ports[a].y-ports[b].y);
      const offing=Math.max(2,Math.min(OFFING,Math.round(span*0.18)));
      const path=astarGrid(gw,gh,ga,gb,seaCostFor(offing),null,wrapX);
      if(!path||path.length<3) continue;
      const pts=[[ports[a].x,ports[a].y]];
      for(const i of path) pts.push([(i%gw)+0.5,((i/gw)|0)+0.5]);
      pts.push([ports[b].x,ports[b].y]);
      pushSplit(out.searoutes,pts,{});
    }
  }
  return out;
}

/* ---------- 汇总 ---------- */
function build(o,P,ov){
  const namer=NS.names.makeNamer(P.seed, P.nameCulture);
  const namerWild=NS.names.makeNamer((P.seed^0x77113)>>>0, P.nameCulture);
  const namerCap=NS.names.makeNamer((P.seed^0xca91a)>>>0, P.nameCulture);
  const mkNamer=salt=>NS.names.makeNamer((P.seed^salt)>>>0, P.nameCulture);
  const LN={ocean:mkNamer(0x0cea1), inner:mkNamer(0x0ba10), seaR:mkNamer(0x5ea20),
            gulf:mkNamer(0x9f1f0), isle:mkNamer(0x151e0), range:mkNamer(0x4a4e0),
            desert:mkNamer(0xde5e0), forest:mkNamer(0xf04e0), lake:mkNamer(0x1a6e0),
            river:mkNamer(0x41fe0), title:mkNamer(0x717e0)};
  const rnd=makeRng(P.seed^0x1b873593);
  let cities=[], nations=null;
  const pins=P.pins||{};
  let routes=null;

  if(P.features.cities||P.nations>0){
    const userCities=(pins.cities||[]).map(pc=>{
      const s=snapToLand(o,pc.x,pc.y);
      if(!s) return null;
      return {id:pc.id||('user-city-'+s.i),i:s.i,x:s.x,y:s.y,score:99,coastal:isCoastalCell(o,s.i),mouth:false,
              type:pc.type||'city',name:pc.name||'',region:-1,user:true};
    }).filter(Boolean);

    const minSep=Math.max(4,o.gw*0.045);
    const near=(list,x,y)=>list.some(p=>Math.hypot(p.x-x,p.y-y)<minSep);
    const autoAll=pickCities(o,P);
    const removedList=pins.removed||[];
    const removedIds=new Set(removedList.filter(r=>r&&r.targetId).map(r=>r.targetId));
    const legacyRemoved=removedList.filter(r=>r&&!r.targetId);
    const isRemoved=c=>removedIds.has(c.id)||near(legacyRemoved,c.x,c.y);

    const userCaps=userCities.filter(c=>c.type==='capital');
    let autoCaps=autoAll
      .filter(c=>!near(userCaps,c.x,c.y)&&!isRemoved(c))
      .slice(0,Math.max(0,P.nations|0));
    const capSet=new Set([...autoCaps,...userCaps]);
    const nNations=capSet.size;

    let auto=autoAll.filter(c=>!capSet.has(c)
      &&!near(userCities,c.x,c.y)&&!isRemoved(c));
    auto=auto.slice(0,Math.max(0,(P.cityCount|0)-userCities.length-autoCaps.length));

    cities=[...capSet,
            ...userCities.filter(c=>!capSet.has(c)),
            ...auto];
    let autoRank=0;
    const nAutoRest=auto.filter(c=>!capSet.has(c)).length;
    cities.forEach((c,k)=>{
      if(k<nNations){ c.type='capital'; return; }
      if(c.user){ if(c.type==='capital') c.type='city'; return; }
      c.type = autoRank<Math.ceil(nAutoRest*0.30) ? 'city' : 'town';
      autoRank++;
      if(c.coastal&&c.type==='town'&&rnd()<0.55) c.type='port';
    });

    if(nNations>0){
      const caps=cities.slice(0,nNations);
      const capIdentity=caps.map((c,id)=>{
        const stableId='nation-'+(c.id||id);
        return {stableId,ownerCode:ownerCodeFor(stableId)};
      });
      const ownerIdByCode=new Map(capIdentity.map((v,id)=>[v.ownerCode,id]));
      const {owner,dist}=growNations(o,caps,P);
      annexIslands(o,owner,P);
      if(ov&&ov.owner&&ov.owner.length===owner.length){
        const land=i2=>o.biome[i2]>=B.LAND_MIN||o.biome[i2]===BI.RIVER;
        const stable=ov.ownerStable&&ov.ownerStable.length===owner.length?ov.ownerStable:null;
        for(let i=0;i<owner.length;i++){
          const w=ov.owner[i];
          const code=stable?stable[i]:-2147483648;
          if(!land(i))continue;
          if(code!==-2147483648){
            if(code===-1)owner[i]=-1;
            else if(ownerIdByCode.has(code))owner[i]=ownerIdByCode.get(code);
            continue;
          }
          if(w!==-32768&&w<nNations) owner[i]=w;
        }
      }
      {
        const RCap=Math.max(3,o.gw*0.012), RCap2=RCap*RCap;
        const landG=i2=>o.biome[i2]>=B.LAND_MIN||o.biome[i2]===BI.RIVER;
        caps.forEach((c,id)=>{
          if(!c.user) return;
          for(let yy=Math.max(0,Math.floor(c.y-RCap));yy<=Math.min(o.gh-1,Math.ceil(c.y+RCap));yy++)
            for(let xx=Math.floor(c.x-RCap);xx<=Math.ceil(c.x+RCap);xx++){
              let nx=xx;
              if(o.wrap){ nx=((xx%o.gw)+o.gw)%o.gw; }
              else if(nx<0||nx>=o.gw) continue;
              const ddx=xx+0.5-c.x, ddy=yy+0.5-c.y;
              if(ddx*ddx+ddy*ddy>RCap2) continue;
              const i2=yy*o.gw+nx;
              if(landG(i2)) owner[i2]=id;
            }
        });
      }
      const list=caps.map((c,id)=>({id,stableId:capIdentity[id].stableId,
                                    ownerCode:capIdentity[id].ownerCode,name:'',capital:id,
                                    cells:0,labelX:c.x,labelY:c.y,hue:0}));
      for(let i=0;i<owner.length;i++) if(owner[i]>=0) list[owner[i]].cells++;
      list.forEach(N=>{
        if(N.cells<=0)return;
        const cells=[];
        for(let i=0;i<owner.length;i++) if(owner[i]===N.id) cells.push(i);
        const p=innerPoint(cells,o.gw,o.gh);
        N.labelX=p.x; N.labelY=p.y; N.inner=p.r;
      });
      const golden=137.508;
      list.forEach((N,k)=>{
        N.hue=(P.seed*13+k*golden)%360;
        N.name=namer.state();
      });
      nations={owner,dist,list,borders:borderChains(owner,o.gw,o.gh,o.biome),
               frontiers:frontierChains(owner,o.gw,o.gh,o.biome),
               wallBorders:seaBorderChains(o,owner)};
      cities.forEach(c=>{ c.region=owner[c.i]; });
      caps.forEach((c,id)=>{ c.region=id; });

      const wildMap=new Int32Array(owner.length).fill(-1);
      const wilds=[];
      const landW=i2=>o.biome[i2]>=B.LAND_MIN||o.biome[i2]===BI.RIVER;
      groupComponents(i2=>owner[i2]<0&&landW(i2),o.gw,o.gh,
                      Math.max(30,o.gw*o.gh*0.004),!!o.wrap).groups
        .slice(0,4).forEach((cells,k)=>{
          const p=innerPoint(cells,o.gw,o.gh);
          for(const i2 of cells) wildMap[i2]=k;
          wilds.push({id:k,stableId:'wild-'+(cells[0]==null?k:cells[0]),name:namerWild.wild(),cells:cells.length,
                      labelX:p.x,labelY:p.y,inner:p.r});
        });
      nations.wilds=wilds; nations.wildMap=wildMap;
    }

    const traitsOf=c=>{
      const i=c.i, x=i%o.gw, y=(i/o.gw)|0;
      const b=o.biome[i];
      const h=(o.elev[i]-o.sea)/(1-o.sea);
      let lake=false, desert=b===BI.DESERT;
      for(let k=0;k<8;k++){
        const nx=x+N8[k][0], ny=y+N8[k][1];
        if(nx<1||ny<1||nx>=o.gw-1||ny>=o.gh-1) continue;
        const bj=o.biome[ny*o.gw+nx];
        if(bj===BI.LAKE) lake=true;
        if(bj===BI.DESERT) desert=true;
      }
      return {
        choke:!!c.choke, cross:!!c.cross, port:!!c.coastal,
        desert,
        snow:(o.temp&&o.temp[i]<-1)||b===BI.TUNDRA,
        lake,
        forest:b===BI.FOREST||b===BI.TAIGA||b===BI.RAINFOREST,
        high:h>0.33
      };
    };
    if(nations){
      const capsArr=cities.slice(0,nNations);
      capsArr.forEach((c,k)=>{
        if(c.name) return;
        const N2=nations.list[k];
        c.name=namerCap.capitalFor(N2?N2.name:'');
      });
    }
    cities.forEach(c=>{
      if(c.name) return;
      c.name=namer.placeName(c.i,traitsOf(c));
    });

    routes=buildRoutes(o,cities,P);
    if(P.features.cities){
      const spots=[...routes.passes,...routes.bridges];
      const sep=Math.max(4,o.gw*0.045);
      const choke=[];
      for(const [sx2,sy2] of spots){
        if(choke.length>=4) break;
        if(cities.some(c=>Math.hypot(c.x-sx2,c.y-sy2)<sep*0.8)) continue;
        if(choke.some(c=>Math.hypot(c.x-sx2,c.y-sy2)<sep)) continue;
        const sp=snapToLand(o,sx2,sy2,3);
        if(!sp) continue;
        const c={id:'choke-city-'+sp.i,i:sp.i,x:sp.x,y:sp.y,score:0,coastal:isCoastalCell(o,sp.i),mouth:false,
                 type:'town',name:'',region:-1,choke:true};
        if(nations) c.region=nations.owner[c.i];
        c.name=namer.placeName(c.i,traitsOf(c));
        choke.push(c);
      }
      cities.push(...choke);

      const jx=(routes.junctions||[]).slice()
        .sort((a2,b2)=>(b2.major?1:0)-(a2.major?1:0));
      const cross=[];
      for(const J of jx){
        if(cross.length>=3) break;
        if(cities.some(c=>Math.hypot(c.x-J.x,c.y-J.y)<sep*0.6)) continue;
        if(cross.some(c=>Math.hypot(c.x-J.x,c.y-J.y)<sep)) continue;
        const sp=snapToLand(o,J.x,J.y,3);
        if(!sp) continue;
        const c={id:'cross-city-'+sp.i,i:sp.i,x:sp.x,y:sp.y,score:0,coastal:isCoastalCell(o,sp.i),mouth:false,
                 type:J.major?'city':'town',name:'',region:-1,cross:true};
        if(nations) c.region=nations.owner[c.i];
        c.name=namer.placeName(c.i,traitsOf(c));
        cross.push(c);
      }
      cities.push(...cross);
    }
  }

  if(!routes) routes=buildRoutes(o,cities,P);

  const marks=(pins.marks||[]).map(m=>{
    const s=snapToLand(o,m.x,m.y,8);
    return {id:m.id||('mark-'+m.x+'-'+m.y),x:s?s.x:m.x, y:s?s.y:m.y,
            icon:m.icon||'tower', name:m.name||''};
  });

  const labels=buildLabels(o,LN,cities,nations,P,marks);
  return {cities,nations,labels,title:LN.title.title(P.worldType),marks,
          roads:routes.roads,searoutes:routes.searoutes,bridges:routes.bridges};
}

NS.world={build,pickCities,growNations,borderChains,snapToLand,
          principalAxis,innerPoint,groupComponents};
})(typeof self!=='undefined'?self:this);
