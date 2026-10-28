import express from 'express';
import { store, appendAudit, now } from '../db.js';
import { auth, allow } from '../middleware.js';

const router = express.Router();
router.use(auth);

router.get('/', (req, res) => {
  const users = store.users();
  const rows = store.incidents().sort((a, b) => b.id - a.id).map(incident => ({
    ...incident,
    creator_name: users.find(u => u.id === incident.created_by)?.name || 'Système',
    evidence_count: store.evidence().filter(e => e.incident_id === incident.id).length
  }));
  res.json({ incidents: rows });
});

router.get('/:id', (req, res) => {
  const incident = store.incidentById(req.params.id);
  if (!incident) return res.status(404).json({ error: 'Incident introuvable' });
  const users = store.users();
  const evidence = store.evidence()
    .filter(e => e.incident_id === incident.id)
    .sort((a, b) => b.id - a.id)
    .map(e => ({ ...e, collector_name: users.find(u => u.id === e.collected_by)?.name || 'Inconnu' }));
  res.json({ incident: { ...incident, creator_name: users.find(u => u.id === incident.created_by)?.name || 'Système' }, evidence });
});

router.post('/', (req, res) => res.status(405).json({
  error: 'Création manuelle interdite. Les incidents sont générés exclusivement par le moteur SNMP.'
}));

router.patch('/:id', allow('ADMIN', 'INVESTIGATOR'), (req, res) => {
  const incident = store.incidentById(req.params.id);
  if (!incident) return res.status(404).json({ error: 'Incident introuvable' });

  const status = req.body?.status !== undefined ? String(req.body.status) : incident.status;
  const title = req.body?.title !== undefined ? String(req.body.title).trim() : incident.title;
  const description = req.body?.description !== undefined ? String(req.body.description).trim() : incident.description;

  if (!title || !['OPEN', 'INVESTIGATING', 'CONTAINED', 'CLOSED'].includes(status)) {
    return res.status(400).json({ error: 'Données invalides.' });
  }

  // severity, detection_source et detection_key sont volontairement exclus :
  // ils appartiennent au moteur automatique et ne sont pas éditables par l'humain.
  store.updateIncident(incident.id, { title, description, status, updated_at: now() });
  appendAudit(req.user.id, 'INCIDENT_UPDATED', 'INCIDENT', incident.id, { title, status });
  res.json({ ok: true });
});

export default router;
