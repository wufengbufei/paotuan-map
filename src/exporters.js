/* =========================================================
   奇幻地图 / exporters — PNG/SVG/GeoJSON/高度图/设定资料
   ========================================================= */
(function(root){
"use strict";
const NS = root.FMAP = root.FMAP || {};
const C = NS.core, SY = NS.style;
const {clamp} = C;

/* SVG 上下文：把 Canvas 调用收集成 SVG */
function makeSVGCtx(w,h){
  const parts=[];
  let cur='';
  const esc=s=>String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  const ctx={
    isSVG:true, canvas:{width:w,height:h},
    fillStyle:'#000',strokeStyle:'#000',lineWidth:1,globalAlpha:1,
    lineJoin:'miter',lineCap:'butt',font:'10px serif',textAlign:'left',textBaseline:'alphabetic',
    _path:'',_dash:[],_groupStack:[],
    beginPath(){ this._path=''; },
    moveTo(x,y){ this._path+=`M${x.toFixed(2)} ${y.toFixed(2)}`; },
    lineTo(x,y){ this._path+=`L${x.toFixed(2)} ${y.toFixed(2)}`; },
    quadraticCurveTo(cx,cy,x,y){ this._path+=`Q${cx.toFixed(2)} ${cy.toFixed(2)} ${x.toFixed(2)} ${y.toFixed(2)}`; },
    arc(x,y,r,a0,a1){
      const x0=x+Math.cos(a0)*r, y0=y+Math.sin(a0)*r;
      const x1=x+Math.cos(a1)*r, y1=y+Math.sin(a1)*r;
      const large=(a1-a0)>Math.PI?1:0;
      this._path+=`M${x0.toFixed(2)} ${y0.toFixed(2)}A${r} ${r} 0 ${large} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`;
    },
    closePath(){ this._path+='Z'; },
    setLineDash(d){ this._dash=d; },
    _style(){
      let s='';
      if(this._dash&&this._dash.length) s+=` stroke-dasharray="${this._dash.join(' ')}"`;
      if(this.globalAlpha!==1) s+=` opacity="${this.globalAlpha.toFixed(2)}"`;
      return s;
    },
    stroke(){
      if(!this._path)return;
      parts.push(`<path d="${this._path}" fill="none" stroke="${this.strokeStyle}" stroke-width="${this.lineWidth.toFixed(2)}" stroke-linejoin="${this.lineJoin}" stroke-linecap="${this.lineCap}"${this._style()}/>`);
      this._path='';
    },
    fill(rule){
      if(!this._path)return;
      parts.push(`<path d="${this._path}" fill="${this.fillStyle}" fill-rule="${rule==='evenodd'?'evenodd':'nonzero'}"${this._style()}/>`);
      this._path='';
    },
    fillRect(x,y,w2,h2){ parts.push(`<rect x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="${w2.toFixed(2)}" height="${h2.toFixed(2)}" fill="${this.fillStyle}"${this._style()}/>`); },
    strokeRect(x,y,w2,h2){ parts.push(`<rect x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="${w2.toFixed(2)}" height="${h2.toFixed(2)}" fill="none" stroke="${this.strokeStyle}" stroke-width="${this.lineWidth.toFixed(2)}"${this._style()}/>`); },
    clearRect(){},
    drawImage(){},
    fillText(t,x,y){
      const m=(this.font||'').match(/(italic)?\s*(\d+(?:\.\d+)?)px/);
      const sz=m?m[2]:10; const it=m&&m[1]?' font-style="italic"':'';
      parts.push(`<text x="${x.toFixed(2)}" y="${y.toFixed(2)}" font-size="${sz}"${it} font-family="serif" fill="${this.fillStyle}" text-anchor="${this.textAlign==='center'?'middle':this.textAlign==='left'?'start':'middle'}"${this._style()}>${esc(t)}</text>`);
    },
    strokeText(t,x,y){
      const m=(this.font||'').match(/(italic)?\s*(\d+(?:\.\d+)?)px/);
      const sz=m?m[2]:10;
      parts.push(`<text x="${x.toFixed(2)}" y="${y.toFixed(2)}" font-size="${sz}" font-family="serif" fill="none" stroke="${this.strokeStyle}" stroke-width="${(this.lineWidth||1).toFixed(2)}" text-anchor="${this.textAlign==='center'?'middle':'start'}"${this._style()}>${esc(t)}</text>`);
    },
    measureText(t){ const m=(this.font||'').match(/(\d+(?:\.\d+)?)px/); const sz=m?+m[1]:10; return {width:t.length*sz*0.62}; },
    createRadialGradient(){ return {addColorStop(){}}; },
    createPattern(){ return null; },
    save(){}, restore(){}, translate(){}, rotate(){},
    group(id){ parts.push(`<g id="${esc(id)}">`); },
    endGroup(){ parts.push('</g>'); }
  };
  return {ctx, toString:()=>`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">${parts.join('\n')}</svg>`};
}

/* 高度图（16bit 灰度 PNG） */
function heightmapBlob(G){
  const {gw,gh,elev}=G;
  const cv=document.createElement('canvas');
  cv.width=gw; cv.height=gh;
  const ctx=cv.getContext('2d');
  const img=ctx.createImageData(gw,gh);
  for(let i=0;i<gw*gh;i++){
    const v=Math.round(clamp(elev[i],0,1)*255);
    const j=i*4;
    img.data[j]=v; img.data[j+1]=v; img.data[j+2]=v; img.data[j+3]=255;
  }
  ctx.putImageData(img,0,0);
  return cv;
}

/* GeoJSON：海岸线 + 国境 + 城市 + 河川 */
function geoJSON(G,P){
  const {gw,gh}=G;
  const feats=[];
  const conv=pts=>pts.map(p=>[+(p[0]/gw*360-180).toFixed(4),+(90-p[1]/gh*180).toFixed(4)]);
  // 陆地轮廓
  if(NS.render){
    const loops=NS.render.landLoops(G,1,1,false,'smooth');
    loops.forEach((l,k)=>{
      feats.push({type:'Feature',properties:{kind:'land',id:k},
        geometry:{type:'Polygon',coordinates:[conv(l.pts.concat([l.pts[0]]))]}});
    });
  }
  // 河川
  (G.rivers||[]).forEach((r,k)=>{
    feats.push({type:'Feature',properties:{kind:'river',id:k},
      geometry:{type:'LineString',coordinates:conv(r)}});
  });
  // 国境
  if(G.nations){
    G.nations.borders.forEach((c2,k)=>{
      feats.push({type:'Feature',properties:{kind:'border',id:k},
        geometry:{type:'LineString',coordinates:conv(c2)}});
    });
  }
  // 城市
  (G.cities||[]).forEach(c=>{
    feats.push({type:'Feature',properties:{kind:'city',name:c.name,cityType:c.type},
      geometry:{type:'Point',coordinates:conv([[c.x,c.y]])[0]}});
  });
  return {type:'FeatureCollection',features:feats};
}

/* 设定资料文本 */
function codexText(G,P){
  const L=[];
  L.push('《'+G.title+'》设定资料');
  L.push('生成种子: '+P.seed+'　类型: '+P.worldType+'　样式: '+P.style);
  L.push('');
  if(G.nations&&G.nations.list.length){
    L.push('■ 国家（'+G.nations.list.length+'）');
    G.nations.list.forEach(N=>{
      const cap=G.cities.find(c=>c.region===N.id&&c.type==='capital');
      L.push('・'+N.name+'　首都: '+(cap?cap.name:'—')+'　领土: '+N.cells+' 格');
    });
    L.push('');
  }
  if(G.nations&&G.nations.wilds&&G.nations.wilds.length){
    L.push('■ 无主之地');
    G.nations.wilds.forEach(W=>L.push('・'+W.name));
    L.push('');
  }
  if(G.cities.length){
    L.push('■ 城市（'+G.cities.length+'）');
    G.cities.forEach(c=>{
      L.push('・'+c.name+'（'+({capital:'首都',city:'城市',town:'城镇',port:'港口'}[c.type]||'城镇')+'）');
    });
    L.push('');
  }
  if(G.labels.length){
    L.push('■ 地名');
    G.labels.filter(l=>l.kind!=='city'&&l.kind!=='region').forEach(l=>{
      L.push('・'+l.text+'（'+l.kind+'）');
    });
  }
  return L.join('\n');
}

function download(name,content,mime){
  const blob=content instanceof Blob?content:new Blob([content],{type:mime||'text/plain'});
  const a=document.createElement('a');
  a.href=URL.createObjectURL(blob);
  a.download=name;
  a.click();
  setTimeout(()=>URL.revokeObjectURL(a.href),4000);
}

NS.exporters={makeSVGCtx,heightmapBlob,geoJSON,codexText,download};
})(typeof self!=='undefined'?self:this);
