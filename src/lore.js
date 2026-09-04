/* =========================================================
   跑团地图 / lore — 国家档案生成器
   点击地图上的国家领土时弹出羊皮纸详情卡片
   ========================================================= */
(function(root){
"use strict";
const NS = root.FMAP = root.FMAP || {};
const C = NS.core;
const {clamp, makeRng} = C;

/* 称呼模板 */
const TITLES=[
  ['国王','女王'],['皇帝','女皇'],['大公','女大公'],['苏丹','苏丹娜'],
  ['可汗','可敦'],['亲王','王妃'],['大统领',''],['教宗',''],
  ['领主','女领主'],['酋长','女酋长'],['摄政王','摄政太后']
];
const NICK_PATTERNS=[
  (r,p)=>pick(r,p,'','')+'之'+pick(r,p,'',''),
  (r,p)=>pick(r,p,'','')+'的'+pick(r,p,'',''),
  (r,p)=>pick(r,p,'','')+'者',
  (r,p)=>'永'+pick(r,p,'','')+'的'+pick(r,p,'',''),
  (r,p)=>pick(r,p,'','')+'的守护者',
  (r,p)=>pick(r,p,'','')+'的主人',
  (r,p)=>pick(r,p,'','')+'上的'+pick(r,p,'',''),
];
const NICK_A=['燃烧','冰霜','雷霆','暗影','黎明','黄昏','星辰','月光',
  '风暴','深渊','黄金','白银','钢铁','翡翠','琥珀','水晶',
  '赤红','苍蓝','墨绿','紫晶','炎阳','寒月','旋风','磐石'];
const NICK_B=['塔','王座','冠冕','火焰','旗帜','剑','盾','矛',
  '龙','狼','鹰','狮','蛇','鲸','鹿','鸦',
  '城堡','高塔','圣殿','要塞','荒野','海洋','山峰','深渊',
  '光芒','长夜','暴风','雷霆','星辰','命运','誓言','契约'];

const EMBLEM_COLORS=['深蓝','暗红','翠绿','墨黑','银灰','金黄','紫罗兰','靛青','赭红','月白'];
const EMBLEM_SHAPES=['盾形','菱形','圆形','十字形','三角形','八边形'];
const EMBLEM_CHARGES=[
  '一只展翅的雄鹰','一头咆哮的雄狮','一条盘绕的龙','一匹奔腾的骏马',
  '一把交叉的剑与权杖','一株开花的树','一颗燃烧的星','一艘扬帆的船',
  '一座三塔城堡','一轮弯月与星辰','一柄闪电','一条蜿蜒的蛇',
  '一只握剑的手臂','一把竖琴','一顶王冠','一本翻开的书',
  '两道交叉的闪电','一头站立的熊','一只飞行的天鹅','一棵橡树',
];

function pick(rnd,a,b,c){
  const arr=rnd()<0.5?a:b;
  return arr[Math.floor(rnd()*arr.length)];
}

/* 地势描述 */
function terrainDesc(G,N){
  const bios=G.biome, own=G.nations.owner, gw=G.gw, gh=G.gh;
  let coastal=0, mountain=0, forest=0, desert=0, plains=0, total=0;
  for(let i=0;i<own.length;i++){
    if(own[i]!==N.id||bios[i]<5) continue;
    total++;
    const b=bios[i];
    if(b===6) desert++;
    else if(b===12||b===13||b===14) forest++;
    else if(b===16||b===17) mountain++;
    else if(b===7||b===8||b===9||b===10) plains++;
    // coast check
    const x=i%gw, y=(i/gw)|0;
    for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
      if(x+dx<0||x+dx>=gw||y+dy<0||y+dy>=gh)continue;
      if(bios[(y+dy)*gw+x+dx]<=2){coastal++; break;}
    }
  }
  if(total===0) return '这是一片荒芜之地。';
  const parts=[];
  if(coastal/total>0.3) parts.push('海岸线崎岖不平');
  else if(coastal/total>0.15) parts.push('拥有几处天然良港');
  if(mountain/total>0.25) parts.push('崇山峻岭横亘其间');
  if(forest/total>0.3) parts.push('茂密的森林覆盖着大部分国土');
  if(desert/total>0.2) parts.push('广袤的沙漠占据了内陆');
  if(plains/total>0.4) parts.push('辽阔的平原适合农耕与放牧');
  if(parts.length===0) parts.push('地势平缓，水土丰饶');
  return parts.join('，')+'。';
}

/* 河流描述 */
function riverDesc(G,N){
  const rivers=G.rivers||[];
  let count=0;
  for(const r of rivers){
    for(const p of r){
      const x=Math.floor(p[0]), y=Math.floor(p[1]);
      if(x<0||y<0||x>=G.gw||y>=G.gh)continue;
      if(G.nations.owner[y*G.gw+x]===N.id){count++; break;}
    }
  }
  if(count===0) return '';
  if(count===1) return '一条大河蜿蜒穿过这片土地。';
  if(count===2) return '两条河流滋养着这片土地。';
  return `${count}条河流在这片土地上交汇。`;
}

/* 邻国描述（支持名字覆盖联动） */
function neighborDesc(G,N,overrides){
  const nations=G.nations;
  const own=nations.owner, bios=G.biome, gw=G.gw, gh=G.gh;
  const seen=new Set();
  for(let y=0;y<gh;y++)for(let x=0;x<gw;x++){
    const i=y*gw+x;
    if(own[i]!==N.id) continue;
    for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
      const nx=x+dx, ny=y+dy;
      if(nx<0||nx>=gw||ny<0||ny>=gh)continue;
      const j=ny*gw+nx;
      if(own[j]>=0&&own[j]!==N.id) seen.add(own[j]);
    }
  }
  const neighbors=[];
  for(const id of seen){
    const n=nations.list[id];
    if(n) neighbors.push(nameOf(n,overrides));
  }
  if(neighbors.length===0) return '';
  if(neighbors.length===1) return `它与${neighbors[0]}接壤。`;
  return `它与${neighbors.slice(0,2).join('、')}${neighbors.length>2?'等邻国':''}接壤。`;
}

