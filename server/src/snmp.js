import crypto from 'node:crypto';
import { appendAudit, now, store } from './db.js';
import { severityFor, severityReason, severityRules } from './severity.js';

let snmp = null;
try {
  const mod = await import('net-snmp');
  snmp = mod.default ?? mod;
} catch (error) {
  console.error('[SNMP] net-snmp indisponible:', error.message);
}

const OIDS = Object.freeze({
  sysName: '1.3.6.1.2.1.1.5.0',
  sysUpTime: '1.3.6.1.2.1.1.3.0',
  ifDescr: '1.3.6.1.2.1.2.2.1.2',
  ifOperStatus: '1.3.6.1.2.1.2.2.1.8',
  ifAdminStatus: '1.3.6.1.2.1.2.2.1.7',
  ifInErrors: '1.3.6.1.2.1.2.2.1.14',
  ifOutErrors: '1.3.6.1.2.1.2.2.1.20'
});

const DEMO_DEVICES = Object.freeze([
  { name: 'LAB-ROUTER-01', host: '192.0.2.1', version: '2c', type: 'Routeur' },
  { name: 'LAB-SWITCH-01', host: '192.0.2.2', version: '2c', type: 'Switch' },
  { name: 'LAB-SERVER-01', host: '192.0.2.10', version: '2c', type: 'Serveur' },
  { name: 'LAB-PC-01', host: '192.0.2.20', version: '2c', type: 'Ordinateur' },
  { name: 'LAB-PHONE-01', host: '192.0.2.30', version: '2c', type: 'Téléphone' }
]);

const monitorState = {
  running: false,
  startedAt: null,
  lastCycleAt: null,
  nextCycleAt: null,
  lastCycleDurationMs: null,
  lastError: null,
  pollCount: 0,
  devices: new Map(),
  events: []
};

const timers = new Set();
let cycleRunning = false;

function parseDevices() {
  try {
    const raw = JSON.parse(process.env.SNMP_DEVICES || '[]');
    if (!Array.isArray(raw)) return [];
    return raw.filter(device => device && device.host).map(device => ({
      name: String(device.name || device.host),
      host: String(device.host),
      type: String(device.type || 'Équipement SNMP'),
      community: String(device.community || 'public'),
      version: String(device.version || '2c'),
      timeout: Number(device.timeout || 2000),
      retries: Number(device.retries ?? 1),
      port: Number(device.port || 161)
    }));
  } catch (error) {
    monitorState.lastError = `SNMP_DEVICES invalide: ${error.message}`;
    return [];
  }
}

function isDemo() {
  return String(process.env.SNMP_DEMO_MODE || 'false').toLowerCase() === 'true';
}

function demoTargets() {
  const configured = parseDevices();
  return configured.length ? configured : DEMO_DEVICES.map(device => ({ ...device }));
}

function makeReference() {
  let reference;
  do {
    reference = `INC-${new Date().getUTCFullYear()}-${crypto.randomInt(1, 10000).toString().padStart(4, '0')}`;
  } while (store.incidents().some(incident => incident.reference === reference));
  return reference;
}

function detectionKey(device, signal) {
  return [device.host, signal.type, signal.interface || signal.ifIndex || ''].join(':');
}

function activeDuplicate(device, signal) {
  const key = detectionKey(device, signal);
  return store.incidents().some(incident => incident.status !== 'CLOSED' && incident.detection_key === key);
}

function addEvent(event) {
  monitorState.events.unshift({ id: crypto.randomUUID(), at: now(), ...event });
  monitorState.events = monitorState.events.slice(0, 100);
}

export function createAutomaticIncident({ device, signal, actorId = null }) {
  const severity = severityFor(signal);
  const key = detectionKey(device, signal);

  addEvent({
    kind: 'DETECTION',
    source: 'SNMP',
    device: device.name,
    host: device.host,
    signal: signal.type,
    severity,
    demo: Boolean(signal.demo),
    interface: signal.interface || null,
    duplicate: activeDuplicate(device, signal)
  });

  if (activeDuplicate(device, signal)) return null;

  const createdAt = now();
  const title = signal.interface
    ? `${signal.type === 'INTERFACE_DOWN' ? 'Interface indisponible' : 'Alerte SNMP'} — ${device.name} / ${signal.interface}`
    : `${signal.type.replaceAll('_', ' ')} — ${device.name}`;

  const description = [
    'Incident créé automatiquement par le moteur de supervision SNMP.',
    `Équipement : ${device.name} (${device.host}).`,
    `Signal : ${signal.type}.`,
    `Criticité calculée : ${severity}.`,
    `Règle : ${severityReason(signal)}`,
    signal.message || 'Aucun détail supplémentaire.',
    `Source : SNMP${signal.demo ? ' — mode démonstration' : ''}.`,
    `Détecté le : ${createdAt}.`
  ].join('\n');

  const incident = store.addIncident({
    reference: makeReference(),
    title,
    description,
    severity,
    status: 'OPEN',
    reporter: `SNMP:${device.name}`,
    created_by: actorId,
    detection_source: 'SNMP',
    detection_key: key,
    detection_signal: signal.type,
    detection_device: device.name,
    detection_host: device.host,
    severity_reason: severityReason(signal),
    created_at: createdAt,
    updated_at: createdAt
  });

  appendAudit(actorId, 'INCIDENT_AUTO_CREATED', 'INCIDENT', incident.id, {
    source: 'SNMP',
    automatic: true,
    device: device.name,
    host: device.host,
    signal,
    severity,
    severity_reason: severityReason(signal)
  });

  addEvent({
    kind: 'INCIDENT_CREATED',
    source: 'SNMP',
    incidentId: incident.id,
    reference: incident.reference,
    device: device.name,
    host: device.host,
    signal: signal.type,
    severity
  });

  console.log(`[SNMP] INCIDENT AUTO ${incident.reference} | ${severity} | ${signal.type} | ${device.host}`);
  return incident;
}

