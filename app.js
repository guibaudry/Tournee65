
const DATA=window.__D;

// ---- aplatissement global ----
const RELRX=/RELEVAGE|BO[IÎ]TE JAUNE|LA POSTE|AGENCE POSTALE|COFFRE/i;
const GITEMS=[];
DATA.forEach((d,ci)=>{
  let si=0;
  d.items.forEach(it=>{
    if(it.r)GITEMS.push({t:"street",r:it.r,com:d.v});
    else if(it.i)GITEMS.push({t:"instr",i:it.i,d:it.d});
    else{
      const s={t:"stop",c:it.c,n:it.n,tx:it.t,x:it.x,g:it.g||[],b:it.b,com:d.v,key:ci+":"+(si++)};
      s.rel=RELRX.test((it.t||"")+" "+(it.x||""));
      GITEMS.push(s);
    }
  });
});
const ALLSTOPS=GITEMS.filter(g=>g.t==="stop");
const STOPBYKEY={};ALLSTOPS.forEach(s=>STOPBYKEY[s.key]=s);

// ---- structure fixe : 1 page par rue ----
function buildFull(){
  const fp=[];let curStreet="",curCom="";let pending=[];
  GITEMS.forEach(g=>{
    if(g.t==="street"){curStreet=g.r;curCom=g.com;return}
    if(g.t==="instr"){pending.push({i:g.i,d:g.d});return}
    let pg=fp[fp.length-1];
    if(!pg||pg.street!==curStreet||pg.com!==curCom){
      pg={com:curCom,street:curStreet,pre:pending,rows:[]};fp.push(pg);
    }else if(pending.length){
      pending.forEach(p=>pg.rows.push({instr:p.i,d:p.d}));
    }
    pg.rows.push(g);pending=[];
  });
  if(pending.length&&fp.length)fp[fp.length-1].after=pending;
  return fp;
}
const FULL=buildFull();
// clé -> rue (page FULL) pour la recherche adresse
const KEY2STREET={};FULL.forEach(p=>p.rows.forEach(r=>{if(r.key)KEY2STREET[r.key]={street:p.street,com:p.com}}));

// ---- état ----
const MODES={
  monleon:{lab:"MONLÉON fort",col:"var(--blue)",desc:"Tout Monléon · ailleurs : 📰 dépêches + ✉️📦 du jour + 📥 relevages"},
  autres:{lab:"AUTRES fort",col:"var(--orange)",desc:"Arné·Bazordan·Lassales·Gaussan à fond · Monléon : 📰 + ✉️📦 + 📥"},
  tout:{lab:"Complète",col:"var(--sub)",desc:"Toutes les boîtes partout"}
};
let S={mode:"tout",idx:{},colis:{},prio:{},done:{},priv:false};
try{S=Object.assign(S,JSON.parse(localStorage.getItem("jourState")||"{}"))}catch(e){}
function save(){try{localStorage.setItem("jourState",JSON.stringify(S))}catch(e){}}
const IDX=()=>S.idx[S.mode]||0;

function isDep(s){return s.g.includes("DEP")}
function courrierToday(s){
  if(S.mode==="tout")return true;
  if(S.mode==="monleon")return s.com==="MONLÉON";
  return s.com!=="MONLÉON";
}
function activeStop(s){return courrierToday(s)||isDep(s)||s.rel||S.colis[s.key]||S.prio[s.key]}

// ---- pages du jour ----
function buildPages(){
  const out=[];let travel=[],chain=[];
  FULL.forEach(pg=>{
    const rows=[];let hasStop=false;
    pg.rows.forEach(r=>{
      if(r.instr){rows.push(r);return}
      if(activeStop(r)){rows.push(r);hasStop=true}
    });
    if(hasStop){
      out.push({com:pg.com,street:pg.street,rows,pre:chain.concat(pg.pre),travel});
      travel=[];chain=[];
      if(pg.after)chain=chain.concat(pg.after);
    }else{
      travel.push(pg.street);
      chain=chain.concat(pg.pre);
      pg.rows.forEach(r=>{if(r.instr)chain.push({i:r.instr,d:r.d})});
      if(pg.after)chain=chain.concat(pg.after);
    }
  });
  if(travel.length)out.push({com:"FIN",street:"Retour",rows:[],pre:chain,travel});
  return out;
}
let PAGES=buildPages();

