/* =========================================================
   奇幻地图 / decor — 标签・城市符号・罗盘・比例尺・装饰框
   标签按优先级防碰撞放置
   ========================================================= */
(function(root){
"use strict";
const NS = root.FMAP = root.FMAP || {};
const C = NS.core, SY = NS.style, R = NS.render;
const {clamp} = C;

const ZH_FONT='"Noto Serif SC","Songti SC","SimSun",serif';

const WORLD_KM=C.TYPE_KM;

/* 碰撞矩形集合 */
function Occupancy(){ this.rects=[]; }
Occupancy.prototype.hit=function(r){
  for(const o of this.rects){
    if(r.x<o.x+o.w&&r.x+r.w>o.x&&r.y<o.y+o.h&&r.y+r.h>o.y) return true;
  }
  return false;
};
Occupancy.prototype.add=function(r){ this.rects.push(r); };

/* 城市标记 */
function cityMarker(ctx,x,y,size,type,color,ink){
  ctx.save();
  ctx.translate(x,y);
  if(type==='capital'){
    // 双层星
    ctx.fillStyle=color; ctx.strokeStyle=ink; ctx.lineWidth=size*0.12;
    ctx.beginPath();
    for(let k=0;k<8;k++){
      const a=-Math.PI/2+k*Math.PI/4;
      const r=k%2===0?size:size*0.45;
      const px=Math.cos(a)*r, py=Math.sin(a)*r;
      if(k===0)ctx.moveTo(px,py);else ctx.lineTo(px,py);
    }
    ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.arc(0,0,size*0.22,0,Math.PI*2);
    ctx.fillStyle=ink; ctx.fill();
  } else if(type==='city'){
    ctx.fillStyle=color; ctx.strokeStyle=ink; ctx.lineWidth=size*0.14;
    ctx.beginPath(); ctx.arc(0,0,size*0.5,0,Math.PI*2); ctx.fill(); ctx.stroke();
  } else if(type==='port'){
    // 锚形简化：圆点+下横
    ctx.fillStyle=color; ctx.strokeStyle=ink; ctx.lineWidth=size*0.12;
    ctx.beginPath(); ctx.arc(0,-size*0.15,size*0.4,0,Math.PI*2); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0,size*0.2); ctx.lineTo(0,size*0.6);
    ctx.moveTo(-size*0.35,size*0.4); ctx.lineTo(size*0.35,size*0.4); ctx.stroke();
  } else {
    // town：小方块
    ctx.fillStyle=color; ctx.strokeStyle=ink; ctx.lineWidth=size*0.12;
    ctx.fillRect(-size*0.32,-size*0.32,size*0.64,size*0.64);
    ctx.strokeRect(-size*0.32,-size*0.32,size*0.64,size*0.64);
  }
  ctx.restore();
}

function markMarker(ctx,x,y,size,icon,ink,paper){
  ctx.save();
  ctx.translate(x,y);
  ctx.strokeStyle=ink; ctx.fillStyle=paper;
  ctx.lineWidth=size*0.12; ctx.lineJoin='round';
  if(icon==='temple'){
    ctx.beginPath();
    ctx.moveTo(-size*0.5,size*0.4); ctx.lineTo(-size*0.5,-size*0.1);
    ctx.lineTo(0,-size*0.5); ctx.lineTo(size*0.5,-size*0.1); ctx.lineTo(size*0.5,size*0.4);
    ctx.closePath(); ctx.fill(); ctx.stroke();
  } else if(icon==='ruin'){
    ctx.beginPath();
    ctx.moveTo(-size*0.4,size*0.4); ctx.lineTo(-size*0.4,-size*0.2); ctx.lineTo(-size*0.15,-size*0.2);
    ctx.lineTo(-size*0.15,-size*0.05); ctx.lineTo(size*0.1,-size*0.05); ctx.lineTo(size*0.1,-size*0.25);
    ctx.lineTo(size*0.4,-size*0.25); ctx.lineTo(size*0.4,size*0.4);
    ctx.closePath(); ctx.fill(); ctx.stroke();
  } else if(icon==='keep'){
    ctx.strokeRect(-size*0.35,-size*0.35,size*0.7,size*0.75);
    ctx.strokeRect(-size*0.35,-size*0.55,size*0.2,size*0.2);
    ctx.strokeRect(size*0.15,-size*0.55,size*0.2,size*0.2);
  } else { // tower
    ctx.beginPath();
    ctx.moveTo(-size*0.25,size*0.5); ctx.lineTo(-size*0.18,-size*0.35);
    ctx.lineTo(size*0.18,-size*0.35); ctx.lineTo(size*0.25,size*0.5);
    ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-size*0.3,-size*0.35); ctx.lineTo(size*0.3,-size*0.35); ctx.stroke();
  }
  ctx.restore();
}

