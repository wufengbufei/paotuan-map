/* =========================================================
   奇幻地图 / ui — 面板构建・绘制流程・编辑笔刷・导出配线
   ========================================================= */
(function(){
"use strict";
const NS=window.FMAP;
const C=NS.core, PL=NS.pipeline, SY=NS.style, RD=NS.render, EX=NS.exporters;
const clamp=C.clamp;
const $=id=>document.getElementById(id);

/* ---------- 状态 ---------- */
let P=PL.cloneParams(PL.DEFAULTS);
let G=null;
const pipe=PL.createPipeline();
let overlay=null;

// 编辑
let editOn=false, brushMode='raise', brushSize=12, brushStrength=5;
let placeMode=null;   // null | 'capital' | 'city' | 'mark' | 'move' | 'remove'
let markIcon='tower';
let moving=null;
let pinSerial=0;

// 撤销/重做
let editHistory=[], hIdx=-1;

// 种子历史
let seedHistory=[];

// 视图
let viewScale=1, viewX=0, viewY=0;

const canvas=$('cv'), ctx=canvas.getContext('2d');
const stage=$('stage'), stagewrap=$('stagewrap');

/* ---------- 工具 ---------- */
function el(tag,attrs,kids){
  const e=document.createElement(tag);
  if(attrs) for(const k in attrs){
    if(k==='text') e.textContent=attrs[k];
    else if(k==='html') e.innerHTML=attrs[k];
    else if(k==='class') e.className=attrs[k];
    else if(k==='style') e.style.cssText=attrs[k];
    else if(k.startsWith('on')) e.addEventListener(k.slice(2),attrs[k]);
    else e.setAttribute(k,attrs[k]);
  }
  if(kids) kids.forEach(k=>e.appendChild(k));
  return e;
}
function toast(msg){
  const t=$('toast');
  t.textContent=msg; t.classList.add('show');
  clearTimeout(t._tm);
  t._tm=setTimeout(()=>t.classList.remove('show'),2600);
}

/* ---------- 面板部品 ---------- */
function section(key,zh,open,bodyKids){
  const d=el('details',{class:'sec','data-sec':key});
  if(open) d.setAttribute('open','');
  d.appendChild(el('summary',null,[
    el('span',{text:zh,style:'font-family:var(--zh);font-size:13px;color:var(--brass);letter-spacing:.06em'}),
    el('span',{class:'chev',html:'<svg viewBox="0 0 24 24"><path d="M9 6l6 6-6 6"/></svg>'})
  ]));
  d.appendChild(el('div',{class:'body'},bodyKids));
  return d;
}
function seg(opts,getVal,setVal,cols){
  const wrap=el('div',{class:'seg'+(cols?' c'+cols:'')});
  const btns=[];
  opts.forEach(o=>{
    const b=el('button',{type:'button',text:o.label});
    if(o.full) b.classList.add('full');
    b.onclick=()=>{ setVal(o.v); btns.forEach(x=>x.classList.remove('on')); b.classList.add('on'); };
    if(getVal()===o.v) b.classList.add('on');
    btns.push(b); wrap.appendChild(b);
  });
  return wrap;
}
function range(label,min,max,step,getVal,setVal,fmt){
  const v=el('span',{class:'v'});
  const inp=el('input',{type:'range',min,max,step,value:getVal()});
  const show=()=>{ v.textContent=fmt?fmt(getVal()):getVal(); };
  inp.oninput=()=>{ setVal(parseFloat(inp.value)); show(); };
  show();
  return el('div',{class:'row'},[el('label',null,[el('span',{text:label}),v]),inp]);
}
function toggles(list,getVal,setVal){
  const wrap=el('div',{class:'toggles'});
  list.forEach(t=>{
    const d=el('div',{class:'tg'+(getVal(t.k)?' on':'')},[
      el('span',{class:'dot'}),el('span',{text:t.label})]);
    d.onclick=()=>{ const v=!getVal(t.k); setVal(t.k,v); d.classList.toggle('on',v); };
    wrap.appendChild(d);
  });
  return wrap;
}

/* ---------- 预设 ---------- */
const PRESETS=[
  {label:'中原大陆', p:{worldType:'continent',style:'antique',sea:0.42,rough:5,mtn:0.5,
    arid:-0.2,climate:0.44,riverDensity:0.5,nations:5,cityCount:16}},
  {label:'列岛', p:{worldType:'island',style:'antique',sea:0.40,rough:5,mtn:0.55,
    arid:-0.15,climate:0.34,riverDensity:0.45,nations:2,cityCount:9}},
  {label:'四方世界', p:{worldType:'world',style:'realistic',sea:0.40,rough:6,mtn:0.5,
    arid:-0.1,climate:0.5,riverDensity:0.4,nations:7,cityCount:22}},
  {label:'千岛航道', p:{worldType:'archipelago',style:'antique',sea:0.44,rough:6,mtn:0.35,
    arid:-0.25,climate:0.28,riverDensity:0.3,nations:4,cityCount:16}},
  {label:'极北荒原', p:{worldType:'continent',style:'realistic',sea:0.40,rough:5,mtn:0.6,
    arid:-0.15,climate:0.74,riverDensity:0.5,nations:3,cityCount:10}},
  {label:'大漠帝国', p:{worldType:'continent',style:'antique',sea:0.36,rough:4,mtn:0.45,
    arid:0.28,climate:0.30,riverDensity:0.22,nations:4,cityCount:12}},
  {label:'龙脊半岛', p:{worldType:'peninsula',style:'antique',sea:0.42,rough:5,mtn:0.55,
    arid:-0.2,climate:0.42,riverDensity:0.55,nations:2,cityCount:10}},
  {label:'测绘全图', p:{worldType:'continent',style:'blank',sea:0.40,rough:5,mtn:0.5,
    arid:-0.2,climate:0.42,riverDensity:0.45,nations:0,cityCount:8,
    features:{borders:false,symbols:false}}}
];
const WORLD_OPTS=[
  {v:'world',label:'世界地图',full:true},
  {v:'continent',label:'大陆'},{v:'peninsula',label:'半岛'},
  {v:'archipelago',label:'群岛'},{v:'island',label:'孤岛'},
  {v:'inland',label:'内海'},{v:'interior',label:'内陆'}
];
const DETAIL_OPTS=[{v:160,label:'粗略'},{v:240,label:'标准'},{v:320,label:'精细'},{v:420,label:'最精细'}];
const WIND_DIR16=['东','东南偏东','东南','东南偏南','南','西南偏南','西南','西南偏西',
                  '西','西北偏西','西北','西北偏北','北','东北偏北','东北','东北偏东'];
const windDirLabel=deg=>{
  const i=Math.round((((deg%360)+360)%360)/22.5)%16;
  return '向'+WIND_DIR16[i]+' '+deg+'°';
};
const CLIMATE_LABELS=[[0.10,'热带'],[0.30,'亚热带'],[0.52,'温带'],[0.72,'亚寒带'],[1.01,'寒带']];
function climateLabel(v){
  for(const [t,l] of CLIMATE_LABELS) if(v<t) return l+' '+Math.round(v*90)+'°';
  return '极 90°';
}

function geoGet(k){ return (P.geo&&P.geo[k]!=null)?P.geo[k]:1; }
function geoSet(k,v){ if(!P.geo)P.geo={}; P.geo[k]=v; regenerate({snapshot:false}); }
const fmtGeo=v=>v===0?'无影响':v<0.8?'弱':v<1.3?'标准':'强';

function applyPreset(pr){
  P.features=PL.cloneParams(PL.DEFAULTS).features;
  Object.keys(pr.p).forEach(k=>{
    if(k==='features') Object.assign(P.features,pr.p.features);
    else P[k]=pr.p[k];
  });
  if(pr.p.nations===0) P.features.borders=false;
  else if(pr.p.nations) P.features.borders=true;
  rebuildPanel();
  regenerate();
}
function newWorld(){
  if(hasUserWork()){
    confirmDialog('手绘编辑与放置将被重置。生成新世界吗？',doNewWorld);
    return;
  }
  doNewWorld();
}
function doNewWorld(){
  clearUserWork(); commitAll();
  P.seed=Math.floor(Math.random()*99999999);
  rebuildPanel(); regenerate();
  toast('已生成新的大地');
}
function shuffleWorld(){
  if(hasUserWork()){
    confirmDialog('手绘编辑与放置将被重置。重新掷骰吗？',doShuffle);
    return;
  }
  doShuffle();
}
function doShuffle(){
  clearUserWork(); commitAll();
  const pick=a=>a[Math.floor(Math.random()*a.length)];
  const rnd=(a,b)=>a+Math.random()*(b-a);
  const r2=v=>Math.round(v*100)/100;
  P.features=PL.cloneParams(PL.DEFAULTS).features;
  P.seed=Math.floor(Math.random()*99999999);
  P.worldType=pick(['world','continent','continent','peninsula','archipelago','island','inland','interior']);
  P.sea=r2(rnd(0.34,0.48));
  P.rough=Math.round(rnd(3,8));
  P.mtn=r2(rnd(0.3,0.7));
  P.plain=r2(rnd(0,0.7));
  P.mura=r2(rnd(0,0.8));
  P.arid=r2(rnd(-0.35,0.3));
  P.windDeg=Math.floor(Math.random()*72)*5;
  P.wind=[0,2,1,3][Math.round(P.windDeg/90)%4];
  P.climate=r2(rnd(0.12,0.8));
  P.riverDensity=r2(rnd(0.25,0.65));
  P.nations=Math.floor(rnd(2,8));
  P.cityCount=Math.floor(rnd(8,24));
  P.features.symbols=P.style==='antique';
  P.features.snowfield=P.climate>0.6&&Math.random()<0.5;
  P.features.borders=true;
  rebuildPanel(); regenerate();
  toast('世界已重新掷骰');
}

/* ---------- 面板主体 ---------- */
function buildPanel(){
  const body=$('panelBody');
  body.innerHTML='';

  body.appendChild(section('map-presets','地图预设',true,[
    el('div',{class:'chips'},[
      ...PRESETS.map(pr=>
        el('button',{class:'chip',text:pr.label,type:'button',onclick:()=>applyPreset(pr)})),
      el('button',{class:'chip shuffle',text:'⚄ 掷骰',type:'button',
        title:'地形・气候・文明・样式一起重新掷骰',onclick:shuffleWorld})
    ])
  ]));

  const seedInp=el('input',{id:'seedInput',type:'text',inputmode:'numeric',value:String(P.seed)});
  seedInp.oninput=()=>{ seedInp.value=seedInp.value.replace(/\D/g,'').slice(0,8); };
  seedInp.onchange=()=>{
    const v=parseInt(seedInp.value,10);
    if(!isFinite(v)){ seedInp.value=String(P.seed); return; }
    if(v===P.seed)return;
    P.seed=v; regenerate();
  };
  body.appendChild(section('map-seed','种子参数',true,[
    el('div',{class:'seedrow'},[
      seedInp,
      el('button',{class:'ibtn icon-only',type:'button',title:'随机种子',
        html:'<svg viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8.5" cy="8.5" r="1.2" fill="currentColor" stroke="none"/><circle cx="15.5" cy="15.5" r="1.2" fill="currentColor" stroke="none"/><circle cx="15.5" cy="8.5" r="1.2" fill="currentColor" stroke="none"/><circle cx="8.5" cy="15.5" r="1.2" fill="currentColor" stroke="none"/></svg>',
        onclick:()=>newWorld()})
    ]),
    el('div',{class:'hist',id:'seedHist'}),
    el('button',{class:'btn primary stack',type:'button',text:'⟳  生成新的大地',
      onclick:()=>newWorld()})
  ]));

  body.appendChild(section('map-world','大地形态',true,[
    seg(WORLD_OPTS,()=>P.worldType,v=>{ P.worldType=v; regenerate(); })
  ]));

  body.appendChild(section('map-style','画风',true,[
    seg(SY.STYLE_LIST.map(id=>({v:id,label:SY.STYLES[id].label})),
      ()=>P.style,v=>{ P.style=v; renderLegend(); redraw(); saveLocal(); },3)
  ]));

  body.appendChild(section('map-land','地势',true,[
    range('海面',0.20,0.60,0.01,()=>P.sea,v=>{P.sea=v;regenerate({snapshot:false});},v=>v.toFixed(2)),
    range('起伏细腻度',2,8,1,()=>P.rough,v=>{P.rough=v;regenerate({snapshot:false});},v=>String(v)),
    range('山峦险峻',0,0.9,0.05,()=>P.mtn,v=>{P.mtn=v;regenerate({snapshot:false});},v=>v.toFixed(2)),
    range('棱线锐度',0,1,0.05,()=>P.ridgeSharp,v=>{P.ridgeSharp=v;regenerate({snapshot:false});},
      v=>v===0?'平滑':v.toFixed(2)),
    range('平原广度',0,1,0.05,()=>P.plain==null?0:P.plain,
      v=>{P.plain=v;regenerate({snapshot:false});},
      v=>v===0?'无':v<0.35?'较少':v<0.7?'较广':'大平原'),
    range('地形斑纹',0,1,0.05,()=>P.mura==null?0:P.mura,
      v=>{P.mura=v;regenerate({snapshot:false});},
      v=>v===0?'均匀':v<0.5?'较少':'地域差明显'),
    range('干燥度',-0.4,0.5,0.05,()=>P.arid,v=>{P.arid=v;regenerate({snapshot:false});},v=>v.toFixed(2)),
    range('气候带（中央纬度）',0,1,0.02,()=>P.climate,v=>{P.climate=v;regenerate({snapshot:false});},climateLabel),
    range('雨云流向',0,355,5,
      ()=>P.windDeg==null?[0,180,90,270][P.wind||0]:P.windDeg,
      v=>{ P.windDeg=v; P.wind=[0,2,1,3][Math.round(v/90)%4]; regenerate({snapshot:false}); },
      windDirLabel),
    range('河川密度',0,1,0.05,()=>P.riverDensity,v=>{P.riverDensity=v;regenerate({snapshot:false});},
      v=>v===0?'无':v.toFixed(2))
  ]));

  body.appendChild(section('map-nature','自然环境',true,[
    toggles([
      {k:'mountains',label:'山岳'},{k:'deserts',label:'沙漠'},
      {k:'forests',label:'森林'},{k:'rivers',label:'河川'},
      {k:'wetlands',label:'湿地'},{k:'snow',label:'雪山'},
      {k:'snowfield',label:'雪原'}
    ],k=>P.features[k],(k,v)=>{ P.features[k]=v; regenerate({snapshot:false}); }),
    range('湖沼',0,1,0.05,()=>P.features.lakes===false?0:(P.lakeAmount==null?0.4:P.lakeAmount),
      v=>{ P.lakeAmount=v; P.features.lakes=v>0; regenerate({snapshot:false}); },
      v=>v===0?'无':v<0.3?'极少':v<0.55?'标准':v<0.85?'较多':'最多'),
    range('流冰',0,1.6,0.05,()=>P.features.seaice===false?0:(P.iceAmount==null?1:P.iceAmount),
      v=>{ P.iceAmount=v; P.features.seaice=v>0; regenerate({snapshot:false}); },
      v=>v===0?'无':v<0.7?'较少':v<=1.1?'标准':v<1.45?'较多':'冰期')
  ]));

  body.appendChild(section('map-settle','国家',false,[
    range('国家数量',0,10,1,()=>P.nations,v=>{
      P.nations=v; P.features.borders=v>0; regenerate({snapshot:false});
    },v=>v===0?'无':String(v)),
    range('城市数量',0,48,1,()=>P.cityCount,v=>{P.cityCount=v;regenerate({snapshot:false});},
      v=>v===0?'无':String(v)),
    el('div',{class:'row'},[
      el('label',null,[el('span',{text:'地名文化'})]),
      seg(NS.names.CULTURES,()=>P.nameCulture,v=>{P.nameCulture=v;regenerate({snapshot:false});},4)
    ])
  ]));

  body.appendChild(section('map-realm','边境线',false,[
    el('div',{class:'algo',style:'margin-bottom:10px',text:'国境沿何种地形划分的权重。设为 0 则该地形不再分隔国家。'}),
    range('山岳分隔',0,2,0.1,()=>geoGet('mountains'),v=>geoSet('mountains',v),fmtGeo),
    range('河川分隔',0,2,0.1,()=>geoGet('rivers'),v=>geoSet('rivers',v),fmtGeo),
    range('荒漠冻土分隔',0,2,0.1,()=>geoGet('deserts'),v=>geoSet('deserts',v),fmtGeo),
    range('无主地广度',0,2,0.1,()=>geoGet('frontier'),v=>geoSet('frontier',v),
      v=>v===0?'无':v<0.8?'狭窄':v<1.3?'标准':'广阔'),
    range('跨海支配',0,2,0.1,()=>geoGet('sail'),v=>geoSet('sail',v),
      v=>v===0?'不含岛屿':v<0.8?'仅近海':v<1.3?'标准':'至远洋'),
    el('div',{class:'hint',text:'无主地是不属于任何国家的边境。越广阔，国家力所不及的荒野越多。'})
  ]));

  body.appendChild(section('map-face','图面',false,[
    toggles([
      {k:'labels',label:'地名'},{k:'cities',label:'城市'},
      {k:'borders',label:'国境'},{k:'symbols',label:'象形符号'},
      {k:'roads',label:'街道'},{k:'searoutes',label:'航路'},
      {k:'frame',label:'装饰框'},{k:'compass',label:'罗盘'},
      {k:'scalebar',label:'比例尺'},{k:'title',label:'题签'},
      {k:'shade',label:'阴影'},{k:'grid',label:'经纬线'}
    ],k=>P.features[k],(k,v)=>{
      P.features[k]=v;
      if(k==='labels'||k==='cities'||k==='borders') regenerate({snapshot:false});
      else redraw();
      saveLocal();
    }),
  ]));

  body.appendChild(section('map-detail','精度',false,[
    el('div',{class:'row'},[
      el('label',null,[el('span',{text:'海岸线绘制'})]),
      seg([{v:'crisp',label:'精细（网格）'},{v:'smooth',label:'平滑'}],
        ()=>P.coastStyle,v=>{P.coastStyle=v;redraw();saveLocal();})
    ]),
    seg(DETAIL_OPTS,()=>P.detail,v=>{
      P.detail=v;
      overlay=PL.resampleOverlay(overlay,v,Math.round(v*0.75));
      if(overlay){ overlay.rev=(overlay.rev||0)+1; overlay.ownerRev=(overlay.ownerRev||0)+1; }
      regenerate({snapshot:false});
    },4)
  ]));

  // 手绘编辑
  const editPanel=el('div',{id:'editPanel',class:'stack',style:editOn?'':'display:none'},[
    seg(PL.BRUSH_MODES,()=>brushMode,v=>{brushMode=v;},2),
    range('应用强度',1,10,1,()=>brushStrength,v=>{brushStrength=v;},v=>String(v)),
    range('笔刷大小',1,30,1,()=>brushSize,v=>{brushSize=v;},v=>String(v)),
    el('button',{class:'btn ghost stack',type:'button',text:'清除全部编辑',
      onclick:()=>{
        if(!PL.hasEdits(overlay)){ toast('没有编辑'); return; }
        confirmDialog('清除全部手绘编辑吗？',()=>{
          overlay=null; commitEdit(); regenerate({snapshot:false});
        });
      }})
  ]);
  body.appendChild(section('Edit','手绘编辑',false,[
    seg([{v:false,label:'关闭'},{v:true,label:'开启编辑'}],()=>editOn,v=>{
      editOn=v;
      editPanel.style.display=v?'':'none';
      stage.classList.toggle('editing',v);
      if(v&&placeMode){ placeMode=null; stage.classList.remove('placing'); rebuildPanel(); }
      updateModeExitBtns();
    }),
    editPanel
  ]));

  body.appendChild(section('Output','导出',true,[
    el('div',{class:'btnrow c2'},[
      el('button',{class:'btn ghost',type:'button',text:'PNG',onclick:()=>exportPNG(1900)}),
      el('button',{class:'btn ghost',type:'button',text:'PNG 大',onclick:()=>exportPNG(3200)}),
      el('button',{class:'btn ghost',type:'button',text:'SVG',onclick:()=>exportSVG()}),
      el('button',{class:'btn ghost',type:'button',text:'GeoJSON',onclick:()=>exportGeoJSON()}),
      el('button',{class:'btn ghost',type:'button',text:'高度图',onclick:()=>exportHeightmap()}),
      el('button',{class:'btn ghost',type:'button',text:'PNG 无框',onclick:()=>exportPlain()})
    ]),
    el('div',{class:'btnrow c2',style:'margin-top:8px'},[
      el('button',{class:'btn ghost',type:'button',text:'设定资料 (.txt)',onclick:()=>exportCodex()}),
      el('button',{class:'btn ghost',type:'button',text:'保存(.json)',onclick:()=>saveProject()}),
      el('button',{class:'btn ghost',type:'button',text:'读取',onclick:()=>$('fileInput').click()})
    ])
  ]));

  body.appendChild(section('Legend','图例',false,[el('div',{class:'legend',id:'legendBox'})]));
  renderLegend();

  // 高级设置
  body.appendChild(section('Advanced','高级设置',false,[
    el('div',{class:'algo',style:'margin-bottom:8px',text:'放置编辑：选择模式后点击地图即可放置。'}),
    seg([{v:null,label:'关闭'},{v:'capital',label:'首都'},{v:'city',label:'城市'},
         {v:'mark',label:'地标'},{v:'move',label:'移动'},{v:'remove',label:'删除'}],
        ()=>placeMode,v=>{
          placeMode=v; moving=null;
          if(v&&editOn){ editOn=false; stage.classList.remove('editing'); rebuildPanel(); }
          stage.classList.toggle('placing',!!v);
          updateModeExitBtns();
        },3),
    el('div',{id:'markIconRow',class:'stack',style:placeMode==='mark'?'':'display:none'},[
      seg([{v:'tower',label:'塔'},{v:'temple',label:'神殿'},{v:'ruin',label:'遗迹'},{v:'keep',label:'城砦'}],
          ()=>markIcon,v=>{markIcon=v;},4)
    ]),
    el('div',{class:'hint',text:'放置首都将在该处新增一个国家。放置内容会包含在项目保存中。'}),
    el('div',{class:'algo',style:'margin:16px 0 8px',text:'板块构造：操纵产生山脉与裂谷的大地骨架。'}),
    range('板块数量',0,14,1,()=>P.plates||0,v=>{P.plates=v;regenerate({snapshot:false});},
      v=>v===0?'自动':String(v)),
    range('造山运动',0,2,0.05,()=>P.tect==null?1:P.tect,v=>{P.tect=v;regenerate({snapshot:false});},
      v=>v.toFixed(2)),
    el('div',{class:'algo',style:'margin:16px 0 8px',text:'显示调整：改变地图上文字的大小。'}),
    range('文字大小',0.7,1.4,0.05,()=>P.labelScale==null?1:P.labelScale,
      v=>{P.labelScale=v;redraw();},
      v=>Math.round(v*100)+'%')
  ]));

  const resetBtn=el('button',{class:'btn ghost',text:'初始化设置',type:'button'});
  resetBtn.onclick=()=>confirmDialog('全部设置恢复初始状态吗？（种子与手绘编辑保留）',()=>{
    const seed=P.seed;
    P=PL.cloneParams(PL.DEFAULTS);
    P.seed=seed;
    rebuildPanel(); commitAll(); regenerate(); saveLocal();
    toast('设置已初始化');
  });
  body.appendChild(el('div',{class:'panel-reset'},[resetBtn]));

  body.appendChild(el('div',{class:'panel-foot'},[
    el('div',{class:'pf-copy',text:'跑团世界地图生成器 · 设计灵感来自 ASOBOAD USOMAP'})
  ]));
}
function rebuildPanel(){
  const st={};
  document.querySelectorAll('#panelBody details.sec').forEach(d=>{
    const k=d.getAttribute('data-sec'); if(k) st[k]=d.open;
  });
  buildPanel();
  document.querySelectorAll('#panelBody details.sec').forEach(d=>{
    const k=d.getAttribute('data-sec'); if(k&&st[k]!=null) d.open=st[k];
  });
  renderSeedHistory(); updateModeExitBtns();
}

/* ---------- 图例 ---------- */
function renderLegend(){
  const box=$('legendBox');
  if(!box)return;
  box.innerHTML='';
  const ST=SY.get(P.style);
  const items=[];
  const B=NS.biome;
  for(let k=0;k<B.BIOME_ZH.length;k++){
    items.push({label:B.BIOME_ZH[k],color:SY.hex(ST.pal[k])});
  }
  items.forEach(it=>{
    box.appendChild(el('div',null,[
      el('i',{style:'background:'+it.color}),
      el('span',{text:it.label})
    ]));
  });
}

/* ---------- 绘制 ---------- */
function fitStage(){
  const wr=stagewrap.getBoundingClientRect();
  const bw=canvas.width, bh=canvas.height;
  const s=Math.min((wr.width-8)/bw,(wr.height-8)/bh);
  stage.style.transform=`scale(${s*viewScale}) translate(${viewX}px,${viewY}px)`;
  stage.dataset.fit=s;
}
function redraw(){
  if(!G) return;
  busy(true);
  requestAnimationFrame(()=>{
    RD.drawMap(ctx,canvas.width,canvas.height,G,P);
    $('mapTitle').innerHTML='《<b>'+G.title+'</b>》';
    busy(false);
    fitStage();
  });
}
function busy(on){ $('busy').classList.toggle('show',!!on); }

function regenerate(opt){
  opt=opt||{};
  busy(true);
  setTimeout(()=>{
    G=pipe.run(P,overlay);
    redraw();
    if(opt.snapshot!==false) commitEdit();
    pushSeedHistory();
    saveLocal();
  },30);
}

/* ---------- 种子历史 ---------- */
function pushSeedHistory(){
  const thumb=canvas.toDataURL('image/png',0.5);
  seedHistory=seedHistory.filter(s=>s.params.seed!==P.seed);
  seedHistory.unshift({params:PL.cloneParams(P),thumb});
  if(seedHistory.length>8) seedHistory.pop();
  renderSeedHistory();
}
function renderSeedHistory(){
  const box=$('seedHist');
  if(!box)return;
  box.innerHTML='';
  seedHistory.forEach(s=>{
    const img=el('img',{src:s.thumb,alt:''});
    const d=el('div',{class:'h',title:'种子 '+s.params.seed,onclick:()=>{
      P=PL.cloneParams(s.params);
      rebuildPanel(); regenerate({snapshot:false});
    }},[img]);
    box.appendChild(d);
  });
}

/* ---------- 编辑历史 ---------- */
function refreshUndo(){
  $('btnUndo').disabled=!(hIdx>0);
  $('btnRedo').disabled=!(hIdx<editHistory.length-1);
}
function snapshotState(){
  return {ov:PL.cloneOverlay(overlay),
          pins:JSON.parse(JSON.stringify(P.pins||{cities:[],removed:[],marks:[]}))};
}
function commitEdit(){
  editHistory.length=hIdx+1;
  editHistory.push(snapshotState());
  hIdx=editHistory.length-1;
  if(editHistory.length>26){ editHistory.splice(0,editHistory.length-26); hIdx=editHistory.length-1; }
  refreshUndo();
}
const commitAll=commitEdit;
function applyHistory(){
  const h=editHistory[hIdx]||{};
  overlay=PL.cloneOverlay(h.ov||null);
  P.pins=JSON.parse(JSON.stringify(h.pins||{cities:[],removed:[],marks:[]}));
  pipe.invalidate();
  regenerate({snapshot:false});
}
function undo(){ if(hIdx>0){ hIdx--; applyHistory(); } }
function redo(){ if(hIdx<editHistory.length-1){ hIdx++; applyHistory(); } }
function hasUserWork(){
  const pins=P.pins||{};
  return PL.hasEdits(overlay)||(pins.cities||[]).length>0||(pins.marks||[]).length>0||(pins.removed||[]).length>0;
}
function clearUserWork(){
  overlay=null;
  P.pins={cities:[],removed:[],marks:[]};
}

function updateModeExitBtns(){
  const be=$('btnExitEdit'), bp=$('btnExitPlace');
  if(be) be.style.display=editOn?'':'none';
  if(bp) bp.style.display=placeMode?'':'none';
}

/* ---------- 画布交互 ---------- */
let drawing=false;
let panning=false, panStart=null;
function canvasPos(e){
  const r=canvas.getBoundingClientRect();
  // 直接从视口坐标映射到网格坐标，跳过 canvas 像素中间层避免精度损失
  const gx=Math.floor((e.clientX-r.left)/r.width*G.gw+1e-9);
  const gy=Math.floor((e.clientY-r.top)/r.height*G.gh+1e-9);
  return {x:(e.clientX-r.left)/r.width*canvas.width,
          y:(e.clientY-r.top)/r.height*canvas.height,gx,gy};
}
function brushAt(e){
  if(!G) return;
  const p=canvasPos(e);
  if(!overlay) overlay=PL.newOverlay(G.gw,G.gh);
  const T=pipe.cache.T;
  if(!T) return;
  PL.applyBrush(overlay,T,brushMode,p.gx,p.gy,brushSize,brushStrength,G.sea);
}
canvas.addEventListener('pointerdown',e=>{
  if(!G)return;
  if(editOn){
    drawing=true;
    canvas.setPointerCapture(e.pointerId);
    brushAt(e);
    redrawOverlay();
  } else if(placeMode){
    placeAt(e);
  } else {
    // 非编辑模式：点击领土 → 弹出国家档案
    try{
      const p=canvasPos(e);
      if(G&&G.nations&&G.nations.owner&&G.nations.list){
        const gi=Math.max(0,Math.min(G.gw*G.gh-1,(Math.floor(p.gy)*G.gw+Math.floor(p.gx))|0));
        const oid=G.nations.owner[gi];
        if(oid>=0&&G.nations.list[oid]&&G.nations.list[oid].cells>=12){
          showLore(oid);
          return;
        }
      }
    }catch(err){ toast('点击出错: '+err.message); }
    panning=true;
    panStart={x:e.clientX,y:e.clientY,ox:viewX,oy:viewY};
    stage.classList.add('panning');
    canvas.setPointerCapture(e.pointerId);
  }
});
canvas.addEventListener('pointermove',e=>{
  if(drawing&&editOn){
    brushAt(e);
    redrawOverlay();
  } else if(panning&&panStart){
    viewX=panStart.ox+(e.clientX-panStart.x);
    viewY=panStart.oy+(e.clientY-panStart.y);
    fitStage();
  }
});
canvas.addEventListener('pointerup',()=>{
  if(drawing){
    drawing=false;
    regenerate({snapshot:false});
    commitEdit();
  }
  if(panning){
    panning=false; panStart=null; stage.classList.remove('panning');
  }
});
canvas.addEventListener('pointercancel',()=>{
  drawing=false; panning=false; panStart=null; stage.classList.remove('panning');
});
let overlayRedrawTm=null;
function redrawOverlay(){
  // 绘制中仅重分类（快）
  if(!G)return;
  clearTimeout(overlayRedrawTm);
  overlayRedrawTm=setTimeout(()=>{
    const T=pipe.cache.T;
    if(!T)return;
    const n=G.gw*G.gh;
    for(let i=0;i<n;i++){
      if(overlay.mask[i]){
        G.elev[i]=clamp(T.elev[i]+overlay.dElev[i],0,1);
        G.precip[i]=clamp(G.basePrecip[i]+overlay.dPrecip[i],0,1);
      }
    }
    pipe.reclassify(G,P);
    redraw();
  },60);
}

function placeAt(e){
  const p=canvasPos(e);
  const gx=p.x/canvas.width*G.gw, gy=p.y/canvas.height*G.gh;
  if(!P.pins) P.pins={cities:[],removed:[],marks:[]};
  if(placeMode==='capital'||placeMode==='city'){
    P.pins.cities.push({id:'pin-'+(++pinSerial),x:gx,y:gy,type:placeMode,name:''});
    regenerate({snapshot:false}); commitEdit();
    toast(placeMode==='capital'?'已放置首都':'已放置城市');
  } else if(placeMode==='mark'){
    const name=prompt('地标名称（可为空）:','');
    if(name===null)return;
    P.pins.marks.push({id:'mark-'+(++pinSerial),x:gx,y:gy,icon:markIcon,name});
    regenerate({snapshot:false}); commitEdit();
    toast('已放置地标');
  } else if(placeMode==='remove'){
    // 找最近城市
    let best=null,bd=1e9;
    for(const c of G.cities){
      const d=Math.hypot(c.x-gx,c.y-gy);
      if(d<bd){bd=d;best=c;}
    }
    if(best&&bd<G.gw*0.04){
      P.pins.removed.push({targetId:best.id});
      regenerate({snapshot:false}); commitEdit();
      toast('已删除: '+best.name);
    } else toast('附近没有城市');
  } else if(placeMode==='move'){
    toast('移动模式：拖拽城市尚未实现，请用删除+重新放置代替');
  }
}

/* ---------- 视图缩放 ---------- */
$('btnZoomIn').onclick=()=>{ viewScale=Math.min(6,viewScale*1.18); updateZoomV(); fitStage(); };
$('btnZoomOut').onclick=()=>{ viewScale=Math.max(0.75,viewScale/1.18); updateZoomV(); fitStage(); };
$('btnZoomReset').onclick=()=>{ viewScale=1; viewX=0; viewY=0; updateZoomV(); fitStage(); };
function updateZoomV(){ $('zoomV').textContent=Math.round(viewScale*100)+'%'; }

/* ---------- 导出 ---------- */
function exportPNG(w){
  const scale=w/canvas.width;
  const cv=document.createElement('canvas');
  cv.width=w; cv.height=Math.round(canvas.height*scale);
  const c2=cv.getContext('2d');
  RD.drawMap(c2,cv.width,cv.height,G,P);
  cv.toBlob(b=>EX.download('地图-'+P.seed+'.png',b),'image/png');
  toast('已导出 PNG');
}
function exportPlain(){
  const bak={frame:P.features.frame,compass:P.features.compass,scalebar:P.features.scalebar,title:P.features.title};
  P.features.frame=P.features.compass=P.features.scalebar=P.features.title=false;
  const cv=document.createElement('canvas');
  cv.width=1900; cv.height=Math.round(canvas.height*1900/canvas.width);
  RD.drawMap(cv.getContext('2d'),cv.width,cv.height,G,P);
  P.features.frame=bak.frame;P.features.compass=bak.compass;P.features.scalebar=bak.scalebar;P.features.title=bak.title;
  cv.toBlob(b=>EX.download('地图-无框-'+P.seed+'.png',b),'image/png');
}
function exportSVG(){
  const w=1900,h=Math.round(canvas.height*1900/canvas.width);
  const svg=EX.makeSVGCtx(w,h);
  RD.drawMap(svg.ctx,w,h,G,P);
  EX.download('地图-'+P.seed+'.svg',svg.toString(),'image/svg+xml');
  toast('已导出 SVG');
}
function exportGeoJSON(){
  EX.download('地图-'+P.seed+'.geojson',JSON.stringify(EX.geoJSON(G,P)),'application/json');
}
function exportHeightmap(){
  EX.heightmapBlob(G).toBlob(b=>EX.download('高度图-'+P.seed+'.png',b),'image/png');
}
function exportCodex(){
  EX.download('设定资料-'+P.seed+'.txt',EX.codexText(G,P),'text/plain;charset=utf-8');
}

/* ---------- 项目保存/读取 ---------- */
function saveProject(){
  const data={v:'fmap-1',P:P,overlay:overlay?{
    dElev:Array.from(overlay.dElev),dTemp:Array.from(overlay.dTemp),
    dPrecip:Array.from(overlay.dPrecip),mask:Array.from(overlay.mask),
    owner:Array.from(overlay.owner)
  }:null};
  EX.download('项目-'+P.seed+'.json',JSON.stringify(data),'application/json');
  toast('项目已保存');
}
$('fileInput').addEventListener('change',e=>{
  const f=e.target.files[0];
  if(!f)return;
  const rd=new FileReader();
  rd.onload=ev=>{
    try{
      const d=JSON.parse(ev.target.result);
      P=Object.assign(PL.cloneParams(PL.DEFAULTS),d.P||{});
      if(d.overlay){
        const o=PL.newOverlay(P.detail,Math.round(P.detail*9/16));
        o.dElev=Float32Array.from(d.overlay.dElev||[]);
        o.dTemp=Float32Array.from(d.overlay.dTemp||[]);
        o.dPrecip=Float32Array.from(d.overlay.dPrecip||[]);
        o.mask=Uint8Array.from(d.overlay.mask||[]);
        o.owner=Int16Array.from(d.overlay.owner||[]);
        overlay=o;
      } else overlay=null;
      pipe.invalidate();
      rebuildPanel(); regenerate({snapshot:false});
      toast('项目已读取');
    }catch(err){ toast('读取失败: '+err.message); }
  };
  rd.readAsText(f);
  e.target.value='';
});

/* ---------- 分享 ---------- */
/* 移动端面板抽屉切换 */
(function(){
  const btn=$('btnPanel'), mask=$('panelMask');
  function setOpen(open){
    document.body.classList.toggle('panel-open',open);
    if(!open) mask.style.display='none';
  }
  btn.onclick=()=>{
    const open=!document.body.classList.contains('panel-open');
    setOpen(open);
    if(open) mask.style.display='block';
  };
  mask.addEventListener('click',()=>setOpen(false));
  // 面板内切换参数后，移动端自动收起抽屉
  document.addEventListener('click',e=>{
    if(document.body.classList.contains('panel-open')){
      const inside=e.target.closest('aside');
      if(inside){
        const chip=e.target.closest('.chip,.seg button,.tg');
        if(chip) setTimeout(()=>setOpen(false),260);
      }
    }
  });
})();
$('btnShare').onclick=()=>{
  const u=new URL(location.href);
  u.searchParams.set('cfg',btoa(encodeURIComponent(JSON.stringify(P))));
  $('shareUrl').value=u.toString();
  $('shareModal').classList.add('show');
};
$('shareCopy').onclick=()=>{
  $('shareUrl').select();
  document.execCommand('copy');
  toast('链接已复制');
};
$('shareClose').onclick=()=>$('shareModal').classList.remove('show');

/* ---------- 确认对话框 ---------- */
let confirmCb=null;
function confirmDialog(msg,cb){
  $('confirmMsg').textContent=msg;
  confirmCb=cb;
  $('confirmModal').classList.add('show');
}
$('confirmCancel').onclick=()=>$('confirmModal').classList.remove('show');
$('confirmOk').onclick=()=>{
  $('confirmModal').classList.remove('show');
  if(confirmCb)confirmCb();
};

/* ---------- 3D ---------- */
$('btn3d').onclick=()=>{ if(NS.view3d) NS.view3d.open(G,P); };
$('v3dClose').onclick=()=>{ if(NS.view3d) NS.view3d.close(); };
$('v3dSave').onclick=()=>{ if(NS.view3d) NS.view3d.savePNG(); };

/* 3D 控制条 */
(function(){
  const V=()=>NS.view3d;
  const bind=(id,key,fmt,vid)=>{
    const el=$(id);
    if(!el)return;
    el.addEventListener('input',()=>{
      const v=parseFloat(el.value);
      if(V()) V().setOpt(key,v);
      if(vid) $(vid).textContent=fmt?fmt(v):v;
    });
  };
  bind('v3dExag','exag',v=>v.toFixed(2),'v3dExagV');
  bind('v3dFont','fontScale',v=>Math.round(v)+'%','v3dFontV');
  bind('v3dAz','azim',v=>{
    const dirs=['E','ENE','NE','NNE','N','NNW','NW','WNW','W','WSW','SW','SSW','S','SSE','SE','ESE'];
    const i=Math.round(((v+Math.PI)/(Math.PI*2))*16)%16;
    return dirs[(16-i)%16];
  },'v3dAzV');
  bind('v3dSh','shadow',v=>v.toFixed(2),'v3dShV');
  const tg=(id,key)=>{
    const el=$(id);
    if(!el)return;
    el.addEventListener('click',()=>{
      const on=!el.classList.contains('on');
      el.classList.toggle('on',on);
      if(V()) V().setOpt(key,on);
    });
  };
  tg('v3dSpin','spin');
  $('v3dLabels')&&$('v3dLabels').classList.add('on');
  tg('v3dLabels','labels');
  tg('v3dRoutes','routes');
  $('v3dBorders')&&$('v3dBorders').classList.add('on');
  tg('v3dBorders','borders');
  tg('v3dFrontier','frontier');
  tg('v3dTrees','miniature');
  tg('v3dOuter','outer');
})();

/* ---------- 帮助/关于 ---------- */
$('btnHelp').onclick=()=>{
  $('helpBody').innerHTML=
    '<p><b>工作原理</b>：本工具以种子驱动的程序化生成为核心——由板块构造生成大陆骨架，'+
    '经水力侵蚀雕刻河谷，按纬度与风带模拟气候，用 Whittaker 分类划分生物群系，'+
    '再以 D8 流向累积提取河网、以成本距离生长国家、以 A* 寻路铺设街道与航路。</p>'+
    '<p><b>操作</b>：左侧面板调整参数即时重生成；「手绘编辑」可直接改造地形；'+
    '「高级设置」中可放置首都/城市/地标。撤销/重做支持全部编辑。</p>'+
    '<p><b>导出</b>：支持 PNG / SVG（分层）/ GeoJSON / 高度图 / 设定资料文本。</p>';
  $('helpModal').classList.add('show');
};
$('helpClose').onclick=()=>$('helpModal').classList.remove('show');
/* ---------- 国家档案弹窗 ---------- */
function showLore(oid){
  if(!G){ toast('G missing'); return; }
  if(!G.nations||!G.nations.list||!G.nations.owner){ toast('no nations data'); return; }
  const N=G.nations.list[oid];
  if(!N){ toast('nation '+oid+' not found'); return; }
  if(N.cells<12){ toast('nation too small: '+N.cells); return; }
  if(!NS.lore){ toast('lore module missing'); return; }
  const lore=NS.lore.buildLore(G,N,G.cities||[],P);

  // 领土剪影 canvas
  const cv=document.createElement('canvas');
  NS.lore.drawTerritoryOutline(cv,G,N);

  const body=$('loreBody');
  body.innerHTML='';
  body.appendChild(el('div',{class:'lore-shield',text:'🛡️'}));
  body.appendChild(el('h2',{class:'lore-name',text:lore.name}));
  body.appendChild(el('hr'));
  if(cv.width>0) body.appendChild(el('div',{class:'lore-map'},[cv]));
  body.appendChild(el('div',{class:'lore-fields'},[
    field('首都',lore.capitalName),
    field('区域',lore.area),
    field('统治者',lore.ruler),
    field('昵称',lore.nickname),
    field('纹章',lore.emblem),
    field('概况',lore.overview+' '+lore.capitalDesc+' '+lore.cityDesc),
  ]));
  $('loreModal').classList.add('show');
}
function field(label,value){
  return el('div',{class:'lore-row'},[
    el('span',{class:'lore-label',text:label}),
    el('span',{class:'lore-val',text:value})
  ]);
}
$('loreClose').onclick=()=>$('loreModal').classList.remove('show');

/* ---------- 键盘 ---------- */
window.addEventListener('keydown',e=>{
  if((e.metaKey||e.ctrlKey)&&e.key==='z'&&!e.shiftKey){ e.preventDefault(); undo(); }
  if((e.metaKey||e.ctrlKey)&&(e.key==='y'||(e.key==='z'&&e.shiftKey))){ e.preventDefault(); redo(); }
  if(e.key==='r'&&!e.metaKey&&!e.ctrlKey){ $('btnZoomReset').click(); }
  if(e.key==='Escape'){
    document.querySelectorAll('.modal.show').forEach(m=>m.classList.remove('show'));
    if(NS.view3d) NS.view3d.close();
  }
});

/* ---------- 本地持久化 ---------- */
function saveLocal(){
  try{ localStorage.setItem('fmap-cfg',JSON.stringify(P)); }catch(e){}
}
function loadLocal(){
  try{
    const s=localStorage.getItem('fmap-cfg');
    if(s) P=Object.assign(PL.cloneParams(PL.DEFAULTS),JSON.parse(s));
  }catch(e){}
}
function loadShareLink(){
  const u=new URL(location.href);
  const cfg=u.searchParams.get('cfg');
  if(cfg){
    try{
      P=Object.assign(PL.cloneParams(PL.DEFAULTS),JSON.parse(decodeURIComponent(atob(cfg))));
      return true;
    }catch(e){}
  }
  return false;
}

/* ---------- 启动 ---------- */
function init(){
  if(!loadShareLink()) loadLocal();
  buildPanel();
  $('btnUndo').onclick=undo;
  $('btnRedo').onclick=redo;
  window.addEventListener('resize',fitStage);
  regenerate();
}
init();

})();