const $=id=>document.getElementById(id);
function esc(s){return (s||"").replace(/&/g,"&amp;").replace(/</g,"&lt;")}
function preHtml(pg,withLab){
  let parts=[];
  if(pg.travel&&pg.travel.length)parts.push('<span class="trav">🚗 Traverser : '+esc(pg.travel.join(" → "))+'</span>');
  if(pg.pre&&pg.pre.length)parts.push(esc(pg.pre.map(p=>"➜ "+p.i).join(" · ")));
  if(!parts.length)return "";
  return (withLab?'<span class="lab">POUR Y ALLER : </span>':'')+parts.join("<br>");
}

function render(){
  const i=IDX();
  if(i>=PAGES.length){showDone();return}
  $("doneScreen").style.display="none";
  const pg=PAGES[i],m=MODES[S.mode];
  $("modeChip").textContent=(S.mode==="monleon"?"🔵":S.mode==="autres"?"🟠":"⚪")+" "+m.lab;
  $("modeChip").style.background=m.col;
  $("hCount").textContent=(i+1)+" / "+PAGES.length;
  document.querySelector("#pbar>div").style.width=(100*i/PAGES.length)+"%";
  const ph=preHtml(pg,true);
  const pre=$("pre");pre.classList.remove("exp");
  if(ph){pre.classList.remove("hidden");pre.innerHTML=ph}
  else{pre.classList.add("hidden");pre.textContent="–"}
  $("streetCom").textContent=pg.com;
  $("streetName").textContent="📍 "+pg.street;
  const L=$("list");L.innerHTML="";
  if(!pg.rows.length){
    L.innerHTML='<div class="emptyMsg">🚗 Rien à déposer<br>traverser et continuer</div>';
  }
  pg.rows.forEach(r=>{
    if(r.instr){
      const e=document.createElement("div");
      e.className="instrRow"+(r.d?" dgr":"");
      e.textContent="➜ "+r.instr;
      L.appendChild(e);return;
    }
    const e=document.createElement("div");
    const dn=!!S.done[r.key];
    e.className="row"+(dn?" done":"")+(r.rel?" rel":"");
    const cls=r.c==="D"?"":r.c==="G"?"G":"X";
    const side=r.c==="D"?"DROITE":r.c==="G"?"GAUCHE":r.c==="F"?"FACE":"";
    let why=[];
    if(r.rel)why.push('<span class="rl">📥 RELEVAGE OBLIGATOIRE</span>');
    if(!courrierToday(r)&&!r.rel&&isDep(r))why.push("📰 dépêche");
    if(S.colis[r.key])why.push("<b>📦 COLIS</b>");
    if(S.prio[r.key])why.push("<b>✉️ PRIORITAIRE</b>");
    if(r.g.includes("SP"))why.push("⛔ pub");
    if(r.x)why.push(esc(r.x));
    let ic="";
    if(r.g.includes("CHIEN"))ic+="🐕";
    if(r.rel)ic+="📥";
    if(S.colis[r.key])ic+="📦";
    if(S.prio[r.key])ic+="✉️";
    e.innerHTML='<div class="bdg '+cls+'">'+esc(r.n||"–")+'<small>'+side+'</small></div>'+
      '<div class="mid"><div class="nm">'+esc(r.tx)+'</div>'+
      (why.length?'<div class="why">'+why.join(" · ")+'</div>':'')+'</div>'+
      (ic?'<div class="ic">'+ic+'</div>':'');
    e.onclick=()=>{if(didPeek)return;S.done[r.key]=!S.done[r.key];if(!S.done[r.key])delete S.done[r.key];save();render()};
    L.appendChild(e);
  });
  const nx=PAGES[i+1],post=$("post");post.classList.remove("exp");
  if(nx){
    const dgr=(nx.pre||[]).some(p=>p.d);
    const h=preHtml(nx,false);
    post.className=h?(dgr?"danger":""):"calm";
    post.innerHTML='<span class="lab">'+(h?"⚠ ENSUITE : ":"Puis : ")+'</span>'+(h?h+"<br>":"")+"📍 "+esc(nx.street)+" ("+esc(nx.com)+")";
  }else{post.className="calm";post.textContent="Dernière rue de la journée 🏁"}
}
$("pre").onclick=()=>$("pre").classList.toggle("exp");
$("post").onclick=()=>$("post").classList.toggle("exp");
function showDone(){
  $("doneScreen").style.display="flex";
  $("doneSub").textContent=MODES[S.mode].lab+" — "+PAGES.length+" rues";
}
$("valid").onclick=()=>{if(navigator.vibrate)navigator.vibrate(15);S.idx[S.mode]=IDX()+1;save();render()};
$("backBtn").onclick=()=>{if(IDX()>0){S.idx[S.mode]=IDX()-1;save();render()}};
$("redoDay").onclick=()=>{S.idx[S.mode]=0;save();render()};
$("doneMenu").onclick=()=>{$("doneScreen").style.display="none";openMenu()};

