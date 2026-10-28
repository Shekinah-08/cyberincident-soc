import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test, { after, before } from 'node:test';
import express from 'express';
import jwt from 'jsonwebtoken';
import { SEVERITY_RULES, severityFor } from '../src/severity.js';

const testDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cyberincident-test-'));
process.env.DATA_DIR = path.join(testDataDir, 'data');
process.env.EVIDENCE_DIR = path.join(testDataDir, 'evidence');
process.env.JWT_SECRET = 'test-secret-with-more-than-thirty-two-characters';
process.env.SNMP_DEMO_MODE = 'true';
process.env.SNMP_DEVICES = '[]';
process.env.RATE_LIMIT_MAX = '1000';

let server;
let baseUrl;
let store;

before(async () => {
  const [{ default: snmpRouter }, db] = await Promise.all([
    import('../src/routes/snmp.js'),
    import('../src/db.js')
  ]);
  store = db.store;
  const app = express();
  app.use(express.json());
  app.use('/api/snmp', snmpRouter);
  app.use((error, req, res, next) => {
    res.status(error.status || 500).json({ error: error.message });
  });
  server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}/api/snmp`;
});

after(async () => {
  if (server) await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  fs.rmSync(testDataDir, { recursive: true, force: true });
});

function tokenFor(userId) {
  return jwt.sign({ sub: userId }, process.env.JWT_SECRET, { expiresIn: '5m' });
}

async function postScenario({ userId = 1, body = { scenario: 'AUTH_FAILURE' }, includeToken = true } = {}) {
  return fetch(`${baseUrl}/simulate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(includeToken ? { Authorization: `Bearer ${tokenFor(userId)}` } : {})
    },
    body: JSON.stringify(body)
  });
}

test('severity rules classify all documented SNMP signals on the server', () => {
  assert.equal(SEVERITY_RULES.length, 7);
  for (const rule of SEVERITY_RULES) {
    assert.equal(severityFor({ type: rule.type }), rule.severity);
  }
  assert.equal(severityFor({ type: 'UNCLASSIFIED_SIGNAL' }), 'MEDIUM');
});

test('admin simulation targets the lab fleet and ignores client-supplied severity', async () => {
  const response = await postScenario({ body: { scenario: 'AUTH_FAILURE', severity: 'LOW' } });
  assert.equal(response.status, 200);
  const result = await response.json();

  assert.equal(result.simulatedOnly, true);
  assert.equal(result.targetCount, 5);
  assert.deepEqual(result.alerts.map(alert => alert.device), [
    'LAB-ROUTER-01',
    'LAB-SWITCH-01',
    'LAB-SERVER-01',
    'LAB-PC-01',
    'LAB-PHONE-01'
  ]);
  assert.ok(result.alerts.every(alert => alert.severity === 'HIGH'));
  assert.equal(result.incidents.length, 5);
});

test('an open incident is deduplicated for the same device and signal', async () => {
  const first = await postScenario({ body: { scenario: 'SNMP_TRAP' } });
  const firstResult = await first.json();
  assert.equal(first.status, 200);
  assert.equal(firstResult.incidents.length, 5);

  const second = await postScenario({ body: { scenario: 'SNMP_TRAP' } });
  const secondResult = await second.json();
  assert.equal(second.status, 200);
  assert.equal(secondResult.targetCount, 5);
  assert.equal(secondResult.incidents.length, 0);
  assert.ok(secondResult.alerts.every(alert => alert.duplicate));
});

test('simulation requires an authenticated administrator', async () => {
  const anonymous = await postScenario({ includeToken: false });
  assert.equal(anonymous.status, 401);

  const investigatorId = store.users().find(user => user.role === 'INVESTIGATOR').id;
  const investigator = await postScenario({ userId: investigatorId });
  assert.equal(investigator.status, 403);
});

test('simulation rejects unknown scenarios and is disabled outside demo mode', async () => {
  const unknown = await postScenario({ body: { scenario: 'UNLISTED_SIGNAL' } });
  assert.equal(unknown.status, 400);

  process.env.SNMP_DEMO_MODE = 'false';
  try {
    const disabled = await postScenario();
    assert.equal(disabled.status, 403);
  } finally {
    process.env.SNMP_DEMO_MODE = 'true';
  }
});

test('production requires private bootstrap admin credentials instead of demo defaults', () => {
  const productionSeed = `
    const { store } = await import('./src/db.js');
    console.log(JSON.stringify(store.users().map(({ email, role }) => ({ email, role }))));
  `;
  const baseEnvironment = {
    ...process.env,
    NODE_ENV: 'production',
    DATA_DIR: path.join(testDataDir, 'production-data'),
    EVIDENCE_DIR: path.join(testDataDir, 'production-evidence')
  };

  assert.throws(() => execFileSync(process.execPath, ['--input-type=module', '-e', productionSeed], {
    cwd: process.cwd(),
    env: { ...baseEnvironment, BOOTSTRAP_ADMIN_EMAIL: '', BOOTSTRAP_ADMIN_PASSWORD: '' },
    stdio: 'pipe'
  }));

  const output = execFileSync(process.execPath, ['--input-type=module', '-e', productionSeed], {
    cwd: process.cwd(),
    env: {
      ...baseEnvironment,
      DATA_DIR: path.join(testDataDir, 'production-seeded-data'),
      EVIDENCE_DIR: path.join(testDataDir, 'production-seeded-evidence'),
      BOOTSTRAP_ADMIN_EMAIL: 'owner@example.test',
      BOOTSTRAP_ADMIN_PASSWORD: 'test-bootstrap-password-123'
    },
    encoding: 'utf8',
    stdio: 'pipe'
  });
  assert.deepEqual(JSON.parse(output.trim()), [{ email: 'owner@example.test', role: 'ADMIN' }]);
});