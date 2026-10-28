import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { fileURLToPath } from 'node:url';
import { auditHash } from './crypto.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.resolve(process.env.DATA_DIR || path.resolve(__dirname, '../data'));
const storageDir = path.resolve(process.env.EVIDENCE_DIR || path.resolve(__dirname, '../storage/evidence'));
const dbFile = path.join(dataDir, 'cyberincident.json');
fs.mkdirSync(dataDir, { recursive: true });
fs.mkdirSync(storageDir, { recursive: true });

const empty = { nextIds:{users:1,incidents:1,evidence:1,custody_events:1,audit_log:1}, users:[], incidents:[], evidence:[], custody_events:[], audit_log:[] };
let state;
try {
  // In production, never bootstrap from a developer's bundled default data file.
  // Persistent deployments should explicitly set DATA_DIR to their mounted volume.
  const ignoreDefaultProductionData = process.env.NODE_ENV === 'production' && !process.env.DATA_DIR;
  state = !ignoreDefaultProductionData && fs.existsSync(dbFile)
    ? JSON.parse(fs.readFileSync(dbFile, 'utf8'))
    : structuredClone(empty);
}
catch { state = structuredClone(empty); }
for (const k of Object.keys(empty.nextIds)) state.nextIds[k] ??= empty.nextIds[k];
for (const k of ['users','incidents','evidence','custody_events','audit_log']) state[k] ??= [];

function save() {
  const tmp = `${dbFile}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2), 'utf8');
  fs.renameSync(tmp, dbFile);
}
function id(table) { const n = state.nextIds[table]++; return n; }
function now() { return new Date().toISOString(); }
function clone(v) { return JSON.parse(JSON.stringify(v)); }
function getUser(idValue) { return state.users.find(u => Number(u.id) === Number(idValue)); }
function findById(table, idValue) { return state[table].find(x => Number(x.id) === Number(idValue)); }
function count(table, predicate=()=>true) { return state[table].filter(predicate).length; }

export const db = {
  prepare(sql) {
    // Compatibility shim for the original route layer is intentionally not used.
    throw new Error(`db.prepare n'est pas disponible pour cette version: ${sql}`);
  }
};

export const store = {
  users: () => clone(state.users),
  incidents: () => clone(state.incidents),
  evidence: () => clone(state.evidence),
  custody: () => clone(state.custody_events),
  audit: () => clone(state.audit_log),
  userById: getUser,
  userByEmail(email) { return state.users.find(u => u.email.toLowerCase() === email.toLowerCase()); },
  incidentById: idValue => findById('incidents', idValue),
  evidenceById: idValue => findById('evidence', idValue),
  addUser(input) { const u={id:id('users'),...input}; state.users.push(u); save(); return clone(u); },
  addIncident(input) { const i={id:id('incidents'),...input}; state.incidents.push(i); save(); return clone(i); },
  updateIncident(idValue, patch) { const i=findById('incidents',idValue); if(!i)return null; Object.assign(i,patch); save(); return clone(i); },
  addEvidence(input) { const e={id:id('evidence'),...input}; state.evidence.push(e); save(); return clone(e); },
  addCustody(input) { const e={id:id('custody_events'),...input}; state.custody_events.push(e); save(); return clone(e); },
  addAudit(input) { const e={id:id('audit_log'),...input}; state.audit_log.push(e); save(); return clone(e); },
  stats() {
    return {
      incidents: count('incidents'),
      open: count('incidents', i => i.status !== 'CLOSED'),
      critical: count('incidents', i => i.severity === 'CRITICAL' && i.status !== 'CLOSED'),
      evidence: count('evidence'), audit: count('audit_log')
    };
  },
  save
};

export function appendAudit(actorId, action, entityType, entityId, details={}) {
  const previous = state.audit_log.at(-1);
  const previousHash = previous?.entry_hash ?? 'GENESIS';
  const eventTime = now();
  const payload = { actorId: actorId ?? null, action, entityType, entityId:String(entityId), details, eventTime };
  const entryHash = auditHash(previousHash, payload);
  return store.addAudit({actor_id:actorId ?? null, action, entity_type:entityType, entity_id:String(entityId), details_json:JSON.stringify(details), event_time:eventTime, previous_hash:previousHash, entry_hash:entryHash});
}

export function verifyAuditChain() {
  let previousHash='GENESIS';
  for (const row of state.audit_log) {
    let details={}; try { details=JSON.parse(row.details_json); } catch { return {valid:false,brokenAt:row.id,reason:'JSON invalide'}; }
    const payload={actorId:row.actor_id ?? null,action:row.action,entityType:row.entity_type,entityId:row.entity_id,details,eventTime:row.event_time};
    const expected=auditHash(previousHash,payload);
    if(row.previous_hash!==previousHash || row.entry_hash!==expected) return {valid:false,brokenAt:row.id,reason:'Chaîne rompue'};
    previousHash=row.entry_hash;
  }
  return {valid:true,entries:state.audit_log.length,head:previousHash};
}

export function seed() {
  // Aucun incident n'est injecté : ils proviennent du moteur de détection SNMP.
  if (state.users.length === 0) {
    if (process.env.NODE_ENV === 'production') {
      const email = String(process.env.BOOTSTRAP_ADMIN_EMAIL || '').trim().toLowerCase();
      const password = String(process.env.BOOTSTRAP_ADMIN_PASSWORD || '');
      if (!email || password.length < 12) {
        throw new Error('Définissez BOOTSTRAP_ADMIN_EMAIL et un BOOTSTRAP_ADMIN_PASSWORD de 12 caractères minimum pour initialiser le compte admin.');
      }
      store.addUser({
        name: process.env.BOOTSTRAP_ADMIN_NAME || 'Administrateur',
        email,
        password_hash: bcrypt.hashSync(password, 12),
        role: 'ADMIN',
        active: true,
        created_at: now()
      });
      return;
    }

    store.addUser({name:'Administrateur',email:'admin@cyber.local',password_hash:bcrypt.hashSync('Admin@12345',12),role:'ADMIN',active:true,created_at:now()});
    store.addUser({name:'Enquêteur principal',email:'investigator@cyber.local',password_hash:bcrypt.hashSync('Investigator@12345',12),role:'INVESTIGATOR',active:true,created_at:now()});
    store.addUser({name:'Auditeur',email:'auditor@cyber.local',password_hash:bcrypt.hashSync('Auditor@12345',12),role:'AUDITOR',active:true,created_at:now()});
  }
}

export { storageDir, now, clone };
seed();