// ---- menu ----
function openMenu(){
  const ML=$("modeList");ML.innerHTML="";
  Object.keys(MODES).forEach(k=>{
    const m=MODES[k],b=document.createElement("button");
    b.className="mBtn"+(k===S.mode?" cur":"");
    b.innerHTML='<div class="dot" style="background:'+m.col+'"></div><span>'+m.lab+'<br><small>'+m.desc+'</small></span>';
    b.onclick=()=>{S.mode=k;PAGES=buildPages();if(IDX()>=PAGES.length)S.idx[S.mode]=0;save();$("menu").style.display="none";render()};
    ML.appendChild(b);
  });
  $("colisCount").textContent=Object.keys(S.colis).length+" 📦 · "+Object.keys(S.prio).length+" ✉️";
  const JL=$("jumpList");JL.innerHTML="";
  DATA.forEach(d=>{
    const first=PAGES.findIndex(p=>p.com===d.v);
    if(first<0)return;
    const b=document.createElement("button");
    b.className="mBtn";b.innerHTML="<span>"+d.v+"</span><small>rue "+(first+1)+"</small>";
    b.onclick=()=>{S.idx[S.mode]=first;save();$("menu").style.display="none";render()};
    JL.appendChild(b);
  });
  $("wakeNote").textContent=wakeOK?"🔒 Veille bloquée : l'écran restera allumé.":"🔒 Blocage de veille non actif (nécessite Safari/app plein écran, iOS 16.4+).";
  $("menu").style.display="flex";
}
$("menuBtn").onclick=openMenu;
$("modeChip").onclick=openMenu;
$("closeMenu").onclick=()=>$("menu").style.display="none";
$("resetDay").onclick=()=>{if(confirm("Recommencer la journée ?")){S.idx[S.mode]=0;S.done={};save();$("menu").style.display="none";render()}};