function snmpGet(session, oids) {
  return new Promise((resolve, reject) => {
    session.get(oids, (error, varbinds) => {
      if (error) return reject(error);
      resolve(varbinds || []);
    });
  });
}

function snmpSubtree(session, oid) {
  return new Promise((resolve, reject) => {
    const rows = [];
    session.subtree(
      oid,
      20,
      varbinds => rows.push(...varbinds),
      () => resolve(rows),
      error => reject(error)
    );
  });
}

function makeSession(device) {
  if (!snmp) throw new Error('Le paquet net-snmp n’est pas installé.');
  if (device.version === '3') {
    throw new Error('SNMPv3 doit être configuré avec les paramètres de sécurité du laboratoire avant utilisation.');
  }
  return snmp.createSession(device.host, device.community, {
    port: device.port,
    version: snmp.Version2c,
    timeout: device.timeout,
    retries: device.retries,
    transport: 'udp4'
  });
}

async function pollDevice(device) {
  const session = makeSession(device);
  try {
    const vars = await snmpGet(session, [OIDS.sysName, OIDS.sysUpTime]);
    const sysName = vars[0]?.value?.toString?.() || device.name;
    const sysUpTime = vars[1]?.value?.toString?.() || 'inconnu';

    const [descriptions, operStatuses, adminStatuses, inErrors, outErrors] = await Promise.all([
      snmpSubtree(session, OIDS.ifDescr),
      snmpSubtree(session, OIDS.ifOperStatus),
      snmpSubtree(session, OIDS.ifAdminStatus),
      snmpSubtree(session, OIDS.ifInErrors),
      snmpSubtree(session, OIDS.ifOutErrors)
    ]);

    const byIndex = new Map();
    for (const vb of descriptions) {
      const index = vb.oid.split('.').at(-1);
      byIndex.set(index, { ifIndex: index, name: vb.value?.toString?.() || `ifIndex ${index}` });
    }
    for (const vb of operStatuses) {
      const index = vb.oid.split('.').at(-1);
      byIndex.set(index, { ...(byIndex.get(index) || { ifIndex: index }), operStatus: Number(vb.value) });
    }
    for (const vb of adminStatuses) {
      const index = vb.oid.split('.').at(-1);
      byIndex.set(index, { ...(byIndex.get(index) || { ifIndex: index }), adminStatus: Number(vb.value) });
    }
    const inMap = new Map(inErrors.map(vb => [vb.oid.split('.').at(-1), Number(vb.value)]));
    const outMap = new Map(outErrors.map(vb => [vb.oid.split('.').at(-1), Number(vb.value)]));

    const interfaces = [...byIndex.values()].map(row => ({
      ...row,
      inErrors: inMap.get(row.ifIndex) ?? 0,
      outErrors: outMap.get(row.ifIndex) ?? 0
    }));

    return { name: device.name, host: device.host, sysName, sysUpTime, reachable: true, checkedAt: now(), interfaces };
  } finally {
    session.close();
  }
}

function processResult(device, result) {
  monitorState.devices.set(device.host, {
    ...result,
    version: device.version,
    state: 'UP',
    lastError: null
  });

  for (const intf of result.interfaces) {
    if (intf.operStatus === 2) {
      createAutomaticIncident({
        device: { ...device, name: result.sysName || device.name },
        signal: {
          type: 'INTERFACE_DOWN',
          interface: intf.name || `ifIndex ${intf.ifIndex}`,
          ifIndex: intf.ifIndex,
          message: `IF-MIB ifOperStatus indique DOWN. ifAdminStatus=${intf.adminStatus ?? 'inconnu'}.`
        }
      });
    }

    const errorThreshold = Number(process.env.SNMP_ERROR_THRESHOLD || 100);
    if ((intf.inErrors + intf.outErrors) >= errorThreshold) {
      createAutomaticIncident({
        device: { ...device, name: result.sysName || device.name },
        signal: {
          type: 'HIGH_ERROR_RATE',
          interface: intf.name || `ifIndex ${intf.ifIndex}`,
          ifIndex: intf.ifIndex,
          message: `Compteurs d’erreurs élevés : inErrors=${intf.inErrors}, outErrors=${intf.outErrors}. Seuil=${errorThreshold}.`
        }
      });
    }
  }
}

