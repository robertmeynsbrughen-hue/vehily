const partOrigins=['Châssis','Donneur','Achat'];
const partStates=['À commander','Commandée','Reçue','Montée'];
// Validate both legacy exports and current dossiers before replacing any data.
function readWorkshop(data) {
  const fail = field => { throw new Error(field); };
  if (!data || !Array.isArray(data.vehicles)) fail('Liste de véhicules absente');
  const safeId = /^[a-zA-Z0-9_-]{1,128}$/;
  function identifiers(rows, field, allowMissing = false) {
    const seen = new Set();
    for (const row of rows) {
      if (!row || typeof row !== 'object') fail(field);
      if (allowMissing && row.id == null) row.id = uid();
      if (typeof row.id !== 'string' || !safeId.test(row.id) || seen.has(row.id)) fail(field + ' : identifiant invalide ou répété');
      seen.add(row.id);
    }
  }
  identifiers(data.vehicles, 'Véhicules');
  for (const v of data.vehicles) {
    const check = (ok, field) => { if (!ok) fail('Véhicule ' + v.id + ' · ' + field); };
    check(typeof v.name === 'string' && v.name.trim(), 'nom');
    for (const k of 'subtitle plate owner status notes vin donorVin production factoryEngine paintCode paintName upholstery identitySource options donorModel installedEngine swapNotes'.split(' '))
      check(v[k] == null || typeof v[k] === 'string', k);
    for (const k of ['tasks','logs','expenses','maintenance','faults','parts']) {
      if (['maintenance','faults','parts'].includes(k) && v[k] == null) v[k] = [];
      check(Array.isArray(v[k]), k);
      identifiers(v[k], v.id + ' · ' + k, k === 'logs' || k === 'expenses');
    }
    for (const t of v.tasks) check(typeof t.text === 'string' && typeof t.done === 'boolean', 'tâche');
    for (const l of v.logs) check(typeof l.title === 'string' && typeof l.body === 'string' && [l.kind,l.date].every(x=>x == null || typeof x === 'string'), 'journal');
    for (const e of v.expenses) check(typeof e.title === 'string' && Number.isFinite(e.amount) && e.amount >= 0 && (e.date == null || typeof e.date === 'string'), 'dépense');
    check(v.mileage == null || validKm(v.mileage), 'kilométrage');
    if (v.road == null) v.road = null;
    else check(typeof v.road === 'object' && ['roulante','immobilisée'].includes(v.road.state)
      && ['reason','next'].every(k => typeof v.road[k] === 'string')
      && (v.road.state === 'roulante' || v.road.reason.trim())
      && (v.road.since == null || validDate(v.road.since)), 'état de route');
    for(const part of v.parts){
      check(typeof part.name==='string' && part.name.trim(), 'nom de pièce');
      check(typeof part.oem==='string', 'référence OEM');
      check(partOrigins.includes(part.origin) && partStates.includes(part.state), 'provenance ou état de pièce');
      check(part.price===null || (Number.isFinite(part.price) && part.price>=0), 'prix de pièce');
    }
    for (const m of v.maintenance) {
      check([undefined,'service','ct'].includes(m.type) && (m.type!=='ct'||validDate(m.date)), 'date du contrôle technique');
      check([m.leadDays,m.leadKm].every(n=>n==null||validKm(n)), 'préavis');
    }
    for (const f of v.faults) {
      check(typeof f.title==='string' && f.title.trim() && typeof f.closed==='boolean' && typeof f.next==='string' && Array.isArray(f.events) && f.events.length, 'dossier de panne');
      for(const e of f.events)check(e && validDate(e.date) && typeof e.kind==='string' && typeof e.text==='string','suivi de panne');
    }
    for (const m of v.maintenance) check(typeof m.title === 'string' && m.title.trim() && (m.lastKm == null || validKm(m.lastKm)) && (m.nextKm == null || validKm(m.nextKm)) && (!m.date || validDate(m.date)) && (m.nextKm != null || validDate(m.date)), 'échéance entretien');
  }
  return {vehicles:data.vehicles};
}
const validKm = n => Number.isSafeInteger(n) && n >= 0;
function validDate(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const value = new Date(s+'T00:00:00Z');
  return Number.isFinite(+value) && value.toISOString().slice(0,10) === s;
}
let snapshot, loadError;
function initialWorkshop() {
  try {
    snapshot = localStorage.getItem(KEY);
    return readWorkshop(snapshot === null ? structuredClone(seed) : JSON.parse(snapshot));
  } catch (err) {
    loadError = 'Lecture des dossiers impossible : ' + err.message;
    return {vehicles:[]};
  }
}
async function commitWorkshop(change, { restore = false } = {}) {
  try {
    if (loadError && !restore) throw Error(loadError);
    if (!navigator.locks) throw Error('Ouvre Véhily en HTTPS pour enregistrer en toute sécurité.');
    return await navigator.locks.request(KEY, () => {
      const raw = localStorage.getItem(KEY);
      if (raw !== snapshot) {
        if (loadError) throw Error("Les données ont changé. Recharge la page avant de restaurer.");
        const fresh = readWorkshop(raw === null ? structuredClone(seed) : JSON.parse(raw));
        snapshot = raw; db = fresh; render();
        throw Error('Un autre onglet a modifié les dossiers. Ta saisie est conservée. Vérifie puis réessaie.');
      }
      const next = structuredClone(db);
      change(next);
      const serialized = JSON.stringify(readWorkshop(next));
      localStorage.setItem(KEY, serialized);
      db = next; snapshot = serialized; loadError = null; render();
      if (typeof vehilySync !== 'undefined') vehilySync.changed();
      return true;
    });
  } catch (err) {
    alert('Modification non enregistrée. ' + err.message);
    return false;
  }
}
