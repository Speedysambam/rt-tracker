import { useState, useEffect } from 'react';
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getDatabase, ref, onValue, set, get } from 'firebase/database';

const _cfg = {
  apiKey: "AIzaSyA5ISTFIZTFQnNvox8YNfsMpaiLOL1aTgU",
  authDomain: "rt-checkout-tracker.firebaseapp.com",
  databaseURL: "https://rt-checkout-tracker-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "rt-checkout-tracker",
  storageBucket: "rt-checkout-tracker.firebasestorage.app",
  messagingSenderId: "64761952473",
  appId: "1:64761952473:web:23797528d1fb376f0326c8"
};
const fbApp  = getApps().length ? getApp() : initializeApp(_cfg);
const db     = getDatabase(fbApp);

const REGION       = import.meta.env.VITE_REGION || '';
const REGION_LABEL = REGION ? REGION.charAt(0).toUpperCase()+REGION.slice(1) : 'Hamilton';
const rp           = p => REGION ? `${REGION}/${p}` : p;
const fbSet        = (path,data) => set(ref(db, rp(path)), data).catch(console.error);
const toArr        = v => !v?[]:Array.isArray(v)?v.filter(Boolean):Object.values(v).filter(Boolean);
const fmtTime      = iso => iso?new Date(iso).toLocaleTimeString("en-NZ",{hour:"2-digit",minute:"2-digit"}):"—";
const fmtDate      = iso => iso?new Date(iso).toLocaleDateString("en-NZ",{day:"2-digit",month:"short",year:"numeric"}):"—";
const todayKey     = () => new Date().toISOString().split('T')[0];
const sortNums     = arr => [...arr].sort((a,b)=>a-b);

const GROUP_COLORS = [
  {id:"purple", light:"#f3e8ff",dark:"#9333ea"},{id:"indigo", light:"#e0e7ff",dark:"#4f46e5"},
  {id:"violet", light:"#ede9fe",dark:"#7c3aed"},{id:"fuchsia",light:"#fae8ff",dark:"#c026d3"},
  {id:"sky",    light:"#e0f2fe",dark:"#0284c7"},{id:"cyan",   light:"#cffafe",dark:"#0891b2"},
];
const GC         = Object.fromEntries(GROUP_COLORS.map(c=>[c.id,c]));
const getRtGroup = (n,groups) => (groups||[]).find(g=>(g.rts||[]).includes(n))||null;

// ── PIN pad ───────────────────────────────────────────────────────────────────
function PinPad({ value, onChange, onComplete }) {
  const keys=['1','2','3','4','5','6','7','8','9','','0','⌫'];
  const tap=d=>{
    if(d==='⌫'){ onChange(value.slice(0,-1)); return; }
    if(value.length>=4) return;
    const next=value+d; onChange(next);
    if(next.length===4) onComplete(next);
  };
  return (
    <div>
      <div className="flex justify-center gap-4 mb-8">
        {[0,1,2,3].map(i=>(
          <div key={i} className={`w-4 h-4 rounded-full border-2 transition-all ${i<value.length?'bg-blue-600 border-blue-600 scale-110':'border-slate-300'}`}/>
        ))}
      </div>
      <div className="grid grid-cols-3 gap-3 max-w-xs mx-auto">
        {keys.map((k,i)=> k?(
          <button key={i} onClick={()=>tap(k)}
            className={`h-16 rounded-2xl text-2xl font-semibold active:scale-95 transition-all
              ${k==='⌫'?'bg-slate-100 text-slate-500 hover:bg-slate-200':'bg-white text-slate-800 shadow-sm border border-slate-200 hover:bg-slate-50'}`}>
            {k}
          </button>
        ):<div key={i}/>)}
      </div>
    </div>
  );
}