// ---- checklist dépôts du jour ----
let dCom=0;
function norm(s){return (s||"").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g,"")}
function renderDepots(){
  $("dSummary").textContent="Aujourd'hui : "+Object.keys(S.colis).length+" 📦 · "+Object.keys(S.prio).length+" ✉️";
  const C=$("dChips");C.innerHTML="";
  DATA.forEach((d,i)=>{
    const b=document.createElement("button");
    b.className="comChip"+(i===dCom?" on":"");
    b.textContent=d.v;
    b.onclick=()=>{dCom=i;renderDepots()};
    C.appendChild(b);
  });
  const qq=norm($("dSearch").value.trim());
  const L=$("dList");L.innerHTML="";
  const src=qq?FULL:FULL.filter(p=>p.com===DATA[dCom].v);
  src.forEach(p=>{
    const rows=p.rows.filter(r=>!r.instr&&(!qq||norm(r.tx).includes(qq)||norm(r.n).includes(qq)||norm(p.street).includes(qq)));
    if(!rows.length)return;
    const h=document.createElement("div");h.className="stHead";
    h.textContent="📍 "+p.street+(qq?" · "+p.com:"");
    L.appendChild(h);
    rows.forEach(r=>{
      const selC=!!S.colis[r.key],selP=!!S.prio[r.key];
      const e=document.createElement("div");e.className="cRow";
      const cls=r.c==="D"?"":r.c==="G"?"G":"X";
      e.innerHTML='<div class="cBdg '+cls+'">'+esc(r.n||"–")+'</div>'+
        '<div class="cInfo"><div class="cNm">'+esc(r.tx)+'</div></div>'+
        '<button class="tgl'+(selC?" on":"")+'" data-k="c">📦</button>'+
        '<button class="tgl'+(selP?" on":"")+'" data-k="p">✉️</button>';
      e.querySelector('[data-k=c]').onclick=ev=>{ev.stopPropagation();S.colis[r.key]=!S.colis[r.key];if(!S.colis[r.key])delete S.colis[r.key];save();ev.target.classList.toggle("on");$("dSummary").textContent="Aujourd'hui : "+Object.keys(S.colis).length+" 📦 · "+Object.keys(S.prio).length+" ✉️"};
      e.querySelector('[data-k=p]').onclick=ev=>{ev.stopPropagation();S.prio[r.key]=!S.prio[r.key];if(!S.prio[r.key])delete S.prio[r.key];save();ev.target.classList.toggle("on");$("dSummary").textContent="Aujourd'hui : "+Object.keys(S.colis).length+" 📦 · "+Object.keys(S.prio).length+" ✉️"};
      L.appendChild(e);
    });
  });
  if(!L.children.length)L.innerHTML='<div class="note" style="text-align:center;padding:20px">Aucun résultat</div>';
}
$("colisBtn").onclick=()=>{$("menu").style.display="none";$("colisPanel").style.display="flex";renderDepots()};
$("dSearch").addEventListener("input",renderDepots);
$("closeColis").onclick=()=>{$("colisPanel").style.display="none";PAGES=buildPages();if(IDX()>=PAGES.length)S.idx[S.mode]=Math.max(0,PAGES.length-1);save();render()};
$("clearColis").onclick=()=>{if(confirm("Effacer tous les colis et prioritaires du jour ?")){S.colis={};S.prio={};save();renderDepots()}};

// ---- recherche par adresse (village → rue → numéro) ----
const ADR={};
DATA.forEach(d=>{
  ADR[d.v]=[];
  FULL.forEach(p=>{
    if(p.com!==d.v)return;
    const stops=p.rows.filter(r=>!r.instr);
    if(!stops.length)return;
    let e=ADR[d.v].find(x=>x.street===p.street);
    if(!e){e={street:p.street,stops:[]};ADR[d.v].push(e)}
    e.stops.push(...stops);
  });
});
let adrStop=null;
function fillCom(){
  const s=$("selCom");s.innerHTML='<option value="">— Village —</option>';
  DATA.forEach((d,i)=>s.innerHTML+='<option value="'+i+'">'+d.v+'</option>');
  $("selRue").innerHTML='<option value="">— Rue —</option>';
  $("selNum").innerHTML='<option value="">— N° / Nom —</option>';
  $("adrCard").classList.add("hidden");
}
$("selCom").onchange=()=>{
  const ci=$("selCom").value;
  const r=$("selRue");r.innerHTML='<option value="">— Rue —</option>';
  $("selNum").innerHTML='<option value="">— N° / Nom —</option>';
  $("adrCard").classList.add("hidden");
  if(ci==="")return;
  ADR[DATA[ci].v].forEach((e,i)=>r.innerHTML+='<option value="'+i+'">'+esc(e.street)+'</option>');
};
$("selRue").onchange=()=>{
  const ci=$("selCom").value,ri=$("selRue").value;
  const n=$("selNum");n.innerHTML='<option value="">— N° / Nom —</option>';
  $("adrCard").classList.add("hidden");
  if(ci===""||ri==="")return;
  ADR[DATA[ci].v][ri].stops.forEach((s,i)=>{
    n.innerHTML+='<option value="'+i+'">'+(s.c||"")+" "+(s.n||"–")+" — "+esc((s.tx||"").slice(0,32))+'</option>';
  });
};
$("selNum").onchange=()=>{
  const ci=$("selCom").value,ri=$("selRue").value,ni=$("selNum").value;
  if(ci===""||ri===""||ni===""){$("adrCard").classList.add("hidden");return}
  adrStop=ADR[DATA[ci].v][ri].stops[ni];
  const s=adrStop;
  $("adrNm").textContent=s.tx;
  $("adrDet").textContent=s.com+" · "+KEY2STREET[s.key].street+" · "+(s.c==="D"?"boîte à DROITE":s.c==="G"?"boîte à GAUCHE":s.c==="F"?"en FACE":"")+" n°"+(s.n||"–")+(s.x?" — "+s.x:"");
  let th="";
  s.g.forEach(t=>th+='<span class="tag t-'+t+'">'+({SP:"STOP PUB",DEP:"DÉPÊCHE",CHIEN:"🐕 CHIEN",RS:"RS"}[t]||t)+'</span>');
  if(s.b)th+='<span class="tag t-BAL">'+esc(s.b)+'</span>';
  if(s.rel)th+='<span class="tag t-DEP">📥 RELEVAGE</span>';
  $("adrTags").innerHTML=th;
  $("adrColis").classList.toggle("on",!!S.colis[s.key]);
  $("adrPrio").classList.toggle("on",!!S.prio[s.key]);
  $("adrCard").classList.remove("hidden");
};
$("adrColis").onclick=()=>{const k=adrStop.key;S.colis[k]=!S.colis[k];if(!S.colis[k])delete S.colis[k];save();$("adrColis").classList.toggle("on")};
$("adrPrio").onclick=()=>{const k=adrStop.key;S.prio[k]=!S.prio[k];if(!S.prio[k])delete S.prio[k];save();$("adrPrio").classList.toggle("on")};
$("adrGo").onclick=()=>{
  if(!adrStop)return;
  PAGES=buildPages();
  let i=PAGES.findIndex(p=>p.rows.some(w=>w.key===adrStop.key));
  if(i<0){
    const st=KEY2STREET[adrStop.key];
    i=PAGES.findIndex(p=>(p.com===st.com&&p.street===st.street)||(p.travel&&p.travel.includes(st.street)));
  }
  if(i<0){alert("Cet arrêt n'est pas dans la tournée du jour.\nCoche 📦 ou ✉️ pour l'ajouter.");return}
  S.idx[S.mode]=i;save();
  $("adrPanel").style.display="none";render();
};
function openAdr(){$("menu").style.display="none";fillCom();$("adrPanel").style.display="flex"}
$("adrBtn").onclick=openAdr;
$("adrBtn2").onclick=openAdr;
$("closeAdr").onclick=()=>{$("adrPanel").style.display="none";PAGES=buildPages();save();render()};