/* 标签布局 + 绘制 */
function layoutLabels(ctx,cw,ch,G,P,ST){
  const unit=cw/1000;
  const baseFont=11*unit*(P.labelScale==null?1:P.labelScale);
  const occ=new Occupancy();
  const placed=[];
  const sx=cw/G.gw, sy=ch/G.gh;

  // 按优先级排序（高的先放）
  const labels=(G.labels||[]).slice().sort((a,b)=>b.priority-a.priority);

  for(const L of labels){
    const x=L.x*sx, y=L.y*sy;
    const size=baseFont*(L.scale||1);
    const isWater=(L.kind==='ocean'||L.kind==='bay'||L.kind==='lake'||L.kind==='river');
    const font=(L.italic?'italic ':'')+'600 '+size.toFixed(1)+'px '+ZH_FONT;
    ctx.font=font;
    const tw=ctx.measureText(L.text).width;
    const spread=L.spread?size*0.35:0;
    const w=tw+spread*(L.text.length-1);
    // 锚点类标签（城市）向上偏移避免压住符号
    const yOff=L.anchor?-size*1.1:0;
    const rect={x:x-w/2-2,y:y+yOff-size*0.8-2,w:w+4,h:size*1.2+4};
    // 出框检查
    if(rect.x<2||rect.y<2||rect.x+rect.w>cw-2||rect.y+rect.h>ch-2) continue;
    if(occ.hit(rect)) continue;
    occ.add(rect);
    placed.push({L,x,y:y+yOff,size,font,isWater,spread});
  }
  return placed;
}

function drawLabels(ctx,cw,ch,G,P,ST){
  if(!P.features.labels) return;
  const placed=layoutLabels(ctx,cw,ch,G,P,ST);
  const TS=ST.textStyle;
  ctx.textAlign='center'; ctx.textBaseline='middle';
  for(const p of placed){
    ctx.font=p.font;
    const fill=p.isWater?(TS.water||TS.fill):TS.fill;
    const halo=p.isWater?(TS.waterHalo||TS.halo):TS.halo;
    ctx.lineWidth=Math.max(1.5,p.size*0.16);
    ctx.strokeStyle=halo;
    ctx.lineJoin='round';
    if(p.spread>0){
      // 逐字拉开
      let cx=p.x-(ctx.measureText(p.L.text).width+p.spread*(p.L.text.length-1))/2;
      ctx.textAlign='left';
      for(const chr of p.L.text){
        ctx.strokeText(chr,cx,p.y);
        ctx.fillStyle=fill; ctx.fillText(chr,cx,p.y);
        cx+=ctx.measureText(chr).width+p.spread;
      }
      ctx.textAlign='center';
    } else {
      ctx.strokeText(p.L.text,p.x,p.y);
      ctx.fillStyle=fill;
      ctx.fillText(p.L.text,p.x,p.y);
    }
  }
}

/* 城市符号绘制 */
function drawCities(ctx,cw,ch,G,P,ST){
  if(!P.features.cities) return;
  const sx=cw/G.gw, sy=ch/G.gh, unit=cw/1000;
  const ink=ST.ink;
  const N=G.nations;
  for(const c of (G.cities||[])){
    const x=c.x*sx, y=c.y*sy;
    const natCol=N&&c.region>=0&&N.list[c.region]
      ?SY.hex(R.hslToRgb(N.list[c.region].hue/360,0.55,0.42))
      :ST.frame.accent;
    const s=unit*(c.type==='capital'?5.5:c.type==='city'?4:c.type==='port'?3.6:3);
    cityMarker(ctx,x,y,s,c.type==='port'?'port':c.type,natCol,'rgba(240,235,220,.9)');
  }
  // 地标
  for(const m of (G.marks||[])){
    const x=m.x*sx, y=m.y*sy;
    markMarker(ctx,x,y,unit*4,m.icon,ink,SY.hex(ST.paper));
  }
}