/* 取国家显示名：优先用用户编辑后的名字 */
function nameOf(N,overrides){
  const sid=N.stableId||('n'+N.id);
  return (overrides&&overrides[sid])?overrides[sid]:N.name;
}

/* 面积 */
function areaStr(G,N){
  const kmPerCell = (C.TYPE_KM[G.worldType]||3000) / G.gw;
  const areaKm2 = Math.round(N.cells * kmPerCell * kmPerCell * 0.75);
  if(areaKm2>10000) return `约${Math.round(areaKm2/10000)}万平方公里`;
  return `约${areaKm2.toLocaleString()}平方公里`;
}

/* 首都位置描述 */
function capitalDesc(G,N,cities){
  const cap=cities.find(c=>c.region===N.id&&c.type==='capital');
  if(!cap) return '首都位置不详。';
  const parts=[];
  if(cap.coastal) parts.push('位于海岸线上');
  else if(cap.mouth) parts.push('坐落在一处河口');
  const bios=G.biome;
  const i=cap.i;
  const biomeNames=['深海','海上','浅海','湖边','河边','沙滩','沙漠','草原','稀树草原',
    '平原','灌丛','湿地','森林','雨林','针叶林','苔原','岩山','雪山','冰原'];
  if(i>=0&&i<bios.length&&bios[i]>=5) parts.push(`地处${biomeNames[bios[i]]||'内陆'}之中`);
  if(cap.mouth) parts.push('位于一条主要河流的入海口');
  if(parts.length===0) parts.push('坐落在国土腹地');
  return '首都'+cap.name+'，'+parts[0]+'。';
}

/* 城市与道路描述 */
function cityRoadDesc(G,N,cities){
  const myCities=cities.filter(c=>c.region===N.id);
  const junctionCities=myCities.filter(c=>c.cross);
  if(junctionCities.length) return '集市在道路交汇的十字路口举行。';
  const roadCities=myCities.filter(c=>c.choke);
  if(roadCities.length) return '商队在隘口与关隘之间往来。';
  const portCities=myCities.filter(c=>c.coastal||c.type==='port');
  if(portCities.length) return '港口城市是海上贸易的枢纽。';
  return '城镇由道路网络相连。';
}

