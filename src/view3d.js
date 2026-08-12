/* =========================================================
   奇幻地图 / view3d — 3D 立体视图（Three.js 动态加载）
   ========================================================= */
(function(root){
"use strict";
const NS = root.FMAP = root.FMAP || {};

const THREE_URL='https://cdn.jsdelivr.net/npm/three@0.169.0/build/three.module.js';
let THREE=null, loading=null;
function loadThree(){
  if(THREE) return Promise.resolve(THREE);
  if(!loading) loading=import(THREE_URL).then(m=>{THREE=m;return m;});
  return loading;
}

let renderer=null, scene=null, camera=null, controls=null;
let terrainMesh=null, animId=null;
let opts={exag:1,azim:-0.9,shadow:0.55,spin:false,labels:true,routes:true,
          borders:true,frontier:false,miniature:false,outer:true};
let curG=null, curP=null;
let labelSprites=[], wallGroup=null, routeGroup=null;

function open(G,P){
  curG=G; curP=P;
  document.getElementById('v3d').classList.add('show');
  document.getElementById('v3dTitle').textContent='《'+G.title+'》';
  busyText('正在加载 3D 引擎…');
  loadThree().then(()=>{
    buildScene();
    busy(false);
  }).catch(e=>{
    busyText('3D 引擎加载失败: '+e.message);
  });
}
function busyText(t){
  document.getElementById('v3dBusyText').textContent=t;
  busy(true);
}
function busy(on){
  document.getElementById('v3dBusy').classList.toggle('show',!!on);
}
function close(){
  document.getElementById('v3d').classList.remove('show');
  if(animId){ cancelAnimationFrame(animId); animId=null; }
}

/* 把当前 2D 地图画成贴图（无阴影无装饰） */
function drapeTexture(){
  const cv=document.createElement('canvas');
  cv.width=1024; cv.height=768;
  const c2=cv.getContext('2d');
  const p=NS.pipeline.cloneParams(curP);
  p.features.shade=false; p.features.symbols=false;
  p.features.grid=false; p.features.frame=false; p.features.compass=false;
  p.features.scalebar=false; p.features.title=false;
  p.features.labels=false; p.features.cities=false;
  NS.render.drawMap(c2,cv.width,cv.height,curG,p);
  return cv;
}

function buildScene(){
  const wrap=document.getElementById('v3dStage');
  // 清旧
  if(renderer){ wrap.querySelector('canvas')?.remove(); renderer.dispose(); }
  if(animId){ cancelAnimationFrame(animId); animId=null; }

  scene=new THREE.Scene();
  scene.background=new THREE.Color(0x0a0c12);
  const W=wrap.clientWidth||800, H=wrap.clientHeight||500;
  camera=new THREE.PerspectiveCamera(42,W/H,0.1,2000);
  camera.position.set(0,120,130);
  renderer=new THREE.WebGLRenderer({antialias:true});
  renderer.setSize(W,H);
  renderer.setPixelRatio(Math.min(devicePixelRatio,2));
  renderer.shadowMap.enabled=true;
  renderer.shadowMap.type=THREE.PCFSoftShadowMap;
  wrap.insertBefore(renderer.domElement,wrap.firstChild);

  // 灯光
  const amb=new THREE.AmbientLight(0x404860,0.55);
  scene.add(amb);
  const sun=new THREE.DirectionalLight(0xfff4e0,1.1);
  sun.castShadow=true;
  sun.shadow.mapSize.set(2048,2048);
  sun.shadow.camera.left=-90;sun.shadow.camera.right=90;
  sun.shadow.camera.top=90;sun.shadow.camera.bottom=-90;
  sun.shadow.camera.far=400;
  sun.shadow.bias=-0.0008;
  scene.add(sun);
  scene.userData.sun=sun;
  applyAzim();

  // 地形
  const G=curG, gw=G.gw, gh=G.gh;
  const WORLD=100;
  const geo=new THREE.PlaneGeometry(WORLD,WORLD*gh/gw,gw-1,gh-1);
  geo.rotateX(-Math.PI/2);
  const pos=geo.attributes.position;
  for(let i=0;i<pos.count;i++){
    const x=i%gw, y=(i/gw)|0;
    const e=G.elev[y*gw+x];
    pos.setY(i,e*WORLD*0.10);
  }
  geo.computeVertexNormals();
  const texCv=drapeTexture();
  const tex=new THREE.CanvasTexture(texCv);
  tex.colorSpace=THREE.SRGBColorSpace;
  const mat=new THREE.MeshStandardMaterial({map:tex,roughness:0.9,metalness:0.02});
  terrainMesh=new THREE.Mesh(geo,mat);
  terrainMesh.castShadow=true; terrainMesh.receiveShadow=true;
  scene.add(terrainMesh);

  // 轨道控制（简易自实现：拖拽旋转+滚轮缩放）
  setupControls(wrap,renderer.domElement);

  // 国境光壁
  buildWalls();
  buildLabels3d();

  animate();
}

function setupControls(wrap,dom){
  let drag=false,px=0,py=0,az=0.6,pol=0.75,dist=170;
  const update=()=>{
    camera.position.set(
      Math.sin(az)*Math.cos(pol)*dist,
      Math.sin(pol)*dist,
      Math.cos(az)*Math.cos(pol)*dist
    );
    camera.lookAt(0,10,0);
  };
  update();
  dom.addEventListener('pointerdown',e=>{drag=true;px=e.clientX;py=e.clientY;dom.setPointerCapture(e.pointerId);});
  dom.addEventListener('pointermove',e=>{
    if(!drag)return;
    az-=(e.clientX-px)*0.005;
    pol=Math.max(0.15,Math.min(1.4,pol+(e.clientY-py)*0.005));
    px=e.clientX;py=e.clientY;
    update();
  });
  dom.addEventListener('pointerup',()=>{drag=false;});
  dom.addEventListener('wheel',e=>{
    e.preventDefault();
    dist=Math.max(50,Math.min(400,dist*(e.deltaY>0?1.1:0.9)));
    update();
  },{passive:false});
  wrap._ctl={update,get az(){return az},set az(v){az=v},get dist(){return dist}};
}

function applyAzim(){
  const sun=scene&&scene.userData.sun;
  if(!sun)return;
  const a=opts.azim;
  sun.position.set(Math.cos(a)*80,90,Math.sin(a)*80);
  sun.intensity=1.1-opts.shadow*0.4;
}

function buildWalls(){
  if(wallGroup){ scene.remove(wallGroup); wallGroup=null; }
  if(!opts.borders||!curG.nations) return;
  wallGroup=new THREE.Group();
  const G=curG, gw=G.gw, gh=G.gh;
  const WORLD=100;
  const sx=WORLD/gw, sz=WORLD*gh/gw/gh;
  const mat=new THREE.MeshBasicMaterial({color:0xffb060,transparent:true,opacity:0.5,
    side:THREE.DoubleSide,depthWrite:false});
  for(const chain of curG.nations.wallBorders||[]){
    for(let k=0;k<chain.length-1;k++){
      const a=chain[k], b=chain[k+1];
      const ax=(a[0]-gw/2)*sx, az=(a[1]-gh/2)*sz;
      const bx=(b[0]-gw/2)*sx, bz=(b[1]-gh/2)*sz;
      const h=6;
      const g2=new THREE.PlaneGeometry(Math.hypot(bx-ax,bz-az),h);
      const m=new THREE.Mesh(g2,mat);
      m.position.set((ax+bx)/2,h/2+1.5,(az+bz)/2);
      m.rotation.y=Math.atan2(bx-ax,bz-az)+Math.PI/2;
      wallGroup.add(m);
    }
  }
  scene.add(wallGroup);
}

function buildLabels3d(){
  labelSprites.forEach(s=>scene.remove(s));
  labelSprites=[];
  if(!opts.labels) return;
  const G=curG, gw=G.gw, gh=G.gh;
  const WORLD=100;
  const sx=WORLD/gw, sz=WORLD*gh/gw/gh;
  const scale=(curP.labelScale==null?1:curP.labelScale)*0.9;
  for(const L of (G.labels||[])){
    if(L.kind!=='region'&&L.kind!=='city'&&L.kind!=='ocean') continue;
    const cv=document.createElement('canvas');
    cv.width=256; cv.height=64;
    const c2=cv.getContext('2d');
    const fs=(L.kind==='region'?34:L.kind==='city'?24:28)*scale;
    c2.font='700 '+fs+'px "Noto Serif SC",serif';
    c2.textAlign='center'; c2.textBaseline='middle';
    c2.strokeStyle='rgba(0,0,0,0.75)'; c2.lineWidth=5;
    c2.strokeText(L.text,128,32);
    c2.fillStyle=L.kind==='ocean'?'#9cc8e8':'#f2e6c8';
    c2.fillText(L.text,128,32);
    const tex=new THREE.CanvasTexture(cv);
    const sp=new THREE.Sprite(new THREE.SpriteMaterial({map:tex,transparent:true,depthTest:false}));
    const x=(L.x-gw/2)*sx, z=(L.y-gh/2)*sz;
    const gi=Math.min(gw*gh-1,Math.max(0,(Math.floor(L.y)*gw+Math.floor(L.x))|0));
    const y=G.elev[gi]*WORLD*0.10*opts.exag+6;
    sp.position.set(x,y,z);
    sp.scale.set(20*scale,5*scale,1);
    scene.add(sp);
    labelSprites.push(sp);
  }
}

let spinT=0;
function animate(){
  animId=requestAnimationFrame(animate);
  if(opts.spin&&wrap3d()){
    const c=wrap3d()._ctl;
    if(c){ c.az+=0.003; c.update(); }
  }
  if(renderer&&scene&&camera) renderer.render(scene,camera);
}
function wrap3d(){ return document.getElementById('v3dStage'); }

/* 外部控制 */
function setOpt(k,v){
  opts[k]=v;
  if(k==='exag'&&terrainMesh){
    terrainMesh.scale.y=v;
    buildLabels3d();
  }
  if(k==='azim'||k==='shadow') applyAzim();
  if(k==='labels') buildLabels3d();
  if(k==='borders') buildWalls();
}
function savePNG(){
  if(!renderer)return;
  renderer.render(scene,camera);
  renderer.domElement.toBlob(b=>{
    NS.exporters.download('3D-'+curP.seed+'.png',b);
  },'image/png');
}

NS.view3d={open,close,setOpt,savePNG,opts};
})(typeof self!=='undefined'?self:this);
