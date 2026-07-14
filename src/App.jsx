import { useState, useEffect, useRef } from 'react';
import { initializeApp } from 'firebase/app';
import { getDatabase, ref, onValue, set } from 'firebase/database';

// ── Firebase ──────────────────────────────────────────────────────────────────
const _app = initializeApp({
  apiKey: "AIzaSyA5ISTFIZTFQnNvox8YNfsMpaiLOL1aTgU",
  authDomain: "rt-checkout-tracker.firebaseapp.com",
  databaseURL: "https://rt-checkout-tracker-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "rt-checkout-tracker",
  storageBucket: "rt-checkout-tracker.firebasestorage.app",
  messagingSenderId: "64761952473",
  appId: "1:64761952473:web:23797528d1fb376f0326c8"
});
const db = getDatabase(_app);

// ── Constants ─────────────────────────────────────────────────────────────────
const PAGES = { DASHBOARD:"dashboard", CHECKOUT:"checkout", RETURN:"return", LOG:"log", STAFF:"staff", PICKER:"picker", SETTINGS:"settings" };
const ROLES = ["STMS","TC"];
const SETTINGS_PW = "AllianceHam";
const DEF_SETTINGS = { rtCount:30, wandCount:10, lightCount:5, unavailableRts:[], unavailableWands:[], unavailableLights:[], emailList:[] };

