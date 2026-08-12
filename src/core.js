/* =========================================================
   奇幻地图 / core — 随机数・单纯形噪声・场运算・等值线提取
   纯函数，不碰 DOM
   ========================================================= */
(function(root){
"use strict";
const NS = root.FMAP = root.FMAP || {};

/* ---------- 基本数学 ---------- */
const clamp=(v,a,b)=>v<a?a:v>b?b:v;
const lerp=(a,b,t)=>a+(b-a)*t;
const smoothstep=t=>{t=t<0?0:t>1?1:t;return t*t*(3-2*t);};
const norm=(v,a,b)=>clamp((v-a)/((b-a)||1),0,1);

/* ---------- 随机数（种子确定性） ---------- */
function hash32(x){
  x=(x|0)^0x9e3779b9;
  x=Math.imul(x^(x>>>16),0x21f0aaad);
  x=Math.imul(x^(x>>>15),0x735a2d97);
  return (x^(x>>>15))>>>0;
}
function makeRng(seed){
  let s=hash32(seed)||1;
  return function(){ s^=s<<13; s>>>=0; s^=s>>>17; s^=s<<5; s>>>=0; return s/4294967296; };
}

/* ---------- 单纯形噪声 2D/3D ---------- */
function permTable(seed){
  const perm=new Uint8Array(256);
  for(let i=0;i<256;i++) perm[i]=i;
  const rnd=makeRng(seed);
  for(let i=255;i>0;i--){ const j=(rnd()*(i+1))|0; const t=perm[i]; perm[i]=perm[j]; perm[j]=t; }
  const p=new Uint8Array(512), pm12=new Uint8Array(512);
  for(let i=0;i<512;i++){ p[i]=perm[i&255]; pm12[i]=p[i]%12; }
  return {p,pm12};
}
const GRAD2=[[1,1],[-1,1],[1,-1],[-1,-1],[1,0],[-1,0],[0,1],[0,-1]];
function makeNoise2(seed){
  const {p}=permTable(seed);
  const F2=0.5*(Math.sqrt(3)-1), G2=(3-Math.sqrt(3))/6;
  return function(xin,yin){
    let n0=0,n1=0,n2=0;
    const sk=(xin+yin)*F2, i=Math.floor(xin+sk), j=Math.floor(yin+sk), t=(i+j)*G2;
    const x0=xin-(i-t), y0=yin-(j-t);
    let i1,j1; if(x0>y0){i1=1;j1=0;}else{i1=0;j1=1;}
    const x1=x0-i1+G2, y1=y0-j1+G2, x2=x0-1+2*G2, y2=y0-1+2*G2;
    const ii=i&255, jj=j&255;
    const g0=GRAD2[p[ii+p[jj]]&7], g1=GRAD2[p[ii+i1+p[jj+j1]]&7], g2=GRAD2[p[ii+1+p[jj+1]]&7];
    let t0=0.5-x0*x0-y0*y0; if(t0>=0){t0*=t0;n0=t0*t0*(g0[0]*x0+g0[1]*y0);}
    let t1=0.5-x1*x1-y1*y1; if(t1>=0){t1*=t1;n1=t1*t1*(g1[0]*x1+g1[1]*y1);}
    let t2=0.5-x2*x2-y2*y2; if(t2>=0){t2*=t2;n2=t2*t2*(g2[0]*x2+g2[1]*y2);}
    return 70*(n0+n1+n2);
  };
}
const GRAD3=[[1,1,0],[-1,1,0],[1,-1,0],[-1,-1,0],[1,0,1],[-1,0,1],[1,0,-1],[-1,0,-1],[0,1,1],[0,-1,1],[0,1,-1],[0,-1,-1]];
function makeNoise3(seed){
  const {p,pm12}=permTable(seed^0x5bf03635);
  const F3=1/3, G3=1/6;
  return function(x,y,z){
    const s=(x+y+z)*F3;
    const i=Math.floor(x+s), j=Math.floor(y+s), k=Math.floor(z+s);
    const t=(i+j+k)*G3;
    const x0=x-(i-t), y0=y-(j-t), z0=z-(k-t);
    let i1,j1,k1,i2,j2,k2;
    if(x0>=y0){
      if(y0>=z0){i1=1;j1=0;k1=0;i2=1;j2=1;k2=0;}
      else if(x0>=z0){i1=1;j1=0;k1=0;i2=1;j2=0;k2=1;}
      else {i1=0;j1=0;k1=1;i2=1;j2=0;k2=1;}
    } else {
      if(y0<z0){i1=0;j1=0;k1=1;i2=0;j2=1;k2=1;}
      else if(x0<z0){i1=0;j1=1;k1=0;i2=0;j2=1;k2=1;}
      else {i1=0;j1=1;k1=0;i2=1;j2=1;k2=0;}
    }
    const x1=x0-i1+G3,   y1=y0-j1+G3,   z1=z0-k1+G3;
    const x2=x0-i2+2*G3, y2=y0-j2+2*G3, z2=z0-k2+2*G3;
    const x3=x0-1+3*G3,  y3=y0-1+3*G3,  z3=z0-1+3*G3;
    const ii=i&255, jj=j&255, kk=k&255;
    let n=0,tt,g;
    tt=0.6-x0*x0-y0*y0-z0*z0; if(tt>0){tt*=tt;g=GRAD3[pm12[ii+p[jj+p[kk]]]];n+=tt*tt*(g[0]*x0+g[1]*y0+g[2]*z0);}
    tt=0.6-x1*x1-y1*y1-z1*z1; if(tt>0){tt*=tt;g=GRAD3[pm12[ii+i1+p[jj+j1+p[kk+k1]]]];n+=tt*tt*(g[0]*x1+g[1]*y1+g[2]*z1);}
    tt=0.6-x2*x2-y2*y2-z2*z2; if(tt>0){tt*=tt;g=GRAD3[pm12[ii+i2+p[jj+j2+p[kk+k2]]]];n+=tt*tt*(g[0]*x2+g[1]*y2+g[2]*z2);}
    tt=0.6-x3*x3-y3*y3-z3*z3; if(tt>0){tt*=tt;g=GRAD3[pm12[ii+1+p[jj+1+p[kk+1]]]];n+=tt*tt*(g[0]*x3+g[1]*y3+g[2]*z3);}
    return 32*n;
  };
}

/* ---------- 噪声场 ----------
   u,v 为以网格宽为 1 的归一坐标。wrap=true 时东西无缝（圆柱映射 3D 噪声） */
const TAU=Math.PI*2;
function makeField(seed, wrap){
  const n2=makeNoise2(seed), n3=wrap?makeNoise3(seed):null;
  const at = wrap
    ? (u,v,f,ox,oy)=>{ const r=f/TAU; return n3(Math.cos(u*TAU)*r+ox, Math.sin(u*TAU)*r, v*f+oy); }
    : (u,v,f,ox,oy)=>n2(u*f+ox, v*f+oy);
  return {
    wrap:!!wrap,
    fbm(u,v,freq,oct,gain,ox,oy){
      oct=oct||4; gain=gain==null?0.5:gain; ox=ox||0; oy=oy||0;
      let a=1,f=freq,sum=0,nm=0;
      for(let o=0;o<oct;o++){ sum+=a*at(u,v,f,ox,oy); nm+=a; a*=gain; f*=2; }
      return sum/nm;
    },
    ridged(u,v,freq,oct,gain,ox,oy){
      oct=oct||4; gain=gain==null?0.55:gain; ox=ox||0; oy=oy||0;
      let a=1,f=freq,sum=0,nm=0;
      for(let o=0;o<oct;o++){ let x=1-Math.abs(at(u,v,f,ox,oy)); x*=x; sum+=a*x; nm+=a; a*=gain; f*=2.1; }
      return sum/nm;
    },
    fbm01(u,v,freq,oct,gain,ox,oy){ return (this.fbm(u,v,freq,oct,gain,ox,oy)+1)/2; }
  };
}

/* ---------- 最小堆（Priority-Flood 用） ---------- */
function MinHeap(cap){
  this.idx=new Int32Array(cap);
  this.pri=new Float64Array(cap);
  this.size=0; this.cap=cap;
}
MinHeap.prototype.push=function(i,p){
  if(this.size===this.cap){
    const ni=new Int32Array(this.cap*2), np=new Float64Array(this.cap*2);
    ni.set(this.idx); np.set(this.pri); this.idx=ni; this.pri=np; this.cap*=2;
  }
  let c=this.size++;
  this.idx[c]=i; this.pri[c]=p;
  while(c>0){
    const par=(c-1)>>1;
    if(this.pri[par]<=this.pri[c]) break;
    const ti=this.idx[par], tp=this.pri[par];
    this.idx[par]=this.idx[c]; this.pri[par]=this.pri[c];
    this.idx[c]=ti; this.pri[c]=tp; c=par;
  }
};
MinHeap.prototype.pop=function(){
  const top=this.idx[0];
  this.size--;
  if(this.size>0){
    this.idx[0]=this.idx[this.size]; this.pri[0]=this.pri[this.size];
    let c=0;
    for(;;){
      const l=c*2+1, r=l+1; let m=c;
      if(l<this.size && this.pri[l]<this.pri[m]) m=l;
      if(r<this.size && this.pri[r]<this.pri[m]) m=r;
      if(m===c) break;
      const ti=this.idx[m], tp=this.pri[m];
      this.idx[m]=this.idx[c]; this.pri[m]=this.pri[c];
      this.idx[c]=ti; this.pri[c]=tp; c=m;
    }
  }
  return top;
};

/* ---------- 场运算 ---------- */
function normalize01(a){
  let mn=Infinity,mx=-Infinity;
  for(let i=0;i<a.length;i++){const v=a[i]; if(v<mn)mn=v; if(v>mx)mx=v;}
  const r=(mx-mn)||1;
  for(let i=0;i<a.length;i++) a[i]=(a[i]-mn)/r;
  return a;
}
function smoothField(src,gw,gh,iter){
  let a=Float32Array.from(src);
  for(let k=0;k<(iter||1);k++){
    const b=new Float32Array(a.length);
    for(let y=0;y<gh;y++)for(let x=0;x<gw;x++){
      let s=0,n=0;
      for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
        const xx=x+dx, yy=y+dy;
        if(xx>=0&&xx<gw&&yy>=0&&yy<gh){ s+=a[yy*gw+xx]; n++; }
      }
      b[y*gw+x]=s/n;
    }
    a=b;
  }
  return a;
}
function sampleBilinear(arr,gw,gh,cx,cy){
  cx=cx<0?0:cx>gw-1?gw-1:cx; cy=cy<0?0:cy>gh-1?gh-1:cy;
  const x0=Math.floor(cx), y0=Math.floor(cy);
  const x1=Math.min(gw-1,x0+1), y1=Math.min(gh-1,y0+1);
  const tx=cx-x0, ty=cy-y0;
  const a=arr[y0*gw+x0], b=arr[y0*gw+x1], c=arr[y1*gw+x0], d=arr[y1*gw+x1];
  return (a*(1-tx)+b*tx)*(1-ty)+(c*(1-tx)+d*tx)*ty;
}
function resampleGrid(arr,sw,sh,dw,dh,Ctor){
  const out=new (Ctor||Float32Array)(dw*dh);
  for(let y=0;y<dh;y++)for(let x=0;x<dw;x++){
    const cx=(x+0.5)*sw/dw-0.5, cy=(y+0.5)*sh/dh-0.5;
    out[y*dw+x]=sampleBilinear(arr,sw,sh,cx,cy);
  }
  return out;
}
const N8=[[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]];
const N4=[[1,0],[-1,0],[0,1],[0,-1]];

function vnoise(x,y){
  const xi=Math.floor(x), yi=Math.floor(y), xf=x-xi, yf=y-yi;
  const hsh=(a,b)=>{let n=(a*374761393+b*668265263)|0; n=Math.imul(n^(n>>>13),1274126177); return ((n^(n>>>16))>>>0)/4294967296;};
  const u=xf*xf*(3-2*xf), v=yf*yf*(3-2*yf);
  const a=hsh(xi,yi),b=hsh(xi+1,yi),c=hsh(xi,yi+1),d=hsh(xi+1,yi+1);
  return a+(b-a)*u+(c-a)*v+(a-b-c+d)*u*v;
}

/* 棱线锐化（反锐化掩模） */
function sharpenRidges(elev,gw,gh,sea,amount){
  if(amount<=0) return elev;
  const blur=smoothField(elev,gw,gh,1);
  const inv=1/(1-sea);
  for(let i=0;i<elev.length;i++){
    const e=elev[i];
    if(e<=sea) continue;
    const h=(e-sea)*inv;
    const w=amount*clamp((h-0.12)/0.5,0,1);
    elev[i]=clamp(e+(e-blur[i])*w*3.2,sea+0.0005,1);
  }
  return elev;
}

/* ---------- 等值线提取（行进立方） ---------- */
function stitchChains(segs, keepOpen){
  const q=8, key=p=>Math.round(p[0]*q)+','+Math.round(p[1]*q);
  const adj=new Map();
  segs.forEach((s,id)=>{
    for(const e of [0,1]){ const k=key(s[e]); let a=adj.get(k); if(!a){a=[];adj.set(k,a);} a.push({other:s[e^1],id}); }
  });
  const used=new Uint8Array(segs.length);
  const out=[];
  for(let i=0;i<segs.length;i++){
    if(used[i])continue; used[i]=1;
    let loop=[segs[i][0],segs[i][1]];
    for(let e=1;e>=0;e--){
      let pt=loop[e?loop.length-1:0];
      for(;;){
        const lst=adj.get(key(pt))||[];
        let nxt=null;
        for(const en of lst){ if(!used[en.id]){ used[en.id]=1; nxt=en.other; break; } }
        if(!nxt) break;
        if(e) loop.push(nxt); else loop.unshift(nxt);
        pt=nxt;
      }
    }
    const closed=loop.length>2&&key(loop[0])===key(loop[loop.length-1]);
    if(closed||keepOpen) out.push({pts:loop,closed});
  }
  return out;
}

/* 布尔掩码的边界等值线（沿格子棱） */
function contourMask(test, gw, gh){
  const segs=[];
  const inb=(x,y)=>x>=0&&x<gw&&y>=0&&y<gh;
  const T=(x,y)=>inb(x,y)&&test(y*gw+x);
  for(let y=0;y<gh-1;y++)for(let x=0;x<gw-1;x++){
    const a=T(x,y), b=T(x+1,y), c=T(x+1,y+1), d=T(x,y+1);
    const code=(a?8:0)|(b?4:0)|(c?2:0)|(d?1:0);
    if(code===0||code===15) continue;
    // 每条棱中点连线
    const mid=(x1,y1,x2,y2)=>[(x1+x2)/2,(y1+y2)/2];
    const t=()=>mid(x,y,x+1,y), r=()=>mid(x+1,y,x+1,y+1), bo=()=>mid(x,y+1,x+1,y+1), l=()=>mid(x,y,x,y+1);
    switch(code){
      case 1: case 14: segs.push([l(),bo()]); break;
      case 2: case 13: segs.push([bo(),r()]); break;
      case 3: case 12: segs.push([l(),r()]); break;
      case 4: case 11: segs.push([t(),r()]); break;
      case 6: case 9:  segs.push([t(),bo()]); break;
      case 7: case 8:  segs.push([l(),t()]); break;
      case 5:  segs.push([l(),t()],[bo(),r()]); break;
      case 10: segs.push([l(),bo()],[t(),r()]); break;
    }
  }
  return stitchChains(segs,false).map(o=>o.pts);
}

/* 标量场等值线（可选线性插值、可选不沿边框闭合） */
function contourLevel(valFn, gw, gh, opt){
  opt=opt||{};
  const level=opt.level==null?0.5:opt.level;
  const interp=!!opt.interp, clip=!!opt.clip;
  const inb=(x,y)=>x>=0&&x<gw&&y>=0&&y<gh;
  const V=(x,y)=>inb(x,y)?valFn(x,y):NaN;
  const segs=[];
  const ip=(x1,y1,x2,y2)=>{
    const v1=V(x1,y1), v2=V(x2,y2);
    if(!interp||!isFinite(v1)||!isFinite(v2)) return [(x1+x2)/2,(y1+y2)/2];
    const t=(level-v1)/((v2-v1)||1e-9);
    return [x1+(x2-x1)*t, y1+(y2-y1)*t];
  };
  for(let y=0;y<gh-1;y++)for(let x=0;x<gw-1;x++){
    const a=V(x,y), b=V(x+1,y), c=V(x+1,y+1), d=V(x,y+1);
    const code=((a>=level)?8:0)|((b>=level)?4:0)|((c>=level)?2:0)|((d>=level)?1:0);
    if(code===0||code===15) continue;
    const onBorder=clip&&(x===0||y===0||x===gw-2||y===gh-2);
    const t=()=>ip(x,y,x+1,y), r=()=>ip(x+1,y,x+1,y+1), bo=()=>ip(x,y+1,x+1,y+1), l=()=>ip(x,y,x,y+1);
    const push=(p1,p2)=>{ if(!onBorder) segs.push([p1,p2]); };
    switch(code){
      case 1: case 14: push(l(),bo()); break;
      case 2: case 13: push(bo(),r()); break;
      case 3: case 12: push(l(),r()); break;
      case 4: case 11: push(t(),r()); break;
      case 6: case 9:  push(t(),bo()); break;
      case 7: case 8:  push(l(),t()); break;
      case 5:  push(l(),t()); push(bo(),r()); break;
      case 10: push(l(),bo()); push(t(),r()); break;
    }
  }
  return stitchChains(segs,true);
}

/* Chaikin 平滑 */
function chaikin(pts,iter,closed){
  let p=pts;
  for(let k=0;k<(iter||1);k++){
    const out=[];
    const n=p.length;
    if(!closed) out.push(p[0]);
    const lim=closed?n:n-1;
    for(let i=0;i<lim;i++){
      const a=p[i], b=p[(i+1)%n];
      out.push([a[0]*0.75+b[0]*0.25, a[1]*0.75+b[1]*0.25]);
      out.push([a[0]*0.25+b[0]*0.75, a[1]*0.25+b[1]*0.75]);
    }
    if(!closed) out.push(p[n-1]);
    p=out;
  }
  return p;
}

/* 连通分量标记 */
function labelComponents(test,gw,gh,wrapX){
  const n=gw*gh;
  const label=new Int32Array(n).fill(-1);
  const sizes=[];
  let count=0;
  const stack=[];
  for(let s=0;s<n;s++){
    if(label[s]>=0||!test(s)) continue;
    let sz=0;
    stack.length=0; stack.push(s); label[s]=count;
    while(stack.length){
      const i=stack.pop(); sz++;
      const x=i%gw, y=(i/gw)|0;
      for(let k=0;k<4;k++){
        let nx=x+N4[k][0]; const ny=y+N4[k][1];
        if(ny<0||ny>=gh) continue;
        if(wrapX){ nx=(nx+gw)%gw; } else if(nx<0||nx>=gw) continue;
        const j=ny*gw+nx;
        if(label[j]<0&&test(j)){ label[j]=count; stack.push(j); }
      }
    }
    sizes.push(sz); count++;
  }
  return {label,sizes,count};
}

/* 区域内部距离（BFS） */
function distanceInside(test,gw,gh){
  const n=gw*gh;
  const d=new Int32Array(n).fill(-1);
  const q=new Int32Array(n); let qh=0,qt=0;
  for(let i=0;i<n;i++){
    if(!test(i)) continue;
    const x=i%gw, y=(i/gw)|0;
    for(let k=0;k<4;k++){
      const nx=x+N4[k][0], ny=y+N4[k][1];
      if(nx<0||ny<0||nx>=gw||ny>=gh||!test(ny*gw+nx)){ d[i]=0; q[qt++]=i; break; }
    }
  }
  while(qh<qt){
    const i=q[qh++], dd=d[i];
    const x=i%gw, y=(i/gw)|0;
    for(let k=0;k<4;k++){
      const nx=x+N4[k][0], ny=y+N4[k][1];
      if(nx<0||ny<0||nx>=gw||ny>=gh) continue;
      const j=ny*gw+nx;
      if(d[j]<0&&test(j)){ d[j]=dd+1; q[qt++]=j; }
    }
  }
  return d;
}

const TYPE_KM={world:20000,continent:4200,peninsula:900,archipelago:2400,
               island:420,inland:1300,interior:1600};

NS.core={clamp,lerp,smoothstep,norm,hash32,makeRng,permTable,makeNoise2,makeNoise3,
         makeField,MinHeap,normalize01,smoothField,sampleBilinear,resampleGrid,
         N8,N4,vnoise,sharpenRidges,stitchChains,contourMask,contourLevel,chaikin,
         labelComponents,distanceInside,TYPE_KM};
})(typeof self!=='undefined'?self:this);