/* 生成国家档案 */
function buildLore(G,N,cities,P,overrides){
  const rnd=makeRng((P.seed^0x10a3b^(N.id*2654435761))>>>0);
  const seedName=nameOf(N,overrides);

  // 统治者
  const titlePair=TITLES[Math.floor(rnd()*TITLES.length)];
  const rulerGender=rnd()<0.65?0:1;
  const title=titlePair[rulerGender]||titlePair[0];
  const rulerName=genRulerName(rnd,rulerGender,seedName);
  let rulerLine=`${rulerName}${title}`;
  // 偶尔加背景
  if(rnd()<0.4){
    const reasons=[
      `前任${title}的${rulerGender?'丈夫':'妻子'}；${rulerGender?'她':'他'}代替年幼的继承人执政`,
      `通过联姻继承了王位`,
      `在一次宫廷政变中夺取了权力`,
      `是开国${title}的后裔`,
      `由贵族议会推举上任`,
      `在内战后统一了全国`,
      `从海外流亡归来后复位`,
    ];
    rulerLine+='（'+reasons[Math.floor(rnd()*reasons.length)]+'）';
  }

  // 昵称
  const nick=R(rnd,NICK_PATTERNS,NICK_A,NICK_B);

  // 纹章
  const emblemColor=EMBLEM_COLORS[Math.floor(rnd()*EMBLEM_COLORS.length)];
  const emblemShape=EMBLEM_SHAPES[Math.floor(rnd()*EMBLEM_SHAPES.length)];
  const emblemCharge=EMBLEM_CHARGES[Math.floor(rnd()*EMBLEM_CHARGES.length)];
  const emblem=`${emblemShape}，以${emblemColor}为底，上绘${emblemCharge}。`;

  // 概述
  const tDesc=terrainDesc(G,N);
  const rDesc=riverDesc(G,N);
  const nDesc=neighborDesc(G,N,overrides);
  const overview=[tDesc,rDesc,nDesc].filter(Boolean).join('');

  return {
    name:seedName,
    ruler:rulerLine,
    nickname:nick,
    emblem,
    overview,
    capitalName:(cities.find(c=>c.region===N.id&&c.type==='capital')||{}).name||'—',
    area:areaStr(G,N),
    capitalDesc:capitalDesc(G,N,cities),
    cityDesc:cityRoadDesc(G,N,cities),
  };
}

/* 统治者姓名生成 */
function genRulerName(rnd,fem,seedName){
  const A=['奥','格','塔','洛','萨','艾','卡','德','米','索','兰','维','瑟','法',
    '珀','诺','塞','温','迦','赫','利','瑞','巴','鲁','泽','玛','希','凡','黎'];
  const B=['尔','拉','德','纳','恩','斯','瑞','洛','文','姆','克','顿','提'];
  const CF=['娅','娜','莎','琳','丝','莉','蒂','妮','芙','萝'];
  const CM=['恩','斯','尔','克','顿','特','德','姆','洛','文'];
  let n=A[Math.floor(rnd()*A.length)]+B[Math.floor(rnd()*B.length)];
  if(rnd()<0.6) n+=B[Math.floor(rnd()*B.length)];
  n+=(fem?CF:CM)[Math.floor(rnd()*(fem?CF:CM).length)];
  return n;
}

function R(rnd,patterns,A,B){
  const p=patterns[Math.floor(rnd()*patterns.length)];
  return p(rnd,A,B);
}

/* 绘制领土剪影 */
function drawTerritoryOutline(cv,G,N){
  const gw=G.gw, gh=G.gh;
  const owner=G.nations.owner;
  const bios=G.biome;
  const B=NS.biome.BIOME;
  const isLand=i=>bios[i]>=NS.biome.LAND_MIN||bios[i]===B.RIVER;

  // 找到领土边界盒
  let minX=gw,maxX=0,minY=gh,maxY=0;
  for(let i=0;i<owner.length;i++){
    if(owner[i]!==N.id||!isLand(i))continue;
    const x=i%gw, y=(i/gw)|0;
    if(x<minX)minX=x; if(x>maxX)maxX=x;
    if(y<minY)minY=y; if(y>maxY)maxY=y;
  }
  if(minX>maxX) return;
  // 扩展边距
  const pad=8;
  minX=Math.max(0,minX-pad); maxX=Math.min(gw-1,maxX+pad);
  minY=Math.max(0,minY-pad); maxY=Math.min(gh-1,maxY+pad);

  const bw=maxX-minX+1, bh=maxY-minY+1;
  const scale=Math.min(200/bw,160/bh);
  const w=Math.round(bw*scale), h=Math.round(bh*scale);
  cv.width=w; cv.height=h;
  const ctx=cv.getContext('2d');
  ctx.fillStyle='rgba(60,40,20,.12)';
  ctx.fillRect(0,0,w,h);

  // 画领土填充
  for(let y=minY;y<=maxY;y++){
    for(let x=minX;x<=maxX;x++){
      const i=y*gw+x;
      if(owner[i]===N.id&&isLand(i)){
        ctx.fillStyle='rgba(80,55,30,.7)';
        ctx.fillRect((x-minX)*scale,(y-minY)*scale,scale,scale);
      }
    }
  }

  // 找首都
  const cap=(G.cities||[]).find(c=>c.region===N.id&&c.type==='capital');
  if(cap){
    const px=(cap.x-minX)*scale, py=(cap.y-minY)*scale;
    ctx.fillStyle='#c04030'; ctx.strokeStyle='#fff'; ctx.lineWidth=1.5;
    ctx.beginPath(); ctx.arc(px,py,3.5,0,Math.PI*2);
    ctx.fill(); ctx.stroke();
  }
}

NS.lore={buildLore,drawTerritoryOutline};

