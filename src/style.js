/* =========================================================
   跑团地图 / style — 3种样式
   ========================================================= */
(function(root){
"use strict";
const NS = root.FMAP = root.FMAP || {};

const PAL_REAL=[
  [38,72,100],[56,102,134],[104,152,175],[86,140,170],[96,152,186],
  [226,212,170],[228,208,152],[208,200,142],[201,189,118],[158,187,112],[176,185,120],
  [120,152,118],[96,142,90],[56,110,72],[74,118,98],[170,174,152],[150,140,124],
  [242,244,242],[228,236,240]
];
const PAL_ANTIQUE=[
  [204,187,148],[212,196,158],[223,207,169],[203,195,165],[196,188,156],
  [228,214,178],[222,206,160],[214,198,148],[208,190,138],[200,180,132],[196,176,128],
  [186,172,132],[176,153,104],[156,132,86],[166,146,104],[212,200,172],[150,128,92],
  [232,224,204],[228,222,206]
];
const PAL_BW=[
  [220,220,220],[230,230,230],[240,240,240],[235,235,235],[225,225,225],
  [250,250,249],[230,228,224],[210,208,204],[190,188,184],[170,170,168],[160,160,158],
  [140,140,140],[120,120,120],[100,100,100],[110,110,110],[185,185,182],[140,138,134],
  [255,255,255],[245,245,245]
];

const hex=c=>'#'+c.map(v=>Math.max(0,Math.min(255,v|0)).toString(16).padStart(2,'0')).join('');
const rgba=(c,a)=>`rgba(${c[0]|0},${c[1]|0},${c[2]|0},${a})`;

const STYLES={
  realistic:{
    id:'realistic', label:'全彩', base:'raster', pal:PAL_REAL,
    ice:{col:[232,241,247],a:0.92,dot:'rgba(222,236,244,.85)'},
    paper:[30,46,60], shade:true, texture:'ground', haze:true, vignette:'cool',
    coast:{color:'#2b3d49',width:1.4}, lakeEdge:{color:'#3f6b86',width:1.0},
    river:{color:'#6aa6c8',width:2.6,dark:'#3f7ea3'},
    border:{color:'rgba(60,30,20,.55)',dash:[7,5],width:1.6,fill:0.10},
    ink:'#2b2218',
    textStyle:{fill:'#1b2b36',halo:'rgba(255,255,255,.80)',
               water:'#e3eef6',waterHalo:'rgba(8,26,40,.62)'},
    frame:{color:'#cbd8e0',accent:'#e2c48d'}
  },
  antique:{
    id:'antique', label:'羊皮纸', base:'raster', pal:PAL_ANTIQUE,
    ice:{col:[233,225,203],a:0.80,dot:'rgba(120,100,64,.38)'},
    paper:[223,207,169], shade:true, texture:'grain', haze:false, vignette:'warm',
    coast:{color:'rgba(90,72,42,.92)',width:2.0,halo:'rgba(120,100,64,.32)',haloWidth:7},
    lakeEdge:{color:'rgba(90,72,42,.85)',width:1.4},
    river:{color:'#93805f',width:2.3,dark:'#79684a'},
    border:{color:'rgba(120,60,40,.7)',dash:[8,4,2,4],width:1.7,fill:0.12,
            nationS:0.26,nationL:0.56},
    ink:'#4a3a20', textStyle:{fill:'#4a3a20',halo:'rgba(238,228,200,.80)'},
    frame:{color:'#5a482a',accent:'#a8854f'}
  },
  blank:{
    id:'blank', label:'黑白', base:'raster', pal:PAL_BW,
    ice:{col:[240,240,240],a:0.3,dot:'rgba(0,0,0,.15)'},
    paper:[252,252,250], shade:false, texture:'none', haze:false, vignette:'none',
    coast:{color:'#000',width:2.0}, lakeEdge:{color:'#000',width:1.3},
    river:{color:'#000',width:1.5,dark:'#000'},
    border:{color:'rgba(0,0,0,.8)',dash:[4,4],width:1.5,fill:0},
    ink:'#000', textStyle:{fill:'#000',halo:'rgba(255,255,255,.95)'},
    frame:{color:'#000',accent:'#000'}
  }
};
const STYLE_LIST=['realistic','antique','blank'];

function get(id){ return STYLES[id]||STYLES.realistic; }
function paper(id){ return hex(get(id).paper); }

NS.style={STYLES,STYLE_LIST,get,paper,hex,rgba,
          PAL_REAL,PAL_ANTIQUE};
})(typeof self!=='undefined'?self:this);