// ── Main app ──────────────────────────────────────────────────────────────────
export default function StmsApp() {
  const [phase,setPhase]           = useState('loading'); // loading|select|pin|board
  const [stmsList,setStmsList]     = useState([]);
  const [selectedStms,setSelectedStms] = useState(null);
  const [pinValue,setPinValue]     = useState('');
  const [pinError,setPinError]     = useState('');

  const [log,setLog]               = useState([]);
  const [todayTcs,setTodayTcs]     = useState([]);
  const [rtGroups,setRtGroups]     = useState([]);
  const [connected,setConnected]   = useState(false);

  const [assignTarget,setAssignTarget] = useState(null); // {logId,gearType,num,current}
  const [recentCrew,setRecentCrew] = useState([]);
  const [tcFilter,setTcFilter]     = useState('');

  // Load STMS list for login
  useEffect(()=>{
    const unsub=onValue(ref(db,rp('staff')),snap=>{
      const all=toArr(snap.val());
      setStmsList(all.filter(s=>s.role==='STMS').sort((a,b)=>a.name.localeCompare(b.name)));
      setPhase('select');
    });
    return()=>unsub();
  },[]);

  // Load board data after login
  useEffect(()=>{
    if(phase!=='board'||!selectedStms) return;

    const unsubLog=onValue(ref(db,rp('log')),snap=>{
      setLog(toArr(snap.val()).filter(e=>e?.name));
    });
    const unsubSettings=onValue(ref(db,rp('settings')),snap=>{
      const d=snap.val()||{};
      setRtGroups(toArr(d.rtGroups).map(g=>({...g,rts:toArr(g.rts)})));
    });
    const unsubConn=onValue(ref(db,'.info/connected'),snap=>setConnected(snap.val()===true));

    get(ref(db,rp(`schedule/${todayKey()}/${selectedStms.id}`))).then(snap=>{
      if(snap.exists()){ const d=snap.val(); setTodayTcs(Array.isArray(d)?d:Object.values(d)); }
      else setTodayTcs([]);
    });

    return()=>{ unsubLog(); unsubSettings(); unsubConn(); };
  },[phase,selectedStms]);

  const handlePinComplete=pin=>{
    if(!selectedStms.pin){ setPinError('No PIN set — ask your manager to set one in the Staff tab.'); setPinValue(''); return; }
    if(pin!==selectedStms.pin){ setPinError('Incorrect PIN. Try again.'); setPinValue(''); return; }
    setPinError(''); setPhase('board');
  };

  const assignTc=(logId,gearType,num,tcName)=>{
    fbSet(`log/${logId}/tcAssignments/${gearType}_${num}`, tcName||null);
    setAssignTarget(null); setTcFilter('');
  };

  const getAssignment=(entry,gearType,num)=>entry?.tcAssignments?.[`${gearType}_${num}`]||null;

  const myCheckouts=log.filter(e=>e.name===selectedStms?.name&&!e.returnedAt);
  const filteredTcs=tcFilter?todayTcs.filter(tc=>tc.toLowerCase().includes(tcFilter.toLowerCase())):todayTcs;

  const logout=()=>{ setPhase('select'); setSelectedStms(null); setLog([]); setTodayTcs([]); setPinValue(''); setPinError(''); };

  // ── LOADING ──────────────────────────────────────────────────────────────────
  if(phase==='loading') return (
    <div className="flex flex-col items-center justify-center h-screen gap-3 text-slate-400 font-sans">
      <div className="text-3xl animate-pulse">📻</div>
      <p className="text-sm">Loading…</p>
    </div>
  );

  // ── SELECT NAME ──────────────────────────────────────────────────────────────
  if(phase==='select') return (
    <div className="min-h-screen bg-slate-100 font-sans">
      <div className="bg-blue-800 text-white px-4 py-4 text-center shadow-md">
        <div className="font-bold text-lg">📻 Site Tracker</div>
        <div className="text-blue-300 text-sm">{REGION_LABEL}</div>
      </div>
      <div className="px-4 py-8 max-w-sm mx-auto">
        <h2 className="text-xl font-bold text-slate-800 mb-1 text-center">Who are you?</h2>
        <p className="text-sm text-slate-500 text-center mb-6">Select your name to continue</p>
        {stmsList.length===0?(
          <div className="text-center text-slate-400 text-sm py-12">No STMSs found. Ask your manager to add staff members.</div>
        ):(
          <div className="flex flex-col gap-2">
            {stmsList.map(s=>(
              <button key={s.id} onClick={()=>{setSelectedStms(s);setPinValue('');setPinError('');setPhase('pin');}}
                className="w-full bg-white rounded-2xl shadow-sm border border-slate-200 px-5 py-4 text-left hover:border-blue-400 hover:bg-blue-50 active:scale-95 transition-all flex items-center justify-between">
                <span className="font-semibold text-slate-800 text-base">{s.name}</span>
                <span className="text-blue-400 text-lg">›</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );

  // ── PIN ENTRY ────────────────────────────────────────────────────────────────
  if(phase==='pin') return (
    <div className="min-h-screen bg-slate-100 font-sans">
      <div className="bg-blue-800 text-white px-4 py-3 flex items-center gap-3 shadow-md">
        <button onClick={()=>{setPhase('select');setPinValue('');setPinError('');}} className="text-blue-200 hover:text-white text-2xl leading-none">‹</button>
        <div>
          <div className="font-bold">📻 Site Tracker</div>
          <div className="text-blue-300 text-xs">{selectedStms?.name}</div>
        </div>
      </div>
      <div className="px-4 py-10 max-w-sm mx-auto">
        <h2 className="text-xl font-bold text-slate-800 mb-2 text-center">Enter PIN</h2>
        {pinError?(
          <p className="text-sm text-red-500 text-center mb-6 bg-red-50 rounded-xl px-3 py-2">{pinError}</p>
        ):(
          <p className="text-sm text-slate-500 text-center mb-6">Enter your 4-digit PIN</p>
        )}
        <PinPad value={pinValue} onChange={v=>{setPinValue(v);if(pinError)setPinError('');}} onComplete={handlePinComplete}/>
      </div>
    </div>
  );

  // ── BOARD ────────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-slate-100 font-sans">
      <div className="bg-blue-800 text-white px-4 py-3 flex items-center justify-between shadow-md sticky top-0 z-20">
        <div className="flex items-center gap-2">
          <span className="font-bold">📻 Site Tracker</span>
          <span title={connected?"Connected":"Reconnecting…"} className={`w-2 h-2 rounded-full ml-1 ${connected?"bg-green-400":"bg-yellow-400 animate-pulse"}`}/>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-blue-200 text-xs truncate max-w-[120px]">{selectedStms.name}</span>
          <button onClick={logout} className="text-xs bg-blue-700 hover:bg-blue-600 px-3 py-1.5 rounded-lg transition shrink-0">Log out</button>
        </div>
      </div>

      <div className="max-w-xl mx-auto px-4 py-5">
        {myCheckouts.length===0?(
          <div className="text-center py-24 text-slate-400">
            <div className="text-5xl mb-3">📭</div>
            <p className="font-medium text-slate-500">No active checkouts</p>
            <p className="text-sm mt-1">Your gear will appear here once checked out from the RT room</p>
          </div>
        ):(
          <div className="flex flex-col gap-4">
            {myCheckouts.map(checkout=>{
              const rts=sortNums(checkout.rts||[]);
              const wands=sortNums(checkout.wands||[]);
              const lights=sortNums(checkout.lights||[]);
              const total=rts.length+wands.length+lights.length;
              const assigned=Object.values(checkout.tcAssignments||{}).filter(Boolean).length;
              return (
                <div key={checkout.id} className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                  {/* Card header */}
                  <div className="bg-slate-50 px-4 py-3 border-b border-slate-100 flex items-center justify-between">
                    <div className="text-sm">
                      <span className="font-semibold text-slate-800">Out {fmtTime(checkout.timeOut)}</span>
                      <span className="text-slate-400"> · {fmtDate(checkout.timeOut)}</span>
                      {checkout.channel&&<span className="ml-2 bg-blue-100 text-blue-700 text-xs font-bold px-2 py-0.5 rounded-lg">Ch. {checkout.channel}</span>}
                    </div>
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${assigned===total?'bg-green-100 text-green-700':'bg-orange-100 text-orange-600'}`}>
                      {assigned}/{total} assigned
                    </span>
                  </div>

                  <div className="p-4 flex flex-col gap-4">
                    {/* RTs */}
                    {rts.length>0&&(
                      <div>
                        <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">📻 RTs</p>
                        <div className="grid grid-cols-4 sm:grid-cols-5 gap-2">
                          {rts.map(n=>{
                            const tc=getAssignment(checkout,'rt',n);
                            const grp=getRtGroup(n,rtGroups); const gc=grp?GC[grp.color]:null;
                            return (
                              <button key={n} onClick={()=>{setAssignTarget({logId:checkout.id,gearType:'rt',num:n,current:tc});setTcFilter('');}}
                                className="rounded-xl p-2 text-center border-2 active:scale-95 transition-all"
                                style={gc?{backgroundColor:gc.light,borderColor:tc?gc.dark:'#e2e8f0'}:{backgroundColor:tc?'#eff6ff':'#f8fafc',borderColor:tc?'#3b82f6':'#e2e8f0'}}>
                                <div className="text-base font-bold leading-tight" style={gc?{color:gc.dark}:{color:'#1e293b'}}>{n}</div>
                                <div className="text-xs mt-0.5 truncate leading-tight" style={{color:'#64748b',fontSize:'10px'}}>
                                  {tc?tc.split(' ')[0]:<span style={{color:'#cbd5e1'}}>—</span>}
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}
                    {/* Wands */}
                    {wands.length>0&&(
                      <div>
                        <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">🟡 Wands</p>
                        <div className="grid grid-cols-4 sm:grid-cols-5 gap-2">
                          {wands.map(n=>{
                            const tc=getAssignment(checkout,'wand',n);
                            return (
                              <button key={n} onClick={()=>{setAssignTarget({logId:checkout.id,gearType:'wand',num:n,current:tc});setTcFilter('');}}
                                className={`rounded-xl p-2 text-center border-2 active:scale-95 transition-all ${tc?'bg-yellow-50 border-yellow-400':'bg-slate-50 border-slate-200'}`}>
                                <div className="text-base font-bold text-slate-800 leading-tight">{n}</div>
                                <div className="text-xs mt-0.5 truncate text-slate-400 leading-tight" style={{fontSize:'10px'}}>{tc?tc.split(' ')[0]:'—'}</div>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}
                    {/* Lights */}
                    {lights.length>0&&(
                      <div>
                        <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">💡 Lights</p>
                        <div className="grid grid-cols-4 sm:grid-cols-5 gap-2">
                          {lights.map(n=>{
                            const tc=getAssignment(checkout,'light',n);
                            return (
                              <button key={n} onClick={()=>{setAssignTarget({logId:checkout.id,gearType:'light',num:n,current:tc});setTcFilter('');}}
                                className={`rounded-xl p-2 text-center border-2 active:scale-95 transition-all ${tc?'bg-orange-50 border-orange-400':'bg-slate-50 border-slate-200'}`}>
                                <div className="text-base font-bold text-slate-800 leading-tight">{n}</div>
                                <div className="text-xs mt-0.5 truncate text-slate-400 leading-tight" style={{fontSize:'10px'}}>{tc?tc.split(' ')[0]:'—'}</div>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Assignment bottom sheet ── */}
      {assignTarget&&(
        <div className="fixed inset-0 z-50 flex flex-col justify-end font-sans">
          <div className="absolute inset-0 bg-black bg-opacity-40" onClick={()=>{setAssignTarget(null);setTcFilter('');}}/>
          <div className="relative bg-white rounded-t-3xl shadow-2xl max-h-[80vh] flex flex-col">
            {/* Handle + header */}
            <div className="px-5 pt-4 pb-3 border-b border-slate-100 shrink-0">
              <div className="w-10 h-1 bg-slate-300 rounded-full mx-auto mb-4"/>
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-bold text-slate-800 text-base">
                    Assign {assignTarget.gearType==='rt'?'📻 RT':assignTarget.gearType==='wand'?'🟡 Wand':'💡 Light'} #{assignTarget.num}
                  </h3>
                  {assignTarget.current&&(
                    <p className="text-xs text-slate-500 mt-0.5">Currently: <span className="font-medium text-slate-700">{assignTarget.current}</span></p>
                  )}
                </div>
                {assignTarget.current&&(
                  <button onClick={()=>assignTc(assignTarget.logId,assignTarget.gearType,assignTarget.num,null)}
                    className="text-xs text-red-500 hover:text-red-700 font-medium shrink-0 ml-3">
                    Remove
                  </button>
                )}
              </div>
            </div>

            {/* Search */}
            <div className="px-4 py-3 shrink-0">
              <input autoFocus className="w-full border border-slate-300 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Search TCs or type a name…" value={tcFilter} onChange={e=>setTcFilter(e.target.value)}/>
            </div>

            {/* TC list */}
            <div className="flex-1 overflow-y-auto px-4 pb-8">
              {filteredTcs.length>0&&(
                <>
                  {tcFilter===''&&<p className="text-xs text-slate-400 mb-2 font-semibold uppercase tracking-wide">Today's TCs</p>}
                  <div className="flex flex-col gap-1.5">
                    {filteredTcs.map(tc=>(
                      <button key={tc} onClick={()=>assignTc(assignTarget.logId,assignTarget.gearType,assignTarget.num,tc)}
                        className={`w-full text-left px-4 py-3.5 rounded-xl font-medium text-sm transition-all active:scale-95
                          ${assignTarget.current===tc?'bg-blue-600 text-white shadow-sm':'bg-slate-50 text-slate-800 hover:bg-blue-50 hover:text-blue-700'}`}>
                        {tc}
                      </button>
                    ))}
                  </div>
                </>
              )}

              {/* Manual entry if typed name not in list */}
              {tcFilter&&!filteredTcs.some(tc=>tc.toLowerCase()===tcFilter.toLowerCase())&&(
                <div className="mt-3">
                  <button onClick={()=>assignTc(assignTarget.logId,assignTarget.gearType,assignTarget.num,tcFilter)}
                    className="w-full bg-blue-700 text-white font-semibold py-3.5 rounded-xl hover:bg-blue-600 active:scale-95 transition text-sm">
                    Assign to "{tcFilter}"
                  </button>
                </div>
              )}

              {todayTcs.length===0&&!tcFilter&&(
                <div className="text-center text-slate-400 text-sm py-6">
                  <p>No TC schedule uploaded for today.</p>
                  <p className="mt-1">Type a name above to assign manually.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}