/* =========================================================
   海域档案：点击海洋/湖泊/河流时生成
   ========================================================= */
const SEA_PREFIX=['碧','沧','玄','银','青','蔚','深','渊','霜','曜','汐','冥','澄','烟'];
const SEA_MID=['涛','澜','波','潮','溟','流','湾','泽','浪','漪','泓','汐'];
const SEA_SUFFIX=['海','洋','之海','内海','湾','海峡','海域'];

function buildSeaLore(G,gi,P,overrides){
  const {gw,gh,biome,elev,sea}=G;
  const B=NS.biome.BIOME;
  const isWater=i=>biome[i]<NS.biome.LAND_MIN;
  if(!isWater(gi)) return null;
  const vis=new Uint8Array(gw*gh);
  const stack=[gi]; vis[gi]=1;
  let n=0,sumDepth=0,maxDepth=0;
  let minX=gw,maxX=-1,minY=gh,maxY=-1;
  let sumX=0,sumY=0;
  const coastNations=new Set();
  let riverCount=0,lakeCount=0;
  const owner=G.nations?G.nations.owner:null;
  while(stack.length){
    const i=stack.pop(); n++;
    const x=i%gw,y=(i/gw)|0;
    if(x<minX)minX=x; if(x>maxX)maxX=x;
    if(y<minY)minY=y; if(y>maxY)maxY=y;
    sumX+=x; sumY+=y;
    const d=Math.max(0,sea-elev[i]); sumDepth+=d; if(d>maxDepth)maxDepth=d;
    const bb=biome[i];
    if(bb===B.RIVER)riverCount++;
    else if(bb===B.LAKE)lakeCount++;
    const dirs=[[1,0],[-1,0],[0,1],[0,-1]];
    for(let k=0;k<4;k++){
      const nx=x+dirs[k][0],ny=y+dirs[k][1];
      if(nx<0||nx>=gw||ny<0||ny>=gh)continue;
      const j=ny*gw+nx;
      if(!isWater(j)){
        if(owner&&owner[j]>=0) coastNations.add(owner[j]);
      } else if(!vis[j]){ vis[j]=1; stack.push(j); }
    }
  }
  if(n===0) return null;
  const cx=sumX/n, cy=sumY/n;
  const touchesEdge=minX<=0||maxX>=gw-1||minY<=0||maxY>=gh-1;
  let kind;
  if(riverCount>n*0.5) kind='river';
  else if(lakeCount>n*0.5) kind='lake';
  else if(touchesEdge) kind='ocean';
  else kind='sea';

  const rnd=makeRng((P.seed ^ (Math.round(cx)*7919) ^ (Math.round(cy)*104729))>>>0);
  let name=SEA_PREFIX[(rnd()*SEA_PREFIX.length)|0]+SEA_MID[(rnd()*SEA_MID.length)|0];
  if(rnd()<0.62) name+=SEA_SUFFIX[(rnd()*SEA_SUFFIX.length)|0];

  const kmPerCell=(C.TYPE_KM[G.worldType]||3000)/gw;
  const areaKm2=n*kmPerCell*kmPerCell;
  const avgD=sumDepth/n, maxD=maxDepth;
  const avgMeters=Math.round(avgD/sea*4000);
  const maxMeters=Math.round(maxD/sea*6000);
  const areaStr=areaKm2>10000?('约'+(areaKm2/10000).toFixed(1)+'万平方公里'):('约'+Math.round(areaKm2)+'平方公里');

  const nationsList=G.nations?G.nations.list:[];
  const coastNames=[...coastNations].map(id=>nationsList[id]?nameOf(nationsList[id],overrides):null).filter(Boolean);

  const parts=[];
  if(kind==='ocean') parts.push('一望无际的外海，是世界航路所经之处');
  else if(kind==='sea') parts.push('四面几乎被陆地环抱的内海');
  else if(kind==='lake') parts.push('大陆深处的一泓湖泊');
  else parts.push('蜿蜒流淌的河流水系');
  if(avgMeters>0) parts.push('平均水深约'+avgMeters+'米');
  if(maxMeters>0) parts.push('最深处可达'+maxMeters+'米');
  if(coastNames.length) parts.push('沿岸与'+coastNames.slice(0,3).join('、')+(coastNames.length>3?'等':'')+'相接');
  const overview=parts.join('，')+'。';

  return {
    name, kind,
    area:areaStr,
    depth:'平均约'+avgMeters+'米，最深约'+maxMeters+'米',
    overview,
    coast:coastNames.length?coastNames.slice(0,4).join('、'):'—',
    cx:Math.round(cx), cy:Math.round(cy),
  };
}

NS.lore.buildSeaLore=buildSeaLore;
})(typeof self!=='undefined'?self:this);