/* 罗盘玫瑰 */
function drawCompass(ctx,cw,ch,G,P,ST){
  if(!P.features.compass)return;
  const unit=cw/1000;
  const r=26*unit;
  const x=cw-r-34*unit, y=ch-r-34*unit;
  const ink=ST.frame.color, acc=ST.frame.accent;
  ctx.save();
  ctx.translate(x,y);
  ctx.lineWidth=Math.max(0.5,unit*0.8);
  ctx.beginPath(); ctx.arc(0,0,r*1.04,0,Math.PI*2);
  ctx.fillStyle=SY.rgba(ST.paper,0.72); ctx.fill();
  ctx.strokeStyle=SY.rgba(R.hexToRgb(ink),0.75);
  ctx.beginPath(); ctx.arc(0,0,r,0,Math.PI*2); ctx.stroke();
  ctx.beginPath(); ctx.arc(0,0,r*0.86,0,Math.PI*2); ctx.stroke();
  for(let k=0;k<32;k++){
    const a=k*Math.PI/16, L=(k%4===0)?r*0.14:r*0.07;
    ctx.beginPath();
    ctx.moveTo(Math.cos(a)*r*0.86,Math.sin(a)*r*0.86);
    ctx.lineTo(Math.cos(a)*(r*0.86-L),Math.sin(a)*(r*0.86-L));
    ctx.stroke();
  }
  for(let k=0;k<8;k++){
    const a=-Math.PI/2+k*Math.PI/4;
    const long=(k%2===0), rr=long?r*0.80:r*0.50;
    const w=long?0.16:0.11;
    ctx.beginPath();
    ctx.moveTo(Math.cos(a)*rr,Math.sin(a)*rr);
    ctx.lineTo(Math.cos(a+w)*r*0.20,Math.sin(a+w)*r*0.20);
    ctx.lineTo(Math.cos(a-w)*r*0.20,Math.sin(a-w)*r*0.20);
    ctx.closePath();
    ctx.fillStyle=(k===0)?SY.rgba(R.hexToRgb(acc),0.95):
                  (k%2===0?SY.rgba(R.hexToRgb(ink),0.72):SY.rgba(R.hexToRgb(ink),0.38));
    ctx.fill();
  }
  ctx.beginPath(); ctx.arc(0,0,r*0.075,0,Math.PI*2);
  ctx.fillStyle=SY.rgba(R.hexToRgb(ink),0.8); ctx.fill();
  ctx.font=`600 ${11*unit}px ${ZH_FONT}`;
  ctx.textAlign='center'; ctx.textBaseline='middle';
  ctx.fillStyle=SY.rgba(R.hexToRgb(ink),0.9);
  ctx.fillText('北',0,-r*1.02-7*unit);
  ctx.restore();
}

/* 比例尺 */
function niceRound(v){
  const p=Math.pow(10,Math.floor(Math.log10(v)));
  const t=v/p;
  if(t<1.5)return p; if(t<3)return 2*p; if(t<7)return 5*p; return 10*p;
}
function drawScaleBar(ctx,cw,ch,G,P,ST){
  if(!P.features.scalebar)return;
  const unit=cw/1000;
  const km= WORLD_KM[G.worldType]||3000;
  const barKm=niceRound(km/4);
  const w=cw*(barKm/km);
  const x=34*unit, y=ch-30*unit;
  const ink=ST.frame.color;
  ctx.save();
  ctx.fillStyle=SY.rgba(ST.paper,0.7);
  ctx.fillRect(x-8*unit,y-16*unit,w+16*unit,26*unit);
  ctx.strokeStyle=SY.rgba(R.hexToRgb(ink),0.85);
  ctx.lineWidth=Math.max(0.6,unit*0.9);
  const seg=4;
  for(let k=0;k<seg;k++){
    ctx.fillStyle=k%2?SY.rgba(R.hexToRgb(ink),0.85):SY.rgba(ST.paper,0.7);
    ctx.fillRect(x+w*k/seg,y-4*unit,w/seg,8*unit);
    ctx.strokeRect(x+w*k/seg,y-4*unit,w/seg,8*unit);
  }
  ctx.font=`600 ${8.5*unit}px ${ZH_FONT}`;
  ctx.fillStyle=SY.rgba(R.hexToRgb(ink),0.9);
  ctx.textAlign='center'; ctx.textBaseline='top';
  ctx.fillText('0',x,y+7*unit);
  ctx.fillText(String(barKm/2),x+w/2,y+7*unit);
  ctx.fillText(barKm+' 公里',x+w,y+7*unit);
  ctx.restore();
}