async function pollOne(device) {
  try {
    const result = await pollDevice(device);
    processResult(device, result);
  } catch (error) {
    monitorState.devices.set(device.host, {
      name: device.name,
      host: device.host,
      version: device.version,
      reachable: false,
      state: 'DOWN',
      checkedAt: now(),
      lastError: error.message
    });
    createAutomaticIncident({
      device,
      signal: { type: 'DEVICE_UNREACHABLE', message: `Équipement SNMP injoignable : ${error.message}` }
    });
  }
}

let demoStep = 0;
function demoCycle() {
  const devices = demoTargets();
  const scenario = String(process.env.SNMP_DEMO_SCENARIO || 'INTERFACE_DOWN');
  const signal = scenario === 'AUTH_FAILURE'
    ? { type: 'AUTH_FAILURE', message: 'Échec d’authentification SNMP simulé par le laboratoire.', demo: true }
    : scenario === 'DEVICE_UNREACHABLE'
      ? { type: 'DEVICE_UNREACHABLE', message: 'Équipement de laboratoire simulé comme inaccessible.', demo: true }
      : scenario === 'HIGH_ERROR_RATE'
        ? { type: 'HIGH_ERROR_RATE', interface: 'Gi0/24', message: 'Taux d’erreurs simulé supérieur au seuil.', demo: true }
        : { type: 'INTERFACE_DOWN', interface: 'Gi0/24', message: 'SNMP IF-MIB simulé : ifOperStatus=down.', demo: true };

  demoStep += 1;
  for (const device of devices) {
    const simulatedSignal = { ...signal, demo: true };
    const incident = createAutomaticIncident({ device, signal: simulatedSignal });
    if (incident) console.log(`[SNMP-DEMO] cycle=${demoStep} -> ${incident.reference} | ${device.name}`);
    monitorState.devices.set(device.host, {
      ...device,
      reachable: signal.type !== 'DEVICE_UNREACHABLE',
      state: signal.type === 'DEVICE_UNREACHABLE' ? 'DOWN' : 'UP',
      sysName: device.name,
      checkedAt: now(),
      demo: true,
      lastSignal: signal.type,
      lastError: signal.type === 'DEVICE_UNREACHABLE' ? signal.message : null
    });
  }
}

const DEMO_SIGNALS = Object.freeze({
  AUTH_FAILURE: { type: 'AUTH_FAILURE', message: 'Échec d’authentification SNMP simulé par le laboratoire.' },
  CONFIG_CHANGE: { type: 'CONFIG_CHANGE', message: 'Changement de configuration SNMP simulé par le laboratoire.' },
  DEVICE_UNREACHABLE: { type: 'DEVICE_UNREACHABLE', message: 'Équipement de laboratoire simulé comme inaccessible.' },
  HIGH_ERROR_RATE: { type: 'HIGH_ERROR_RATE', interface: 'Gi0/24', message: 'Taux d’erreurs simulé supérieur au seuil.' },
  INTERFACE_DOWN: { type: 'INTERFACE_DOWN', interface: 'Gi0/24', message: 'Interface réseau indisponible simulée par le laboratoire.' },
  SNMP_TRAP: { type: 'SNMP_TRAP', message: 'Trap SNMP inattendu simulé par le laboratoire.' }
});

export function simulateSnmpScenario(scenario, actorId) {
  if (!isDemo()) {
    const error = new Error('La simulation est disponible uniquement en mode démonstration.');
    error.status = 403;
    throw error;
  }

  const template = DEMO_SIGNALS[scenario];
  if (!template) {
    const error = new Error('Scénario SNMP simulé non reconnu.');
    error.status = 400;
    throw error;
  }

  const devices = demoTargets();
  const alerts = devices.map(device => {
    const signal = { ...template, demo: true };
    const incident = createAutomaticIncident({ device, signal, actorId });
    const unreachable = signal.type === 'DEVICE_UNREACHABLE';
    monitorState.devices.set(device.host, {
      ...device,
      reachable: !unreachable,
      state: unreachable ? 'DOWN' : 'UP',
      sysName: device.name,
      checkedAt: now(),
      demo: true,
      lastSignal: signal.type,
      lastError: unreachable ? signal.message : null
    });
    return {
      device: device.name,
      host: device.host,
      signal: signal.type,
      severity: incident?.severity || severityFor(signal),
      incident: incident ? { id: incident.id, reference: incident.reference } : null,
      duplicate: !incident
    };
  });

  return {
    alerts,
    incidents: alerts.filter(alert => alert.incident).map(alert => alert.incident),
    targetCount: devices.length,
    simulatedOnly: true,
    status: getSnmpStatus()
  };
}

