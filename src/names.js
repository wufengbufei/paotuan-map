/* =========================================================
   奇幻地图 / names — 中文地名生成器
   模板式拼接：同种子永远生成相同地名。
   类型：仙侠 / 西幻 两种文化
   ========================================================= */
(function(root){
"use strict";
const NS = root.FMAP = root.FMAP || {};
const {makeRng} = NS.core;

/* ---------- 西幻音译风 ---------- */
const FY_HEAD=['奥','格','塔','洛','萨','艾','卡','德','米','索','兰','维','瑟','法','珀','诺','塞','温','迦','赫','利','瑞','巴','鲁','泽','玛','希','凡','黎','安'];
const FY_MID=['尔','拉','德','纳','恩','斯','瑞','洛','文','姆','克','兰','顿','提','亚','林','罗',''];
const FY_TAIL=['亚','恩','斯','姆','克','顿','尔','拉','文','特','德',''];

/* ---------- 仙侠风 ---------- */
const XX_PRE=['天','玄','苍','青','白','赤','幽','紫','云','霜','雪','月','星','风','雷','雾','灵','神','古','太','九','碧','丹','瑶','沧','玉','金','银','铁','石','松','竹','桃','梧','鹤','麟','龙','凤','蛟','蜃'];
const XX_MID=['山','川','河','海','泽','原','谷','峰','岭','崖','涧','溪','泉','潭','湖','浦','洲','岛','矶','丘','陵','岗','坪','坡','坞','坪','墟','关','塞','堡','寨','亭','台','楼','阁','宫','观','寺','庵','洞','府','城','京','都','州','郡','县','乡','里','村','庄','集','镇','埠','渡','津','梁','桥'];
const XX_TOWN=['城','镇','村','庄','寨','堡','集','埠','渡','关','塞','驿','墟','里','坞'];

/* ---------- 修饰语（连体式） ---------- */
const MOD1=['雾','雪','冰','焰','星','月','影','静','龙','远','千','天','翠','灰','白','黑','苍','红','银','暗','深','古','神','圣','幽','夜','镜','铁','砂','风','雷','霜','绯','潮','朱','晓','苔','盐','鸦','钟','灯','碧','玄','冥','钢','金','晶','虹','云','蓝','萤','帆','鲸','狼','鹰'];
const MOD2=['琥珀','白银','漆黑','苍白','红莲','薄暮','黎明','静寂','忘却','追忆','终焉','无明','幽玄','长夜','极夜','白垩','群青','残照','曙光','苍冰','落阳','晚钟','暮色','冰雾','胧月','远雷','枯野','银灰','宵暗','翡翠','玛瑙','珊瑚','珍珠','水晶','黑曜','月光','星霜','风花','时雨','夕凪','玲珑','悠久','永劫','孔雀'];
const NO=['琥珀','灰烬','泪','沉眠','诅咒','骸骨','影','雾','雪','冰','星','月','血','龙','巨人','王','神','死亡','夜','黎明','薄暮','追忆','祈祷','叹息','誓言','终焉','忘却','静寂','尽头','深渊','约定','沉默','余烬','残响','初雪','白金','古血','陨王','无名者','灯','钟','荆棘','鸦','狼','沙尘','潮声','誓约','晓','封印','碎月','沉钟','末王','远雷','不归之船','未醒之梦','雨','梦','歌','光','盐','钥匙','王冠','剑','镜','玻璃','流星','篝火','狼烟','回声','月牙','初霜','蜃楼','断剑','碎冠','失传之歌','不眠之火'];
const TACHI=['巨人','王','龙','亡者','兽','贤者','巡礼者','猎人','渔人','商人','古人','流浪者','守望者','说书人','守塔人','守墓人','守钟人','石匠','织者','掘者','守灯人','摆渡人','送葬人','乐师','抄经人','观星者','药师','牧人','驯鹰人','园丁','染工','船匠','旅人','守夜人','养蜂人','烧炭人','画师'];
const PHRASE=['沉睡的','被遗忘的','被选中的','无名的','断绝的','无尽的','冰封的','焚毁的','腐朽的','被抛弃的','血染的','沉雾的','陨星的','不见天日的','渎神的','沉没的','献祭的','不归的','无声的','钟绝的','灯灭的','潮退的','影沉的','霜封的','无人生还的','弃名的','忘阳的','绝歌的','风止的','逐月的','被潮吞没的','雷劈的','苔生的','狼栖的','鸦聚的','沙埋的','落帆的','绝祷的','不醒的','被缚的','燃尽的','受诅的','被封印的','雪埋的','时停的','地图上没有的','不可言说的','霞笼的','藤蔓缠绕的','鹿游的','燕归的','数星的','月光浸的','初雪覆盖的','回声栖的','萤聚的','被浪洗的','锈覆的','风行的','雾锁的','雷鸣的','潮风吹拂的','不熄之火的'];

/* 各类型的头词 */
const HEADS={
  town:  {bare:['都','城','堡','关','津','塔','里','市','港','楼','寨','镇','集','渡','驿','墟'],
          no:['都','城','村','堡','城','塔','里','关','港','码头','市集','渡口','井','钟楼','桥','泉'],
          title:['古都','城塞','圣堂','港城','学院','塔城','商城','关城','修道院','废都','隐村','灯塔城','窑镇','盐市','丝绸里','铁匠镇','宿场','渔港','采石场','天文台']},
  state: {bare:['王国','公国','帝国','圣国','故国','领','教国','汗国','商邦','联邦','同盟','骑士团领','皇朝','列岛联盟'],
          no:['王国','领','国','帝国','圣国','王座','联邦','同盟'],
          title:['王国','公国','帝国','圣国','商邦','联邦','同盟','自由市邦','骑士团领','皇朝']},
  range: {bare:['山脉','群峰','灵峰','山岭','岭','山','峰','岳','尖峰','连山','雪岭'],
          no:['峰','山岭','岭','绝壁','山脊','脊','牙','群峰','高地','岩峰'],
          title:['连峰','山地','高地','山脉']},
  sea:   {bare:['海','大海','内海','海渊','潮','洋','海原','溟'],
          no:['海','大海','海渊','潮','海原','外海','深渊'],
          title:['海','大海','大洋']},
  seaSmall:{bare:['海','滩','潮','海峡','水道','湾'],
          no:['海','潮','滩','海峡','水道'],
          title:['海','湾']},
  lake:  {bare:['湖','泽','渊','池','泉','镜湖'],
          no:['湖','泽','渊','镜','池','泉'],
          title:['湖','大泽']},
  river: {bare:['河','川','大江','水','江'],
          no:['河','川','江','水','流'],
          title:['河','江','川']},
  isle:  {bare:['岛','群岛','列岛','屿','礁','洲'],
          no:['岛','屿','群岛','礁'],
          title:['岛','群岛','列岛']},
  desert:{bare:['沙漠','荒漠','沙海','旱原','戈壁'],
          no:['沙漠','荒漠','沙海','旱地'],
          title:['沙漠','大荒漠','戈壁']},
  forest:{bare:['森林','林','密林','林海','树海','古林'],
          no:['森林','林','密林','树海'],
          title:['大森林','密林','林海']},
  bay:   {bare:['湾','港湾','澙','澳'],
          no:['湾','港','澙'],
          title:['湾','港湾']}
};

const STATE_SUFFIX=['王国','帝国','公国','侯国','联邦','同盟','共和国','汗国','皇朝','圣国','商邦','骑士团领','自由市邦'];

function makeNamer(seed, culture){
  culture=culture||'fantasy';
  const rnd=makeRng(seed);
  const used=new Set();
  const pick=a=>a[Math.floor(rnd()*a.length)];
  const pickR=(rg,a)=>a[Math.floor(rg()*a.length)];

  function stem(){
    if(culture==='xianxia'){
      return pick(XX_PRE)+pick(XX_MID);
    }
    // 西幻音译
    let n=pick(FY_HEAD)+pick(FY_MID);
    if(rnd()<0.55) n+=pick(FY_TAIL);
    return n;
  }
  function stemR(rg){
    if(culture==='xianxia') return pickR(rg,XX_PRE)+pickR(rg,XX_MID);
    let n=pickR(rg,FY_HEAD)+pickR(rg,FY_MID);
    if(rg()<0.55) n+=pickR(rg,FY_TAIL);
    return n;
  }

  function uniq(kind){
    const H=HEADS[kind];
    const gen=()=>{
      const rg=makeRng(Math.floor(rnd()*1e9));
      const w=rg();
      if(w<0.38) return pickR(rg,MOD1)+pickR(rg,H.bare);
      if(w<0.58) return pickR(rg,MOD2)+'之'+pickR(rg,H.no);
      if(w<0.72) return pickR(rg,NO)+'之'+pickR(rg,H.no);
      if(w<0.84) return pickR(rg,TACHI)+'之'+pickR(rg,H.bare);
      if(w<0.93) return pickR(rg,PHRASE)+pickR(rg,H.no);
      return pickR(rg,H.title)+'·'+stemR(rg);
    };
    for(let g=0;g<24;g++){
      const v=gen();
      if(!used.has(v)){ used.add(v); return v; }
    }
    return gen();
  }

  function state(){
    const rg=makeRng(Math.floor(rnd()*1e9));
    const w=rg();
    let base;
    if(w<0.45) base=stemR(rg)+pickR(rg,STATE_SUFFIX);
    else if(w<0.65) base=pickR(rg,MOD1)+stemR(rg)+pickR(rg,['王国','领','国','联邦']);
    else if(w<0.82) base=pickR(rg,NO)+'之'+pickR(rg,['国','王国','领','王庭']);
    else base=pickR(rg,TACHI)+'之'+pickR(rg,['地','境','土','疆']);
    return base;
  }

  function capitalFor(stateName){
    const rg=makeRng(Math.floor(rnd()*1e9));
    const m=stateName.match(/(.+?)(王国|帝国|公国|侯国|联邦|同盟|共和国|汗国|皇朝|圣国|商邦|骑士团领|自由市邦|领|国)$/);
    const core=m?m[1]:stateName;
    if(/王国|皇朝/.test(stateName)) return '王都·'+core;
    if(/帝国/.test(stateName)) return '帝京·'+core;
    if(/圣国|教国/.test(stateName)) return '圣座·'+core;
    if(/商邦/.test(stateName)) return '商城·'+core;
    if(/骑士团/.test(stateName)) return '团堡·'+core;
    if(/故国|亡国/.test(stateName)) return '古都·'+core;
    return core+pickR(rg,['城','京','都','京邑']);
  }

  function placeName(i,traits){
    const rg=makeRng((seed^0x51a7e^(i*2654435761))>>>0);
    if(rg()<0.7){
      if(traits.cross)  return pickR(rg,['十字市','四岔镇','市集','关口'])+'·'+stemR(rg);
      if(traits.choke)  return pickR(rg,['关','隘','塞'])+pickR(rg,['',''])+stemR(rg);
      if(traits.port)   return stemR(rg)+pickR(rg,['港','津','渡','埠']);
      if(traits.desert) return stemR(rg)+pickR(rg,['井','泉','驿']);
      if(traits.snow)   return pickR(rg,['雪','霜','白','极夜'])+stemR(rg)+pickR(rg,['村','里']);
      if(traits.lake)   return stemR(rg)+pickR(rg,['浦','汀','渚','湾']);
      if(traits.forest) return stemR(rg)+pickR(rg,['林','森','麓']);
      if(traits.high)   return stemR(rg)+pickR(rg,['隘','峰','岭']);
    }
    return stemR(rg)+pickR(rg,XX_TOWN);
  }

  function wild(){
    const rg=makeRng(Math.floor(rnd()*1e9));
    return pickR(rg,TACHI)+'之'+pickR(rg,['地','野','原','境','荒原','旷野']);
  }

  function title(worldType){
    const rg=makeRng(Math.floor(rnd()*1e9));
    const names={
      world:()=>pickR(rg,NO)+'之'+pickR(rg,['世界','寰宇','四方']),
      continent:()=>stemR(rg)+pickR(rg,['大陆','之地']),
      peninsula:()=>stemR(rg)+'半岛',
      archipelago:()=>stemR(rg)+pickR(rg,['群岛','列岛']),
      island:()=>stemR(rg)+'岛',
      inland:()=>stemR(rg)+'内海',
      interior:()=>stemR(rg)+pickR(rg,['腹地','内土'])
    };
    return (names[worldType]||names.continent)();
  }

  return {
    state, capitalFor, placeName, wild, title,
    town:()=>uniq('town'),   range:()=>uniq('range'),
    sea:()=>uniq('sea'),     seaSmall:()=>uniq('seaSmall'),
    lake:()=>uniq('lake'),   river:()=>uniq('river'),
    isle:()=>uniq('isle'),   desert:()=>uniq('desert'),
    forest:()=>uniq('forest'), bay:()=>uniq('bay')
  };
}

NS.names={makeNamer,CULTURES:[
  {v:'fantasy',label:'西幻'},
  {v:'xianxia',label:'仙侠'}
]};
})(typeof self!=='undefined'?self:this);
