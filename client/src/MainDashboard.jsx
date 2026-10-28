import React, { useEffect, useState } from 'react';
import { Activity, FileKey2, FileWarning, RadioTower, RefreshCw, TriangleAlert } from 'lucide-react';
import { api } from './api';
import './main-dashboard.css';

const severityNames = { LOW: 'Faible', MEDIUM: 'Moyenne', HIGH: 'Haute', CRITICAL: 'Critique' };

function formatTime(value) {
  return value ? new Date(value).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' }) : '—';
}

export default function MainDashboard({ token, setPage, snmpStatus }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  async function load() {
    try {
      const dashboardData = await api('/dashboard', { token });
      setData(dashboardData);
      setError('');
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    const timer = window.setInterval(load, 60000);
    return () => window.clearInterval(timer);
  }, []);

  if (loading) return <div className="loader"><div className="spinner"/>Chargement sécurisé…</div>;
  if (!data) return <div className="page"><div className="alert error">{error || 'Impossible de charger le tableau de bord.'}</div></div>;

  // Défense contre une réponse API partielle ou une ancienne version du backend.
  const stats = {
    incidents: 0, open: 0, critical: 0, evidence: 0,
    ...(data?.stats && typeof data.stats === 'object' ? data.stats : {})
  };
  const recent = Array.isArray(data?.recent) ? data.recent : [];
  const events = Array.isArray(snmpStatus?.events) ? snmpStatus.events.slice(0, 10) : [];

  return <div className="page">
    <div className="hero">
      <div><span className="pill"><Activity size={14}/> SURVEILLANCE ACTIVE</span><h1>Vue d’ensemble<br/><em>forensique</em></h1><p>Incidents et détections SNMP du SOC, actualisés automatiquement.</p></div>
      <button className="secondary" onClick={load}><RefreshCw size={16}/> Actualiser</button>
    </div>
    {error && <div className="alert error">{error}</div>}
    <div className="stats-grid">
      {[[TriangleAlert, 'Incidents', stats.incidents, ''], [Activity, 'Incidents actifs', stats.open, 'amber'], [FileWarning, 'Critiques ouvertes', stats.critical, 'red'], [FileKey2, 'Preuves enregistrées', stats.evidence, 'blue']].map(([Icon, label, value, tone]) => <div className="stat-card" key={label}><div className={`stat-icon ${tone}`}><Icon size={20}/></div><div><span>{label}</span><strong>{value}</strong></div></div>)}
    </div>
    <section className="panel main-snmp-feed">
      <div className="panel-head"><div><h3>Événements récents du SOC</h3><p>Flux de détection SNMP · actualisation automatique</p></div><button className="link" onClick={() => setPage('snmp')}>Supervision SNMP <RadioTower size={15}/></button></div>
      <div className="table-wrap"><table><thead><tr><th>Heure</th><th>Événement</th><th>Équipement</th><th>Signal</th><th>Criticité</th><th>Incident</th></tr></thead><tbody>
        {events.map(event => <tr key={event.id}><td>{formatTime(event.at)}</td><td>{event.kind === 'INCIDENT_CREATED' ? 'Incident créé' : 'Détection'}</td><td>{event.device || '—'}</td><td className="mono">{event.signal || '—'}</td><td><span className={`main-severity ${String(event.severity || '').toLowerCase()}`}>{severityNames[event.severity] || '—'}</span></td><td className="mono">{event.reference || '—'}</td></tr>)}
        {!events.length && <tr><td className="empty" colSpan="6">Aucun événement SNMP récent.</td></tr>}
      </tbody></table></div>
    </section>
    <div className="dashboard-grid main-audit-feed">
      <section className="panel"><div className="panel-head"><div><h3>Activité récente</h3><p>Dernières opérations enregistrées</p></div><button className="link" onClick={() => setPage('audit')}>Voir le journal</button></div>
        <div className="activity-list">{recent.map(row => <div className="activity" key={row.id}><div className="activity-icon"><Activity size={15}/></div><div><b>{String(row.action || 'ACTION').replaceAll('_', ' ')}</b><span>{row.actor_name || 'Système'} · {row.entity_type || 'Événement'} #{row.entity_id ?? '—'}</span></div><time>{formatTime(row.event_time)}</time></div>)}{!recent.length && <div className="empty">Aucune activité enregistrée pour le moment.</div>}</div>
      </section>
      <section className="panel"><div className="panel-head"><div><h3>État du moteur SNMP</h3><p>{snmpStatus?.mode || 'Connexion…'}</p></div><RadioTower size={20}/></div><div className="main-snmp-summary"><span>Équipements suivis</span><b>{snmpStatus?.devices?.length ?? '—'}</b></div><div className="main-snmp-summary"><span>Dernier cycle</span><b>{formatTime(snmpStatus?.lastCycleAt)}</b></div><div className="main-snmp-summary"><span>État</span><b>{snmpStatus?.running ? 'Actif' : 'Arrêté'}</b></div></section>
    </div>
  </div>;
}