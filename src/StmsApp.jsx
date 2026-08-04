import { useState, useEffect } from 'react';
import { initializeApp } from 'firebase/app';
import { getDatabase, ref, onValue, set } from 'firebase/database';

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
const REGION = import.meta.env.VITE_REGION || '';
const rp = p => REGION ? `${REGION}/${p}` : p;

const toArr = v => !v ? [] : Array.isArray(v) ? v.filter(Boolean) : Object.values(v).filter(Boolean);
const today = () => new Date().toISOString().split('T')[0];
const fmtTime = iso => iso ? new Date(iso).toLocaleTimeString("en-NZ", {hour:"2-digit", minute:"2-digit"}) : "—";
const sortNums = arr => [...arr].sort((a,b) => a-b);
const regionLabel = REGION ? REGION.charAt(0).toUpperCase() + REGION.slice(1) : 'Hamilton';

export default function StmsApp() {
  const [page, setPage]           = useState('login');
  const [staff, setStaff]         = useState([]);
  const [log, setLog]             = useState([]);
  const [schedule, setSchedule]   = useState({});
  const [connected, setConnected] = useState(false);
  const [loading, setLoading]     = useState(true);
  const [currentStms, setCurrentStms] = useState(null);
  const [selectedName, setSelectedName] = useState('');
  const [pin, setPin]             = useState('');
  const [pinError, setPinError]   = useState('');
  const [assigningItem, setAssigningItem] = useState(null); // {logId, key, label, current}
  const [extraTc, setExtraTc]     = useState('');

  // Restore session
  useEffect(() => {
    const saved = sessionStorage.getItem('stms_user');
    if (saved) { setCurrentStms(JSON.parse(saved)); setPage('dashboard'); }
  }, []);

  // Firebase listeners
  useEffect(() => {
    const loaded = { staff:false, log:false, schedule:false };
    const check = () => { if (Object.values(loaded).every(Boolean)) setLoading(false); };
    const unsubStaff = onValue(ref(db, rp('staff')), snap => {
      setStaff(toArr(snap.val())); loaded.staff=true; check();
    });
    const unsubLog = onValue(ref(db, rp('log')), snap => {
      setLog(toArr(snap.val())); loaded.log=true; check();
    });
    const unsubSchedule = onValue(ref(db, rp(`schedule/${today()}`)), snap => {
      setSchedule(snap.val() || {}); loaded.schedule=true; check();
    });
    const unsubConn = onValue(ref(db, '.info/connected'), snap => setConnected(snap.val()===true));
    return () => { unsubStaff(); unsubLog(); unsubSchedule(); unsubConn(); };
  }, []);

  const stmsList = staff.filter(s => s.role==='STMS').sort((a,b) => a.name.localeCompare(b.name));

  const login = () => {
    const stms = staff.find(s => s.name === selectedName);
    if (!stms)       return setPinError('Please select your name.');
    if (!stms.pin)   return setPinError('No PIN set — contact admin.');
    if (stms.pin !== pin) return setPinError('Incorrect PIN.');
    setCurrentStms(stms);
    sessionStorage.setItem('stms_user', JSON.stringify(stms));
    setPinError(''); setPage('dashboard');
  };

  const logout = () => {
    setCurrentStms(null);
    sessionStorage.removeItem('stms_user');
    setSelectedName(''); setPin(''); setPage('login');
  };

  // Today's TC list for current STMS
  const todayTcs = (() => {
    if (!currentStms) return [];
    const entry = Object.values(schedule).find(e => e.stmsName === currentStms.name);
    return entry?.tcs || [];
  })();

  // Active checkouts for this STMS (could be multiple shifts)
  const myCheckouts = currentStms
    ? log.filter(e => !e.returnedAt && e.name === currentStms.name)
    : [];

  // Assign TC to an item
  const assignTc = (logId, key, tcName) => {
    const entry = log.find(e => e.id === logId);
    if (!entry) return;
    const updated = { ...entry, tcAssignments: { ...(entry.tcAssignments||{}), [key]: tcName } };
    const newLog = log.map(e => e.id === logId ? updated : e);
    setLog(newLog);
    set(ref(db, rp('log')), newLog).catch(console.error);
    setAssigningItem(null); setExtraTc('');
  };

  const unassign = (logId, key) => {
    const entry = log.find(e => e.id === logId);
    if (!entry) return;
    const assignments = { ...(entry.tcAssignments||{}) };
    delete assignments[key];
    const newLog = log.map(e => e.id === logId ? { ...e, tcAssignments: assignments } : e);
    setLog(newLog);
    set(ref(db, rp('log')), newLog).catch(console.error);
    setAssigningItem(null);
  };

  // ── LOADING ──────────────────────────────────────────────────────────────────
  if (loading) return (
    <div className="flex flex-col items-center justify-center h-screen gap-3 text-slate-400">
      <div className="text-3xl animate-pulse">📡</div>
      <p className="text-sm">Connecting…</p>
    </div>
  );

  // ── LOGIN ────────────────────────────────────────────────────────────────────
  if (page === 'login') return (
    <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4 font-sans">
      <div className="bg-white rounded-2xl shadow-sm p-6 w-full max-w-sm">
        <div className="text-center mb-6">
          <div className="text-4xl mb-2">📡</div>
          <h1 className="text-lg font-bold text-slate-800">STMS Site Tracker</h1>
          <p className="text-sm text-slate-400 mt-0.5">{regionLabel}</p>
        </div>
        <div className="flex flex-col gap-3">
          <div>
            <label className="block text-sm font-semibold text-slate-600 mb-1">Your Name</label>
            <select className="w-full border border-slate-300 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              value={selectedName} onChange={e => { setSelectedName(e.target.value); setPinError(''); }}>
              <option value="">Select your name…</option>
              {stmsList.map(s => <option key={s.id} value={s.name}>{s.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-semibold text-slate-600 mb-1">PIN</label>
            <input type="password" inputMode="numeric" maxLength={4} placeholder="••••"
              className="w-full border border-slate-300 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-center text-2xl tracking-widest"
              value={pin}
              onChange={e => { setPin(e.target.value.replace(/\D/g,'').slice(0,4)); setPinError(''); }}
              onKeyDown={e => e.key==='Enter' && login()} />
          </div>
          {pinError && <p className="text-red-500 text-sm bg-red-50 rounded-lg px-3 py-2">{pinError}</p>}
          <button onClick={login} className="w-full bg-blue-700 text-white font-semibold py-3 rounded-xl hover:bg-blue-600 active:scale-95 transition text-sm mt-1">
            Log In
          </button>
        </div>
      </div>
    </div>
  );

  // ── DASHBOARD ────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-slate-100 font-sans">
      <div className="bg-blue-800 text-white px-4 py-3 flex items-center justify-between shadow-md sticky top-0 z-20">
        <div className="flex items-center gap-2">
          <span className="font-bold tracking-wide">📡 Site Tracker</span>
          <span title={connected?"Connected":"Reconnecting…"}
            className={`w-2 h-2 rounded-full ml-1 ${connected?"bg-green-400":"bg-yellow-400 animate-pulse"}`}/>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-blue-200 hidden sm:block">{currentStms?.name}</span>
          <button onClick={logout} className="text-xs px-3 py-1.5 rounded font-medium bg-blue-700 hover:bg-blue-600 text-blue-100 transition">
            Log out
          </button>
        </div>
      </div>

      <div className="max-w-xl mx-auto px-4 py-5">

        {/* Name banner on mobile */}
        <p className="text-sm text-slate-500 mb-4 sm:hidden">Logged in as <span className="font-semibold text-slate-700">{currentStms?.name}</span></p>

        {myCheckouts.length === 0 ? (
          <div className="text-center py-20 text-slate-400">
            <div className="text-4xl mb-3">📻</div>
            <p className="font-medium">No active checkouts</p>
            <p className="text-sm mt-1">Your RT assignments will appear here once gear is checked out from the gear room</p>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {myCheckouts.map(checkout => {
              const rts    = checkout.rts    || [];
              const wands  = checkout.wands  || [];
              const lights = checkout.lights || [];
              const assignments = checkout.tcAssignments || {};

              const GearGrid = ({ items, prefix, emoji, label }) => {
                if (!items.length) return null;
                return (
                  <div className="mt-3">
                    <p className="text-xs font-semibold text-slate-500 mb-2">{emoji} {label} — tap to assign</p>
                    <div className="grid gap-2" style={{gridTemplateColumns:'repeat(auto-fill,minmax(88px,1fr))'}}>
                      {sortNums(items).map(num => {
                        const key = prefix ? `${prefix}_${num}` : num;
                        const tc = assignments[key];
                        return (
                          <button key={key}
                            onClick={() => setAssigningItem({ logId:checkout.id, key, label:`${label.split(' ')[0]} #${num}`, current:tc })}
                            className={`rounded-xl p-2 text-center transition active:scale-95 border ${tc
                              ? 'bg-green-50 border-green-200 hover:border-green-400'
                              : 'bg-slate-50 border-slate-200 hover:border-blue-300 hover:bg-blue-50'}`}>
                            <div className="text-sm font-bold text-slate-700">{emoji} #{num}</div>
                            <div className={`text-xs mt-0.5 truncate leading-tight ${tc ? 'text-green-600 font-medium' : 'text-slate-400'}`}>
                              {tc || 'Unassigned'}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              };

              const assigned = Object.values(assignments).filter(Boolean).length;
              const total = rts.length + wands.length + lights.length;

              return (
                <div key={checkout.id} className="bg-white rounded-2xl shadow-sm p-4">
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-xs text-slate-400">Checked out {fmtTime(checkout.timeOut)}</p>
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${assigned===total && total>0 ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-700'}`}>
                      {assigned}/{total} assigned
                    </span>
                  </div>
                  <GearGrid items={rts}    prefix={null}    emoji="📻" label="RTs" />
                  <GearGrid items={wands}  prefix="wand"   emoji="🟡" label="Wands" />
                  <GearGrid items={lights} prefix="light"  emoji="💡" label="Lights" />
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Assignment bottom sheet */}
      {assigningItem && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex items-end justify-center z-30 p-4"
          onClick={e => { if (e.target===e.currentTarget) { setAssigningItem(null); setExtraTc(''); } }}>
          <div className="bg-white rounded-2xl w-full max-w-sm p-5 shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-slate-800">Assign {assigningItem.label}</h3>
              <button onClick={() => { setAssigningItem(null); setExtraTc(''); }} className="text-slate-400 hover:text-slate-600 text-xl leading-none">✕</button>
            </div>

            {assigningItem.current && (
              <div className="bg-green-50 border border-green-200 rounded-xl px-3 py-2.5 mb-3 flex items-center justify-between">
                <span className="text-sm text-green-700 font-medium">Currently: {assigningItem.current}</span>
                <button onClick={() => unassign(assigningItem.logId, assigningItem.key)}
                  className="text-xs text-red-500 hover:text-red-700 ml-2 shrink-0">Unassign</button>
              </div>
            )}

            {todayTcs.length > 0 && (
              <div className="flex flex-col gap-2 mb-3 max-h-48 overflow-y-auto">
                {todayTcs.map(tc => (
                  <button key={tc} onClick={() => assignTc(assigningItem.logId, assigningItem.key, tc)}
                    className={`w-full text-left px-4 py-3 rounded-xl border text-sm font-medium transition active:scale-95 ${
                      assigningItem.current===tc
                        ? 'bg-blue-600 text-white border-blue-600'
                        : 'bg-slate-50 border-slate-200 text-slate-700 hover:border-blue-400 hover:bg-blue-50'
                    }`}>
                    {tc}
                  </button>
                ))}
              </div>
            )}

            {todayTcs.length === 0 && (
              <p className="text-sm text-slate-400 mb-3 text-center py-2">No TCs loaded for today — add manually below or ask admin to upload the schedule.</p>
            )}

            <div className={todayTcs.length > 0 ? "border-t border-slate-100 pt-3" : ""}>
              <p className="text-xs text-slate-500 mb-2">Add TC manually:</p>
              <div className="flex gap-2">
                <input className="flex-1 border border-slate-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="TC name" value={extraTc}
                  onChange={e => setExtraTc(e.target.value)}
                  onKeyDown={e => { if (e.key==='Enter' && extraTc.trim()) { assignTc(assigningItem.logId, assigningItem.key, extraTc.trim()); }}}/>
                <button onClick={() => { if (extraTc.trim()) assignTc(assigningItem.logId, assigningItem.key, extraTc.trim()); }}
                  className="shrink-0 bg-blue-700 text-white text-sm font-semibold px-4 py-2 rounded-xl hover:bg-blue-600 transition">
                  Assign
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}