// ── Helpers ───────────────────────────────────────────────────────────────────
const fbWrite = (path, data) => set(ref(db, path), data).catch(console.error);
const toArr   = v => !v ? [] : Array.isArray(v) ? v.filter(Boolean) : Object.values(v).filter(Boolean);
const pad     = n => String(n).padStart(2,"0");
const fmt     = ms => { const m=Math.floor(ms/60000),h=Math.floor(m/60); return h>0?`${h}h ${m%60}m`:`${m}m`; };
const fmtTime = iso => iso ? new Date(iso).toLocaleTimeString("en-NZ",{hour:"2-digit",minute:"2-digit"}) : "—";
const fmtDate = iso => iso ? new Date(iso).toLocaleDateString("en-NZ",{day:"2-digit",month:"short",year:"numeric"}) : "—";
const localISO = () => { const d=new Date(); return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const sortNums = arr => [...arr].sort((a,b)=>a-b);
const numList  = arr => arr.length ? arr.map(n=>`#${n}`).join(", ") : null;

const sendNotification = payload =>
  fetch('/.netlify/functions/send-email', {
    method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(payload)
  }).catch(e => console.error('Email failed:',e));

// ── Components ────────────────────────────────────────────────────────────────
function SignaturePad({ sigRef }) {
  const cvs=useRef(null), drawing=useRef(false);
  const [hasSig,setHasSig]=useState(false);
  useEffect(()=>{
    sigRef.current={
      get:()=>hasSig?cvs.current?.toDataURL():null,
      clear:()=>{const ctx=cvs.current?.getContext("2d");if(ctx)ctx.clearRect(0,0,cvs.current.width,cvs.current.height);setHasSig(false);}
    };
  },[hasSig]);
  const pt=(e,c)=>{const r=c.getBoundingClientRect(),s=e.touches?e.touches[0]:e;return{x:(s.clientX-r.left)*(c.width/r.width),y:(s.clientY-r.top)*(c.height/r.height)};};
  const dn=e=>{e.preventDefault();drawing.current=true;const p=pt(e,cvs.current),ctx=cvs.current.getContext("2d");ctx.beginPath();ctx.moveTo(p.x,p.y);};
  const mv=e=>{e.preventDefault();if(!drawing.current)return;const p=pt(e,cvs.current),ctx=cvs.current.getContext("2d");ctx.strokeStyle="#1e293b";ctx.lineWidth=2;ctx.lineCap="round";ctx.lineTo(p.x,p.y);ctx.stroke();setHasSig(true);};
  const up=()=>{drawing.current=false;};
  return (
    <div>
      <canvas ref={cvs} width={400} height={120} className="border-2 border-dashed border-gray-300 rounded-lg w-full bg-white touch-none" style={{cursor:"crosshair"}}
        onMouseDown={dn} onMouseMove={mv} onMouseUp={up} onMouseLeave={up} onTouchStart={dn} onTouchMove={mv} onTouchEnd={up}/>
      <button onClick={()=>sigRef.current?.clear()} className="text-xs text-gray-400 underline mt-1 float-right">Clear</button>
      <div className="clear-both"/>
    </div>
  );
}

function SelectGrid({ count, outSet, unavailSet=new Set(), selected, onToggle, color="blue" }) {
  const C={
    blue:{sel:"bg-blue-600 text-white",av:"bg-slate-100 text-slate-600 hover:bg-blue-100"},
    yellow:{sel:"bg-yellow-500 text-white",av:"bg-slate-100 text-slate-600 hover:bg-yellow-100"},
    orange:{sel:"bg-orange-500 text-white",av:"bg-slate-100 text-slate-600 hover:bg-orange-100"},
  };
  return (
    <div className="grid gap-1" style={{gridTemplateColumns:`repeat(${Math.min(count,10)},minmax(0,1fr))`}}>
      {Array.from({length:count},(_,i)=>i+1).map(n=>{
        const isOut=outSet.has(n),isUnavail=unavailSet.has(n),isSel=selected.includes(n);
        return (
          <button key={n} disabled={isOut||isUnavail} onClick={()=>onToggle(n)}
            title={isUnavail?"Temporarily unavailable":undefined}
            className={`aspect-square rounded text-xs font-bold flex items-center justify-center transition-all
              ${isOut?"bg-slate-200 text-slate-400 cursor-not-allowed"
              :isUnavail?"bg-amber-100 text-amber-400 cursor-not-allowed"
              :isSel?C[color].sel:C[color].av}`}>
            {isUnavail&&!isOut?"✕":n}
          </button>
        );
      })}
    </div>
  );
}

function ReturnGrid({ nums, returning, onToggle }) {
  return (
    <div className="grid gap-1" style={{gridTemplateColumns:`repeat(${Math.min(nums.length,10)},minmax(0,1fr))`}}>
      {sortNums(nums).map(n=>{
        const isRet=returning.includes(n);
        return (
          <button key={n} onClick={()=>onToggle(n)}
            className={`aspect-square rounded text-xs font-bold flex items-center justify-center transition-all
              ${isRet?"bg-green-100 text-green-700 hover:bg-red-50":"bg-red-100 text-red-600 ring-1 ring-red-300"}`}>
            {n}
          </button>
        );
      })}
    </div>
  );
}

function UnavailGrid({ count, unavailList, onToggle }) {
  return (
    <div className="grid gap-1" style={{gridTemplateColumns:`repeat(${Math.min(count,10)},minmax(0,1fr))`}}>
      {Array.from({length:count},(_,i)=>i+1).map(n=>{
        const isUnavail=unavailList.includes(n);
        return (
          <button key={n} onClick={()=>onToggle(n)}
            className={`aspect-square rounded text-xs font-bold flex items-center justify-center transition-all
              ${isUnavail?"bg-amber-400 text-white":"bg-slate-100 text-slate-600 hover:bg-amber-100"}`}>
            {n}
          </button>
        );
      })}
    </div>
  );
}

// ── Main App ──────────────────────────────────────────────────────────────────
export default function App() {
  const [page,setPage]             = useState(PAGES.DASHBOARD);
  const [log,setLog]               = useState([]);
  const [staff,setStaff]           = useState([]);
  const [settings,setSettings]     = useState(DEF_SETTINGS);
  const [loading,setLoading]       = useState(true);
  const [connected,setConnected]   = useState(false);
  const [now,setNow]               = useState(Date.now());
  const [returnId,setReturnId]     = useState(null);
  const [tooltip,setTooltip]       = useState(null);
  const sigRef   = useRef(null);
  const loadedRef = useRef({log:false,staff:false,settings:false});

  const [cf,setCf]                 = useState({name:"",timeOut:localISO(),rts:[],wands:[],lights:[]});
  const [cfErr,setCfErr]           = useState("");
  const [showWands,setShowWands]   = useState(false);
  const [showLights,setShowLights] = useState(false);
  const [rf,setRf]                 = useState({timeIn:localISO(),retRts:[],retWands:[],retLights:[],comments:""});
  const [rfErr,setRfErr]           = useState("");
  const [pickerSearch,setPickerSearch] = useState("");
  const [newStaff,setNewStaff]     = useState({name:"",role:"STMS"});
  const [editingId,setEditingId]   = useState(null);
  const [editRole,setEditRole]     = useState("STMS");
  const [settingsUnlocked,setSettingsUnlocked] = useState(false);
  const [settingsPw,setSettingsPw] = useState("");
  const [settingsPwErr,setSettingsPwErr] = useState("");
  const [newEmail,setNewEmail]     = useState("");

  // ── Firebase listeners ──────────────────────────────────────────────────────
  useEffect(()=>{
    const check = () => {
      if (loadedRef.current.log && loadedRef.current.staff && loadedRef.current.settings) setLoading(false);
    };
    const unsubLog = onValue(ref(db,'log'), snap=>{
      setLog(toArr(snap.val())); loadedRef.current.log=true; check();
    });
    const unsubStaff = onValue(ref(db,'staff'), snap=>{
      setStaff(toArr(snap.val())); loadedRef.current.staff=true; check();
    });
    const unsubSettings = onValue(ref(db,'settings'), snap=>{
      const d=snap.val()||{};
      setSettings({
        rtCount:    d.rtCount    ?? 30,
        wandCount:  d.wandCount  ?? 10,
        lightCount: d.lightCount ?? 5,
        unavailableRts:    toArr(d.unavailableRts),
        unavailableWands:  toArr(d.unavailableWands),
        unavailableLights: toArr(d.unavailableLights),
        emailList:         toArr(d.emailList),
      });
      loadedRef.current.settings=true; check();
    });
    const unsubConn = onValue(ref(db,'.info/connected'), snap=>setConnected(snap.val()===true));
    return ()=>{unsubLog();unsubStaff();unsubSettings();unsubConn();};
  },[]);

  useEffect(()=>{ const t=setInterval(()=>setNow(Date.now()),30000); return()=>clearInterval(t); },[]);

  // ── Derived gear state ──────────────────────────────────────────────────────
  const active=log.filter(e=>!e.returnedAt);
  const outRts=new Set(), outWands=new Set(), outLights=new Set(), owners={};
  active.forEach(e=>{
    (e.rts||[]).forEach(n=>{outRts.add(n); owners[`rt-${n}`]=e.name;});
    (e.wands||[]).forEach(n=>{outWands.add(n); owners[`wand-${n}`]=e.name;});
    (e.lights||[]).forEach(n=>{outLights.add(n); owners[`light-${n}`]=e.name;});
  });
  const unavailRts   = new Set(settings.unavailableRts);
  const unavailWands = new Set(settings.unavailableWands);
  const unavailLights= new Set(settings.unavailableLights);
  const avail = (total, out, unavail) => total - out.size - [...unavail].filter(n=>!out.has(n)).length;

  // ── Navigation ──────────────────────────────────────────────────────────────
  const goTo       = p  => { setTooltip(null); setPage(p); };
  const goCheckout = () => { setCf({name:"",timeOut:localISO(),rts:[],wands:[],lights:[]}); setCfErr(""); setShowWands(false); setShowLights(false); goTo(PAGES.CHECKOUT); };
  const goReturn   = id => {
    const e=log.find(x=>x.id===id);
    setReturnId(id);
    setRf({timeIn:localISO(),retRts:[...(e?.rts||[])],retWands:[...(e?.wands||[])],retLights:[...(e?.lights||[])],comments:""});
    setRfErr(""); goTo(PAGES.RETURN);
  };
  const toggleCf=(key,n)=>setCf(p=>({...p,[key]:p[key].includes(n)?p[key].filter(x=>x!==n):[...p[key],n]}));
  const toggleRf=(key,n)=>setRf(p=>({...p,[key]:p[key].includes(n)?p[key].filter(x=>x!==n):[...p[key],n]}));

  // ── Actions ─────────────────────────────────────────────────────────────────
  const submitCheckout = () => {
    if(!cf.name.trim()) return setCfErr("Please enter a name.");
    if(cf.rts.length+cf.wands.length+cf.lights.length===0) return setCfErr("Please select at least one piece of gear.");
    const sig=sigRef.current?.get();
    if(!sig) return setCfErr("Please provide a signature.");
    const entry={id:Date.now().toString(),name:cf.name.trim(),timeOut:new Date(cf.timeOut).toISOString(),
      rts:cf.rts,wands:cf.wands,lights:cf.lights,signature:sig,
      returnedAt:null,retRts:null,retWands:null,retLights:null,comments:""};
    const newLog=[entry,...log];
    setLog(newLog); fbWrite('log',newLog);
    setCfErr(""); goTo(PAGES.DASHBOARD);
  };

  const submitReturn = () => {
    const entry=log.find(e=>e.id===returnId);
    const updated={...entry,returnedAt:new Date(rf.timeIn).toISOString(),
      retRts:rf.retRts,retWands:rf.retWands,retLights:rf.retLights,comments:rf.comments};
    const newLog=log.map(e=>e.id===returnId?updated:e);
    setLog(newLog); fbWrite('log',newLog);

    const missingRts    = (entry.rts||[]).filter(n=>!rf.retRts.includes(n));
    const missingWands  = (entry.wands||[]).filter(n=>!rf.retWands.includes(n));
    const missingLights = (entry.lights||[]).filter(n=>!rf.retLights.includes(n));
    const anyMissing    = missingRts.length+missingWands.length+missingLights.length>0;

    if((rf.comments.trim()||anyMissing) && settings.emailList.length>0) {
      const gear=[];
      if((entry.rts||[]).length)    gear.push(`📻 RTs: ${sortNums(entry.rts).map(n=>`#${n}`).join(', ')}`);
      if((entry.wands||[]).length)  gear.push(`🟡 Wands: ${sortNums(entry.wands).map(n=>`#${n}`).join(', ')}`);
      if((entry.lights||[]).length) gear.push(`💡 Lights: ${sortNums(entry.lights).map(n=>`#${n}`).join(', ')}`);
      const missing=[];
      if(missingRts.length)    missing.push(`📻 RTs: ${sortNums(missingRts).map(n=>`#${n}`).join(', ')}`);
      if(missingWands.length)  missing.push(`🟡 Wands: ${sortNums(missingWands).map(n=>`#${n}`).join(', ')}`);
      if(missingLights.length) missing.push(`💡 Lights: ${sortNums(missingLights).map(n=>`#${n}`).join(', ')}`);
      sendNotification({
        recipients:settings.emailList, staffName:entry.name,
        timeOut:fmtTime(entry.timeOut), timeIn:fmtTime(new Date(rf.timeIn).toISOString()),
        date:fmtDate(entry.timeOut), gearDetails:gear, missingDetails:missing, comments:rf.comments
      });
    }
    goTo(PAGES.DASHBOARD);
  };

  const addStaff    = () => { if(!newStaff.name.trim())return; const s=[...staff,{id:Date.now().toString(),name:newStaff.name.trim(),role:newStaff.role}]; setStaff(s); fbWrite('staff',s); setNewStaff({name:"",role:"STMS"}); };
  const deleteStaff = id => { const s=staff.filter(x=>x.id!==id); setStaff(s); fbWrite('staff',s); };
  const saveEdit    = id => { const s=staff.map(x=>x.id===id?{...x,role:editRole}:x); setStaff(s); fbWrite('staff',s); setEditingId(null); };

  const updateSettings = updates => {
    const s={...settings,...updates}; setSettings(s); fbWrite('settings',s);
  };
  const toggleUnavail = (key,n) => {
    const curr=settings[key]||[];
    updateSettings({[key]:curr.includes(n)?curr.filter(x=>x!==n):[...curr,n]});
  };
  const addEmail = () => {
    if(!newEmail.trim()||!/\S+@\S+\.\S+/.test(newEmail)) return;
    updateSettings({emailList:[...settings.emailList,newEmail.trim().toLowerCase()]});
    setNewEmail("");
  };
  const removeEmail = email => updateSettings({emailList:settings.emailList.filter(e=>e!==email)});
  const checkPw     = () => { if(settingsPw===SETTINGS_PW){setSettingsUnlocked(true);setSettingsPwErr("");}else{setSettingsPwErr("Incorrect password.");} setSettingsPw(""); };

  const filtered     = staff.filter(s=>s.name.toLowerCase().includes(pickerSearch.toLowerCase()));
  const stmsFiltered = filtered.filter(s=>s.role==="STMS").sort((a,b)=>a.name.localeCompare(b.name));
  const tcFiltered   = filtered.filter(s=>s.role==="TC").sort((a,b)=>a.name.localeCompare(b.name));
  const stmsAll      = staff.filter(s=>s.role==="STMS").sort((a,b)=>a.name.localeCompare(b.name));
  const tcAll        = staff.filter(s=>s.role==="TC").sort((a,b)=>a.name.localeCompare(b.name));
  const re           = log.find(e=>e.id===returnId);
  const totalSel     = cf.rts.length+cf.wands.length+cf.lights.length;
  const showBack     = page!==PAGES.DASHBOARD;

  if(loading) return (
    <div className="flex flex-col items-center justify-center h-screen gap-3 text-slate-400">
      <div className="text-3xl animate-pulse">📻</div>
      <p className="text-sm">Connecting to database…</p>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-100 font-sans">

      {/* ── Header ── */}
      <div className="bg-blue-800 text-white px-4 py-3 flex items-center justify-between shadow-md sticky top-0 z-20">
        <div className="flex items-center gap-2">
          {showBack && <button onClick={()=>goTo(PAGES.DASHBOARD)} className="text-blue-200 hover:text-white text-2xl leading-none mr-1">‹</button>}
          <span className="font-bold tracking-wide">📻 RT Tracker</span>
          <span title={connected?"Connected":"Reconnecting…"} className={`w-2 h-2 rounded-full ml-1 ${connected?"bg-green-400":"bg-yellow-400 animate-pulse"}`}/>
        </div>
        <div className="flex gap-2">
          {page!==PAGES.SETTINGS && <button onClick={()=>goTo(PAGES.SETTINGS)} className="text-xs px-3 py-1.5 rounded font-medium bg-blue-700 hover:bg-blue-600 text-blue-100 transition">⚙️</button>}
          {page!==PAGES.STAFF    && <button onClick={()=>goTo(PAGES.STAFF)}    className="text-xs px-3 py-1.5 rounded font-medium bg-blue-700 hover:bg-blue-600 text-blue-100 transition">Staff</button>}
          {page!==PAGES.LOG      && <button onClick={()=>goTo(PAGES.LOG)}      className="text-xs px-3 py-1.5 rounded font-medium bg-blue-700 hover:bg-blue-600 text-blue-100 transition">Log</button>}
          {page!==PAGES.CHECKOUT && page!==PAGES.PICKER && <button onClick={goCheckout} className="text-xs px-3 py-1.5 rounded font-semibold bg-white text-blue-800 hover:bg-blue-50 transition">+ Checkout</button>}
        </div>
      </div>

      <div className="max-w-xl mx-auto px-4 py-5">

        {/* ══ DASHBOARD ══ */}
        {page===PAGES.DASHBOARD && (
          <div>
            <div className="flex items-baseline justify-between mb-3">
              <h2 className="text-lg font-bold text-slate-800">Outstanding</h2>
              <span className="text-sm text-slate-500">{active.length} active</span>
            </div>
            {active.length===0 ? (
              <div className="text-center py-6 text-slate-400 mb-4"><div className="text-4xl mb-1">✅</div><p className="text-sm font-medium">All gear returned</p></div>
            ) : (
              <div className="flex flex-col gap-2 mb-5">
                {active.map(e=>(
                  <button key={e.id} onClick={()=>goReturn(e.id)}
                    className="w-full text-left bg-white rounded-2xl shadow-sm border border-orange-200 p-4 hover:border-orange-400 hover:shadow-md active:scale-95 transition-all">
                    <div className="flex items-center justify-between">
                      <div className="flex-1 min-w-0 pr-3">
                        <div className="font-semibold text-slate-800">{e.name}</div>
                        <div className="text-xs text-slate-500 mt-0.5">
                          Out {fmtTime(e.timeOut)}
                          {(e.rts||[]).length>0    && ` · RTs: ${sortNums(e.rts).join(", ")}`}
                          {(e.wands||[]).length>0  && ` · Wands: ${sortNums(e.wands).join(", ")}`}
                          {(e.lights||[]).length>0 && ` · Lights: ${sortNums(e.lights).join(", ")}`}
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="text-orange-600 font-bold">{fmt(now-new Date(e.timeOut).getTime())}</div>
                        <div className="text-xs text-blue-500 mt-0.5">Tap →</div>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}

            <div className="bg-white rounded-2xl shadow-sm p-4">
              <h3 className="text-sm font-bold text-slate-700 mb-3">Gear Status</h3>
              {tooltip && (
                <div className="mb-3 bg-slate-800 text-white text-xs rounded-xl px-3 py-2 flex items-center justify-between">
                  <span>
                    <span className="font-semibold capitalize">{tooltip.type} #{tooltip.num}</span>
                    {tooltip.name ? ` — with ${tooltip.name}` : " — temporarily unavailable"}
                  </span>
                  <button onClick={()=>setTooltip(null)} className="ml-2 text-slate-400 hover:text-white">✕</button>
                </div>
              )}
              <div className="mb-4">
                <div className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">
                  📻 RTs — {avail(settings.rtCount,outRts,unavailRts)}/{settings.rtCount} available
                </div>
                <div className="grid grid-cols-10 gap-1">
                  {Array.from({length:settings.rtCount},(_,i)=>i+1).map(n=>{
                    const isOut=outRts.has(n), isUnavail=unavailRts.has(n);
                    return (
                      <button key={n}
                        onClick={()=>(isOut||isUnavail)&&setTooltip(t=>t?.num===n&&t?.type==="rt"?null:{type:"rt",num:n,name:isOut?owners[`rt-${n}`]:null})}
                        className={`aspect-square rounded text-xs font-bold flex items-center justify-center transition
                          ${isOut?"bg-slate-300 text-slate-500 hover:bg-slate-400"
                          :isUnavail?"bg-amber-100 text-amber-500 hover:bg-amber-200"
                          :"bg-green-100 text-green-700 cursor-default"}`}>
                        {isUnavail&&!isOut?"✕":n}
                      </button>
                    );
                  })}
                </div>
              </div>
              {[["🟡 Wands",settings.wandCount,outWands,unavailWands,"wand"],
                ["💡 Overhead Lights",settings.lightCount,outLights,unavailLights,"light"]].map(([label,count,outSet,unavSet,type])=>(
                <div key={type} className="mb-2 bg-slate-50 rounded-xl px-3 py-2.5">
                  <div className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-1">
                    {label} — {avail(count,outSet,unavSet)}/{count} available
                  </div>
                  {outSet.size===0&&unavSet.size===0 ? (
                    <p className="text-xs text-green-600 font-medium">All available</p>
                  ) : (
                    <div className="text-xs flex flex-wrap gap-1">
                      {sortNums([...outSet]).map(n=>(
                        <span key={`o${n}`} className="inline-block bg-slate-200 rounded px-1.5 py-0.5 cursor-pointer hover:bg-slate-300"
                          onClick={()=>setTooltip(t=>t?.num===n&&t?.type===type?null:{type,num:n,name:owners[`${type}-${n}`]})}>
                          #{n}
                        </span>
                      ))}
                      {sortNums([...unavSet]).filter(n=>!outSet.has(n)).map(n=>(
                        <span key={`u${n}`} className="inline-block bg-amber-100 text-amber-600 rounded px-1.5 py-0.5 cursor-pointer"
                          onClick={()=>setTooltip(t=>t?.num===n&&t?.type===type?null:{type,num:n,name:null})}>
                          #{n}✕
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
              <div className="flex gap-4 mt-3 text-xs text-slate-400 flex-wrap">
                <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-green-100 inline-block"/>Available</span>
                <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-slate-300 inline-block"/>Checked out</span>
                <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-amber-100 inline-block"/>Unavailable</span>
              </div>
            </div>
          </div>
        )}

        {/* ══ STAFF PICKER ══ */}
        {page===PAGES.PICKER && (
          <div>
            <div className="flex items-center gap-3 mb-4">
              <button onClick={()=>goTo(PAGES.CHECKOUT)} className="text-slate-500 hover:text-slate-800 text-2xl leading-none">‹</button>
              <h2 className="text-lg font-bold text-slate-800">Select Staff</h2>
            </div>
            <input autoFocus className="w-full border border-slate-300 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 mb-4"
              placeholder="Search…" value={pickerSearch} onChange={e=>setPickerSearch(e.target.value)}/>
            {staff.length===0 ? (
              <div className="text-center py-12 text-slate-400 text-sm">
                <p>No staff added yet.</p>
                <button onClick={()=>goTo(PAGES.STAFF)} className="mt-2 text-blue-600 underline">Go to Staff tab</button>
              </div>
            ) : filtered.length===0 ? <p className="text-center text-slate-400 text-sm py-10">No matches.</p> : (
              <div className="flex flex-col gap-5">
                {[[stmsFiltered,"STMS","blue"],[tcFiltered,"TC","purple"]].map(([grp,role,col])=>grp.length>0&&(
                  <div key={role}>
                    <div className={`text-xs font-bold text-${col}-700 uppercase tracking-widest mb-2`}>{role}</div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      {grp.map(s=>(
                        <button key={s.id} onClick={()=>{setCf(f=>({...f,name:s.name}));goTo(PAGES.CHECKOUT);}}
                          className="text-left bg-white rounded-xl border border-slate-200 px-3 py-2.5 hover:border-blue-400 hover:bg-blue-50 active:scale-95 transition-all">
                          <div className="font-medium text-slate-800 text-sm">{s.name}</div>
                          <div className={`text-xs font-semibold mt-0.5 ${col==="blue"?"text-blue-600":"text-purple-600"}`}>{role}</div>
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ══ CHECKOUT ══ */}
        {page===PAGES.CHECKOUT && (
          <div>
            <h2 className="text-lg font-bold text-slate-800 mb-4">New Checkout</h2>
            <div className="bg-white rounded-2xl shadow-sm p-5 flex flex-col gap-4">
              <div>
                <label className="block text-sm font-semibold text-slate-600 mb-1">Name</label>
                <div className="flex gap-2">
                  <input className="flex-1 border border-slate-300 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Type or select staff" value={cf.name} onChange={e=>setCf(f=>({...f,name:e.target.value}))}/>
                  <button onClick={()=>{setPickerSearch("");goTo(PAGES.PICKER);}}
                    className="shrink-0 text-sm bg-slate-100 hover:bg-slate-200 border border-slate-300 text-slate-700 font-medium px-3 py-2 rounded-xl transition">
                    👥 Staff
                  </button>
                </div>
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-600 mb-1">Time Out</label>
                <input type="datetime-local" className="w-full border border-slate-300 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={cf.timeOut} onChange={e=>setCf(f=>({...f,timeOut:e.target.value}))}/>
              </div>
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm font-semibold text-slate-600">📻 RTs{cf.rts.length>0&&<span className="text-blue-600 font-normal"> — {cf.rts.length} selected</span>}</label>
                  {cf.rts.length>0&&<button onClick={()=>setCf(f=>({...f,rts:[]}))} className="text-xs text-slate-400 underline">Clear</button>}
                </div>
                <SelectGrid count={settings.rtCount} outSet={outRts} unavailSet={unavailRts} selected={cf.rts} onToggle={n=>toggleCf("rts",n)} color="blue"/>
              </div>
              {[["🟡 Wands",settings.wandCount,outWands,unavailWands,"wands","yellow",showWands,setShowWands],
                ["💡 Overhead Lights",settings.lightCount,outLights,unavailLights,"lights","orange",showLights,setShowLights]].map(([label,count,outSet,unavSet,key,color,show,setShow])=>(
                <div key={key}>
                  <button onClick={()=>setShow(v=>!v)}
                    className="w-full flex items-center justify-between text-sm font-semibold text-slate-600 bg-slate-50 hover:bg-slate-100 rounded-xl px-3 py-2.5 transition">
                    <span>{label}{cf[key].length>0&&<span className="text-blue-600 font-normal"> — {cf[key].length} selected</span>}</span>
                    <span className="text-slate-400 text-xs">{show?"▲":"▼"}</span>
                  </button>
                  {show&&<div className="mt-2"><SelectGrid count={count} outSet={outSet} unavailSet={unavSet} selected={cf[key]} onToggle={n=>toggleCf(key,n)} color={color}/></div>}
                </div>
              ))}
              {totalSel>0&&(
                <div className="bg-blue-50 border border-blue-100 rounded-xl px-3 py-2 text-xs text-blue-800 leading-relaxed">
                  <span className="font-bold">Taking ({totalSel} item{totalSel!==1?"s":""}):</span>
                  {cf.rts.length>0    && <div>📻 RTs: {numList(sortNums(cf.rts))}</div>}
                  {cf.wands.length>0  && <div>🟡 Wands: {numList(sortNums(cf.wands))}</div>}
                  {cf.lights.length>0 && <div>💡 Lights: {numList(sortNums(cf.lights))}</div>}
                </div>
              )}
              <div>
                <label className="block text-sm font-semibold text-slate-600 mb-2">Signature</label>
                <SignaturePad sigRef={sigRef}/>
                <p className="text-xs text-slate-400 mt-1">Sign to confirm you are taking this gear</p>
              </div>
              {cfErr&&<p className="text-red-500 text-sm bg-red-50 rounded-lg px-3 py-2">{cfErr}</p>}
              <button onClick={submitCheckout} className="w-full bg-blue-700 text-white font-semibold py-3 rounded-xl hover:bg-blue-600 active:scale-95 transition text-sm">
                Confirm Checkout
              </button>
            </div>
          </div>
        )}

        {/* ══ RETURN ══ */}
        {page===PAGES.RETURN&&re&&(()=>{
          const takenRts=re.rts||[],takenWands=re.wands||[],takenLights=re.lights||[];
          const missingRts=takenRts.filter(n=>!rf.retRts.includes(n));
          const missingWands=takenWands.filter(n=>!rf.retWands.includes(n));
          const missingLights=takenLights.filter(n=>!rf.retLights.includes(n));
          const totalMissing=missingRts.length+missingWands.length+missingLights.length;
          return (
            <div>
              <h2 className="text-lg font-bold text-slate-800 mb-4">Return Gear</h2>
              <div className="bg-white rounded-2xl shadow-sm p-5 flex flex-col gap-4">
                <div className="bg-slate-50 rounded-xl p-3 flex flex-col gap-1 text-sm">
                  <div className="flex justify-between"><span className="text-slate-400">Name</span><span className="font-semibold text-slate-800">{re.name}</span></div>
                  <div className="flex justify-between"><span className="text-slate-400">Checked out</span><span className="font-medium">{fmtTime(re.timeOut)} · {fmtDate(re.timeOut)}</span></div>
                  {re.signature&&<div className="mt-1 pt-2 border-t border-slate-200"><p className="text-xs text-slate-400 mb-1">Signature</p><img src={re.signature} alt="sig" className="h-10 rounded border border-slate-200 bg-white"/></div>}
                </div>
                <p className="text-xs text-slate-500 bg-slate-50 rounded-lg px-3 py-2">
                  All gear marked <span className="text-green-600 font-semibold">returning</span> by default. Tap any item to mark it <span className="text-red-500 font-semibold">missing</span>.
                </p>
                {takenRts.length>0&&(
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="text-sm font-semibold text-slate-600">📻 RTs</label>
                      <span className="text-xs text-slate-500">{rf.retRts.length}/{takenRts.length} returning</span>
                    </div>
                    <ReturnGrid nums={takenRts} returning={rf.retRts} onToggle={n=>toggleRf("retRts",n)}/>
                  </div>
                )}
                {takenWands.length>0&&(
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="text-sm font-semibold text-slate-600">🟡 Wands</label>
                      <span className="text-xs text-slate-500">{rf.retWands.length}/{takenWands.length} returning</span>
                    </div>
                    <ReturnGrid nums={takenWands} returning={rf.retWands} onToggle={n=>toggleRf("retWands",n)}/>
                  </div>
                )}
                {takenLights.length>0&&(
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="text-sm font-semibold text-slate-600">💡 Overhead Lights</label>
                      <span className="text-xs text-slate-500">{rf.retLights.length}/{takenLights.length} returning</span>
                    </div>
                    <ReturnGrid nums={takenLights} returning={rf.retLights} onToggle={n=>toggleRf("retLights",n)}/>
                  </div>
                )}
                {totalMissing>0&&(
                  <div className="bg-red-50 border border-red-200 rounded-xl px-3 py-2 text-xs text-red-700">
                    <span className="font-bold">⚠️ Missing ({totalMissing}):</span>
                    {missingRts.length>0    && <div>📻 RTs: {numList(sortNums(missingRts))}</div>}
                    {missingWands.length>0  && <div>🟡 Wands: {numList(sortNums(missingWands))}</div>}
                    {missingLights.length>0 && <div>💡 Lights: {numList(sortNums(missingLights))}</div>}
                  </div>
                )}
                <div>
                  <label className="block text-sm font-semibold text-slate-600 mb-1">Time In</label>
                  <input type="datetime-local" className="w-full border border-slate-300 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    value={rf.timeIn} onChange={e=>setRf(f=>({...f,timeIn:e.target.value}))}/>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-600 mb-1">
                    Comments <span className="font-normal text-slate-400">(triggers email notification)</span>
                  </label>
                  <textarea rows={2} placeholder="e.g. RT #5 left in van…"
                    className="w-full border border-slate-300 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                    value={rf.comments} onChange={e=>setRf(f=>({...f,comments:e.target.value}))}/>
                </div>
                {rfErr&&<p className="text-red-500 text-sm bg-red-50 rounded-lg px-3 py-2">{rfErr}</p>}
                <button onClick={submitReturn} className="w-full bg-green-600 text-white font-semibold py-3 rounded-xl hover:bg-green-500 active:scale-95 transition text-sm">
                  Confirm Return
                </button>
              </div>
            </div>
          );
        })()}

        {/* ══ LOG ══ */}
        {page===PAGES.LOG&&(
          <div>
            <div className="flex items-baseline justify-between mb-4">
              <h2 className="text-lg font-bold text-slate-800">Full Log</h2>
              <span className="text-sm text-slate-500">{log.length} entries</span>
            </div>
            {log.length===0 ? <div className="text-center py-20 text-slate-400 text-sm">No entries yet.</div> : (
              <div className="flex flex-col gap-3">
                {log.map(e=>{
                  const isOut=!e.returnedAt;
                  const tRts=e.rts||[],tWands=e.wands||[],tLights=e.lights||[];
                  const rRts=e.retRts||[],rWands=e.retWands||[],rLights=e.retLights||[];
                  const mRts=tRts.filter(n=>!rRts.includes(n)),mWands=tWands.filter(n=>!rWands.includes(n)),mLights=tLights.filter(n=>!rLights.includes(n));
                  const anyMissing=mRts.length+mWands.length+mLights.length>0;
                  return (
                    <div key={e.id} className={`bg-white rounded-2xl shadow-sm border p-4 ${isOut?"border-orange-300":anyMissing?"border-red-300":"border-green-200"}`}>
                      <div className="flex items-start justify-between mb-2">
                        <div><div className="font-semibold text-slate-800">{e.name}</div><div className="text-xs text-slate-400">{fmtDate(e.timeOut)}</div></div>
                        <span className={`text-xs font-semibold px-2.5 py-1 rounded-full shrink-0 ${isOut?"bg-orange-100 text-orange-700":anyMissing?"bg-red-100 text-red-700":"bg-green-100 text-green-700"}`}>
                          {isOut?"Outstanding":anyMissing?"Incomplete":"Returned"}
                        </span>
                      </div>
                      <div className="text-xs text-slate-500 grid grid-cols-2 gap-x-4 mb-2">
                        <div><span className="text-slate-400">Out:</span> <span className="font-medium">{fmtTime(e.timeOut)}</span></div>
                        {e.returnedAt&&<div><span className="text-slate-400">In:</span> <span className="font-medium">{fmtTime(e.returnedAt)}</span></div>}
                      </div>
                      <div className="text-xs text-slate-600 flex flex-col gap-0.5">
                        {tRts.length>0    && <div>📻 {numList(sortNums(tRts))}</div>}
                        {tWands.length>0  && <div>🟡 Wands: {numList(sortNums(tWands))}</div>}
                        {tLights.length>0 && <div>💡 Lights: {numList(sortNums(tLights))}</div>}
                      </div>
                      {!isOut&&anyMissing&&(
                        <div className="mt-2 text-xs text-red-700 bg-red-50 rounded-lg px-3 py-1.5">
                          ⚠️ Missing:{mRts.length>0&&` RTs ${numList(sortNums(mRts))}`}{mWands.length>0&&` Wands ${numList(sortNums(mWands))}`}{mLights.length>0&&` Lights ${numList(sortNums(mLights))}`}
                        </div>
                      )}
                      {e.comments&&<div className="mt-2 text-xs text-slate-600 bg-slate-50 rounded-lg px-3 py-1.5">💬 {e.comments}</div>}
                      {e.signature&&<details className="mt-2"><summary className="text-xs text-slate-400 cursor-pointer hover:text-slate-600">View signature</summary><img src={e.signature} alt="sig" className="h-12 mt-1 border border-slate-200 rounded bg-white"/></details>}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ══ STAFF ══ */}
        {page===PAGES.STAFF&&(
          <div>
            <h2 className="text-lg font-bold text-slate-800 mb-4">Staff Roster</h2>
            <div className="bg-white rounded-2xl shadow-sm p-4 mb-5">
              <p className="text-sm font-semibold text-slate-600 mb-3">Add Staff Member</p>
              <div className="flex gap-2">
                <input className="flex-1 border border-slate-300 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Full name" value={newStaff.name}
                  onChange={e=>setNewStaff(f=>({...f,name:e.target.value}))}
                  onKeyDown={e=>e.key==="Enter"&&addStaff()}/>
                <select className="border border-slate-300 rounded-xl px-3 py-2.5 text-sm focus:outline-none bg-white"
                  value={newStaff.role} onChange={e=>setNewStaff(f=>({...f,role:e.target.value}))}>
                  {ROLES.map(r=><option key={r}>{r}</option>)}
                </select>
                <button onClick={addStaff} className="shrink-0 bg-blue-700 text-white font-semibold px-4 py-2 rounded-xl text-sm hover:bg-blue-600 transition">Add</button>
              </div>
            </div>
            {staff.length===0 ? <div className="text-center py-16 text-slate-400 text-sm">No staff added yet.</div> : (
              <div className="flex flex-col gap-5">
                {[["STMS",stmsAll,"blue"],["TC",tcAll,"purple"]].map(([role,members,col])=>members.length>0&&(
                  <div key={role}>
                    <div className={`text-xs font-bold text-${col}-700 uppercase tracking-widest mb-2 px-1`}>{role} — {members.length}</div>
                    <div className="flex flex-col gap-2">
                      {members.map(s=>(
                        <div key={s.id} className="bg-white rounded-xl border border-slate-200 px-4 py-3 flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <span className="font-medium text-slate-800">{s.name}</span>
                            {editingId===s.id ? (
                              <select className="border border-slate-300 rounded-lg px-2 py-1 text-xs focus:outline-none bg-white"
                                value={editRole} onChange={e=>setEditRole(e.target.value)}>
                                {ROLES.map(r=><option key={r}>{r}</option>)}
                              </select>
                            ) : (
                              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${s.role==="STMS"?"bg-blue-100 text-blue-700":"bg-purple-100 text-purple-700"}`}>{s.role}</span>
                            )}
                          </div>
                          <div className="flex gap-2">
                            {editingId===s.id ? (
                              <><button onClick={()=>saveEdit(s.id)} className="text-xs bg-green-100 text-green-700 font-semibold px-2.5 py-1 rounded-lg hover:bg-green-200 transition">Save</button>
                              <button onClick={()=>setEditingId(null)} className="text-xs bg-slate-100 text-slate-500 px-2.5 py-1 rounded-lg hover:bg-slate-200 transition">Cancel</button></>
                            ) : (
                              <><button onClick={()=>{setEditingId(s.id);setEditRole(s.role);}} className="text-xs bg-slate-100 text-slate-600 font-medium px-2.5 py-1 rounded-lg hover:bg-slate-200 transition">Edit</button>
                              <button onClick={()=>deleteStaff(s.id)} className="text-xs bg-red-50 text-red-500 font-medium px-2.5 py-1 rounded-lg hover:bg-red-100 transition">Delete</button></>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ══ SETTINGS ══ */}
        {page===PAGES.SETTINGS&&(
          <div>
            <h2 className="text-lg font-bold text-slate-800 mb-4">⚙️ Settings</h2>
            {!settingsUnlocked ? (
              <div className="bg-white rounded-2xl shadow-sm p-6 max-w-sm mx-auto">
                <p className="text-sm text-slate-600 mb-4 text-center">Enter password to access settings</p>
                <input type="password" className="w-full border border-slate-300 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 mb-3"
                  placeholder="Password" value={settingsPw}
                  onChange={e=>setSettingsPw(e.target.value)}
                  onKeyDown={e=>e.key==="Enter"&&checkPw()}/>
                {settingsPwErr&&<p className="text-red-500 text-xs mb-3">{settingsPwErr}</p>}
                <button onClick={checkPw} className="w-full bg-blue-700 text-white font-semibold py-2.5 rounded-xl hover:bg-blue-600 transition text-sm">Unlock</button>
              </div>
            ) : (
              <div className="flex flex-col gap-5">

                {/* Gear Counts */}
                <div className="bg-white rounded-2xl shadow-sm p-4">
                  <h3 className="text-sm font-bold text-slate-700 mb-3">Gear Counts</h3>
                  {[["📻 RTs","rtCount"],["🟡 Wands","wandCount"],["💡 Overhead Lights","lightCount"]].map(([label,key])=>(
                    <div key={key} className="flex items-center justify-between py-2.5 border-b border-slate-100 last:border-0">
                      <span className="text-sm text-slate-700">{label}</span>
                      <div className="flex items-center gap-3">
                        <button onClick={()=>settings[key]>1&&updateSettings({[key]:settings[key]-1})}
                          className="w-8 h-8 rounded-lg bg-slate-100 hover:bg-slate-200 font-bold text-slate-600 flex items-center justify-center transition">−</button>
                        <span className="w-8 text-center font-semibold text-slate-800 text-sm">{settings[key]}</span>
                        <button onClick={()=>updateSettings({[key]:settings[key]+1})}
                          className="w-8 h-8 rounded-lg bg-slate-100 hover:bg-slate-200 font-bold text-slate-600 flex items-center justify-center transition">+</button>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Temporarily Unavailable */}
                <div className="bg-white rounded-2xl shadow-sm p-4">
                  <h3 className="text-sm font-bold text-slate-700 mb-1">Temporarily Unavailable</h3>
                  <p className="text-xs text-slate-400 mb-4">Tap to mark gear as out of service. It shows amber on the dashboard and is unselectable on checkout.</p>
                  <div className="flex flex-col gap-4">
                    {[["📻 RTs",settings.rtCount,"unavailableRts"],["🟡 Wands",settings.wandCount,"unavailableWands"],["💡 Overhead Lights",settings.lightCount,"unavailableLights"]].map(([label,count,key])=>(
                      <div key={key}>
                        <div className="flex items-center justify-between mb-2">
                          <p className="text-xs font-semibold text-slate-500">{label}</p>
                          {(settings[key]||[]).length>0&&<button onClick={()=>updateSettings({[key]:[]})} className="text-xs text-slate-400 underline">Clear all</button>}
                        </div>
                        <UnavailGrid count={count} unavailList={settings[key]||[]} onToggle={n=>toggleUnavail(key,n)}/>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Email Notifications */}
                <div className="bg-white rounded-2xl shadow-sm p-4">
                  <h3 className="text-sm font-bold text-slate-700 mb-1">Email Notifications</h3>
                  <p className="text-xs text-slate-400 mb-3">These addresses receive an email when a return is submitted with comments.</p>
                  <div className="flex gap-2 mb-3">
                    <input className="flex-1 border border-slate-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="email@example.com" value={newEmail}
                      onChange={e=>setNewEmail(e.target.value)}
                      onKeyDown={e=>e.key==="Enter"&&addEmail()}/>
                    <button onClick={addEmail} className="shrink-0 bg-blue-700 text-white font-semibold px-4 py-2 rounded-xl text-sm hover:bg-blue-600 transition">Add</button>
                  </div>
                  {settings.emailList.length===0 ? (
                    <p className="text-xs text-slate-400 text-center py-3">No emails added yet.</p>
                  ) : (
                    <div className="flex flex-col gap-2">
                      {settings.emailList.map(email=>(
                        <div key={email} className="flex items-center justify-between bg-slate-50 rounded-xl px-3 py-2.5">
                          <span className="text-sm text-slate-700">{email}</span>
                          <button onClick={()=>removeEmail(email)} className="text-xs text-red-500 hover:text-red-700 ml-3 shrink-0 transition">Remove</button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <button onClick={()=>setSettingsUnlocked(false)}
                  className="w-full bg-slate-200 text-slate-600 font-semibold py-2.5 rounded-xl hover:bg-slate-300 transition text-sm">
                  🔒 Lock Settings
                </button>
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  );
}