/* 装饰边框 */
function drawFrame(ctx,cw,ch,G,P,ST){
  if(!P.features.frame)return;
  const unit=cw/1000;
  const ink=ST.frame.color, acc=ST.frame.accent;
  const m=10*unit;
  ctx.save();
  ctx.strokeStyle=SY.rgba(R.hexToRgb(ink),0.9);
  ctx.lineWidth=Math.max(1,unit*1.1);
  ctx.strokeRect(m,m,cw-2*m,ch-2*m);
  ctx.lineWidth=Math.max(0.5,unit*0.45);
  const m2=m+4*unit;
  ctx.strokeRect(m2,m2,cw-2*m2,ch-2*m2);
  // 四角装饰
  const cs=12*unit;
  ctx.strokeStyle=SY.rgba(R.hexToRgb(acc),0.9);
  ctx.lineWidth=Math.max(0.8,unit*0.9);
  for(const [cx,cy,dx,dy] of [[m,m,1,1],[cw-m,m,-1,1],[m,ch-m,1,-1],[cw-m,ch-m,-1,-1]]){
    ctx.beginPath();
    ctx.moveTo(cx+dx*cs,cy);
    ctx.quadraticCurveTo(cx,cy,cx,cy+dy*cs);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx+dx*cs*0.55,cy);
    ctx.quadraticCurveTo(cx,cy,cx,cy+dy*cs*0.55);
    ctx.stroke();
  }
  ctx.restore();
}

/* 标题题签 */
function drawTitle(ctx,cw,ch,G,P,ST){
  if(!P.features.title||!G.title)return;
  const unit=cw/1000;
  const ink=ST.frame.color, acc=ST.frame.accent;
  const size=17*unit;
  ctx.save();
  ctx.font=`700 ${size}px ${ZH_FONT}`;
  const tw=ctx.measureText(G.title).width;
  const padX=22*unit, padY=10*unit;
  const w=tw+padX*2, h=size+padY*2;
  // 与原站相同：题签放在地图左上角，而不是地图正中央
  const x=Math.max(w/2+18*unit, 88*unit), y=m_top(ch,unit)+h/2+2*unit;
  ctx.fillStyle=SY.rgba(ST.paper,0.88);
  ctx.fillRect(x-w/2,y-h/2,w,h);
  ctx.strokeStyle=SY.rgba(R.hexToRgb(ink),0.9);
  ctx.lineWidth=Math.max(1,unit*1.0);
  ctx.strokeRect(x-w/2,y-h/2,w,h);
  ctx.lineWidth=Math.max(0.5,unit*0.4);
  ctx.strokeRect(x-w/2+3*unit,y-h/2+3*unit,w-6*unit,h-6*unit);
  // 两端菱形
  ctx.strokeStyle=SY.rgba(R.hexToRgb(acc),0.9);
  for(const sgn of [-1,1]){
    const dx=x+sgn*(w/2+10*unit);
    ctx.beginPath();
    ctx.moveTo(dx,y-5*unit); ctx.lineTo(dx+sgn*5*unit,y);
    ctx.lineTo(dx,y+5*unit); ctx.lineTo(dx-sgn*5*unit,y);
    ctx.closePath(); ctx.stroke();
  }
  ctx.fillStyle=SY.rgba(R.hexToRgb(ink),0.95);
  ctx.textAlign='center'; ctx.textBaseline='middle';
  ctx.fillText(G.title,x,y+unit*0.5);
  ctx.restore();
}
function m_top(ch,unit){ return 12*unit; }

/* 主入口 */
function draw(ctx,cw,ch,G,P,ST,opt){
  opt=opt||{};
  drawCities(ctx,cw,ch,G,P,ST);
  drawLabels(ctx,cw,ch,G,P,ST);
  drawCompass(ctx,cw,ch,G,P,ST);
  drawScaleBar(ctx,cw,ch,G,P,ST);
  drawFrame(ctx,cw,ch,G,P,ST);
  drawTitle(ctx,cw,ch,G,P,ST);
}

NS.decor={draw,drawLabels,drawCompass,drawScaleBar,drawFrame,drawTitle,
          cityMarker,markMarker,layoutLabels,Occupancy};
})(typeof self!=='undefined'?self:this);
