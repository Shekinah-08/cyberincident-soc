import express from 'express';
import { auth, allow } from '../middleware.js';
import { getSnmpStatus, runSnmpCycle, simulateSnmpScenario } from '../snmp.js';

const router = express.Router();
router.use(auth);

router.get('/status', (req, res) => {
  res.json(getSnmpStatus());
});

// Déclenchement manuel d'un cycle de lecture uniquement pour le laboratoire.
// Il ne crée pas directement d'incident : le moteur SNMP décide lui-même si un signal
// mérite la création automatique d'un dossier.
router.post('/poll', allow('ADMIN'), async (req, res, next) => {
  try {
    res.json(await runSnmpCycle());
  } catch (error) {
    next(error);
  }
});

router.post('/simulate', allow('ADMIN'), (req, res, next) => {
  try {
    res.json(simulateSnmpScenario(req.body?.scenario, req.user.id));
  } catch (error) {
    next(error);
  }
});

router.get('/rules', (req, res) => {
  const status = getSnmpStatus();
  res.json({ rules: status.rules });
});

export default router;