// ---- confidentialité : flouter les noms, maintenir le doigt pour révéler ----
let didPeek=false,peekEl=null,peekTimer=null;
function applyPriv(){
  document.body.classList.toggle("priv",!!S.priv);
  $("privBtn").classList.toggle("on",!!S.priv);
  $("privBtn").textContent=S.priv?"🕶":"👁";
}
$("privBtn").onclick=()=>{S.priv=!S.priv;save();applyPriv()};
function startPeek(e){
  if(!S.priv)return;
  const t=e.target.closest(".nm,.cNm,#adrNm");
  if(!t)return;
  clearTimeout(peekTimer);
  peekTimer=setTimeout(()=>{t.classList.add("peek");peekEl=t;didPeek=true},250);
}
function endPeek(){
  clearTimeout(peekTimer);
  if(peekEl){const el=peekEl;peekEl=null;setTimeout(()=>el.classList.remove("peek"),400)}
  setTimeout(()=>{didPeek=false},350);
}
document.addEventListener("touchstart",startPeek,{passive:true});
document.addEventListener("touchend",endPeek);
document.addEventListener("touchcancel",endPeek);
document.addEventListener("mousedown",startPeek);
document.addEventListener("mouseup",endPeek);
applyPriv();

// ---- blocage de veille (Wake Lock, iOS 16.4+ / Safari / app plein écran) ----
let wakeOK=false,wl=null;
async function wakeLock(){
  try{
    if("wakeLock" in navigator&&!wl){
      wl=await navigator.wakeLock.request("screen");
      wakeOK=true;
      wl.addEventListener("release",()=>{wl=null});
    }
  }catch(e){wakeOK=false}
}
document.addEventListener("visibilitychange",()=>{if(document.visibilityState==="visible")wakeLock()});
document.addEventListener("click",wakeLock,{passive:true});
wakeLock();

// ---- service worker (uniquement si hébergé en http/https) ----
if(location.protocol.indexOf("http")===0&&"serviceWorker" in navigator){
  navigator.serviceWorker.register("sw.js").catch(()=>{});
}

render();