async function cycle() {
  if (cycleRunning) return;
  cycleRunning = true;
  const started = Date.now();
  monitorState.lastError = null;
  try {
    if (isDemo()) {
      demoCycle();
    } else {
      const devices = parseDevices();
      if (!devices.length) {
        monitorState.lastError = 'Aucun équipement SNMP configuré.';
      } else {
        for (const device of devices) await pollOne(device);
      }
    }
    monitorState.pollCount += 1;
  } catch (error) {
    monitorState.lastError = error.message;
    console.error('[SNMP] cycle:', error);
  } finally {
    monitorState.lastCycleAt = now();
    monitorState.lastCycleDurationMs = Date.now() - started;
    cycleRunning = false;
  }
}

export function getSnmpStatus() {
  const devices = parseDevices();
  const configured = isDemo()
    ? demoTargets().map(device => ({ ...device, demo: !devices.length || device.demo === true }))
    : devices;
  const runtimeDevices = configured.map(device => ({
    ...device,
    ...(monitorState.devices.get(device.host) || {}),
    configured: true
  }));

  return {
    enabled: monitorState.running,
    running: monitorState.running,
    mode: isDemo() ? 'DEMONSTRATION' : 'POLLING',
    library: Boolean(snmp),
    intervalMs: Math.max(10000, Number(process.env.SNMP_POLL_INTERVAL_MS || 60000)),
    trapPort: process.env.SNMP_TRAP_PORT ? Number(process.env.SNMP_TRAP_PORT) : null,
    pollCount: monitorState.pollCount,
    startedAt: monitorState.startedAt,
    lastCycleAt: monitorState.lastCycleAt,
    lastCycleDurationMs: monitorState.lastCycleDurationMs,
    lastError: monitorState.lastError,
    devices: runtimeDevices,
    incidents: store.incidents().filter(i => i.detection_source === 'SNMP').sort((a, b) => b.id - a.id).slice(0, 50),
    events: monitorState.events.slice(0, 50),
    rules: severityRules()
  };
}

export async function runSnmpCycle() {
  await cycle();
  return getSnmpStatus();
}

export function startSnmpMonitor() {
  if (monitorState.running) return getSnmpStatus();
  const intervalMs = Math.max(10000, Number(process.env.SNMP_POLL_INTERVAL_MS || 60000));
  monitorState.running = true;
  monitorState.startedAt = now();
  console.log(`[SNMP] moteur démarré | mode=${isDemo() ? 'DEMO' : 'POLLING'} | interval=${intervalMs}ms`);

  void cycle();
  const timer = setInterval(() => void cycle(), intervalMs);
  timers.add(timer);
  monitorState.nextCycleAt = new Date(Date.now() + intervalMs).toISOString();

  if (snmp && process.env.SNMP_TRAP_PORT) startTrapReceiver(Number(process.env.SNMP_TRAP_PORT));
  return getSnmpStatus();
}

function startTrapReceiver(port) {
  try {
    const receiver = snmp.createReceiver({ port, disableAuthorization: false, transport: 'udp4' }, (error, notification) => {
      if (error) {
        monitorState.lastError = error.message || String(error);
        return;
      }
      const source = notification?.rinfo?.address || 'unknown';
      const varbinds = notification?.pdu?.varbinds || [];
      const trapOid = varbinds.find(v => v.oid === '1.3.6.1.6.3.1.1.4.1.0')?.value?.toString?.() || '';
      const type = trapOid === '1.3.6.1.6.3.1.1.5.3'
        ? 'INTERFACE_DOWN'
        : trapOid === '1.3.6.1.6.3.1.1.5.5'
          ? 'AUTH_FAILURE'
          : 'SNMP_TRAP';
      createAutomaticIncident({
        device: { name: `SNMP-${source}`, host: source },
        signal: { type, message: `Trap SNMP reçu depuis ${source}${trapOid ? ` (OID ${trapOid})` : ''}.`, trapOid }
      });
    });
    receiver.on?.('error', error => {
      monitorState.lastError = error.message || String(error);
      console.error('[SNMP-TRAP]', error);
    });
    console.log(`[SNMP] récepteur de traps actif sur UDP/${port}`);
  } catch (error) {
    monitorState.lastError = `Trap SNMP: ${error.message}`;
    console.error('[SNMP] impossible de démarrer le récepteur:', error);
  }
}

export { parseDevices, severityFor };
