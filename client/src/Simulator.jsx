import React, { useEffect, useRef, useState } from 'react';
import { Activity, ArrowLeft, BellRing, Check, CircleAlert, LogOut, Pause, Play, RadioTower, RefreshCw, ShieldAlert } from 'lucide-react';
import { api } from './api';
import './simulator.css';

const scenarios = [
  { type: 'AUTH_FAILURE', label: 'Tentatives d’accès', description: 'Simuler une série d’échecs d’authentification SNMP.' },
  { type: 'CONFIG_CHANGE', label: 'Changement de configuration', description: 'Simuler une modification non autorisée de configuration.' },
  { type: 'DEVICE_UNREACHABLE', label: 'Équipement inaccessible', description: 'Simuler la perte de réponse d’un équipement.' },
  { type: 'HIGH_ERROR_RATE', label: 'Pic d’erreurs réseau', description: 'Simuler un taux d’erreurs dépassant le seuil.' },
  { type: 'INTERFACE_DOWN', label: 'Interface indisponible', description: 'Simuler la détection d’une interface réseau arrêtée.' },
  { type: 'SNMP_TRAP', label: 'Trap SNMP inattendu', description: 'Simuler la réception d’un trap non prévu.' }
];
function displayTime(value) {
  return new Date(value).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export default function Simulator({ token, user, onBack, onLogout }) {
  const [status, setStatus] = useState(null);
  const [scenario, setScenario] = useState(scenarios[0].type);
  const [busy, setBusy] = useState(false);
  const [countdown, setCountdown] = useState(10);
  const [autoRunning, setAutoRunning] = useState(true);
  const [message, setMessage] = useState(null);
  const [error, setError] = useState('');
  const launchRef = useRef(null);
  const launchInProgress = useRef(false);
  const autoRunningRef = useRef(true);
  const countdownRef = useRef(10);

  async function loadStatus() {
    try {
      setStatus(await api('/snmp/status', { token }));
      setError('');
    } catch (requestError) {
      setError(requestError.message);
    }
  }

  useEffect(() => {
    loadStatus();
    if (!('BroadcastChannel' in window)) {
      const timer = window.setInterval(loadStatus, 20000);
      return () => window.clearInterval(timer);
    }
    const channel = new BroadcastChannel('cyberincident-soc-status');
    channel.onmessage = event => {
      if (event.data?.type === 'STATUS') {
        setStatus(event.data.status);
        setError('');
      }
    };
    return () => channel.close();
  }, []);

  async function launchSimulation(scenarioToLaunch = scenario) {
    if (launchInProgress.current) return;
    launchInProgress.current = true;
    setBusy(true);
    countdownRef.current = 0;
    setCountdown(0);
    setMessage(null);
    setError('');
    try {
      const result = await api('/snmp/simulate', { method: 'POST', token, body: { scenario: scenarioToLaunch } });
      setStatus(result.status);
      const detail = { scenario: scenarioToLaunch, targetCount: result.targetCount, at: new Date().toISOString() };
      setMessage({ ...detail, createdCount: result.incidents.length });
      const currentIndex = scenarios.findIndex(item => item.type === scenarioToLaunch);
      setScenario(scenarios[(currentIndex + 1) % scenarios.length].type);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      launchInProgress.current = false;
      setBusy(false);
      if (autoRunningRef.current) {
        countdownRef.current = 10;
        setCountdown(10);
      }
    }
  }

  launchRef.current = launchSimulation;

  useEffect(() => {
    autoRunningRef.current = autoRunning;
    if (!autoRunning) return undefined;
    if (countdownRef.current <= 0) {
      countdownRef.current = 10;
      setCountdown(10);
    }
    const timer = window.setInterval(() => {
      if (launchInProgress.current) return;
      countdownRef.current = Math.max(0, countdownRef.current - 1);
      setCountdown(countdownRef.current);
      if (countdownRef.current === 0) launchRef.current?.();
    }, 1000);
    return () => window.clearInterval(timer);
  }, [autoRunning]);

  const recentEvents = status?.events?.slice(0, 8) || [];

  return <div className="simulator-shell">
    <header className="sim-header">
      <a className="sim-brand" href="/" onClick={event => { event.preventDefault(); onBack(); }}>
        <span className="sim-brand-mark"><RadioTower size={20}/></span>
        <span><b>CyberIncident</b><small>SIMULATEUR DE DÉTECTION</small></span>
      </a>
      <div className="sim-header-actions">
        <span className="sim-user">{user.name} · {user.role}</span>
        <button className="sim-icon-button" onClick={onBack} title="Retour au SOC"><ArrowLeft size={17}/></button>
        <button className="sim-icon-button" onClick={onLogout} title="Déconnexion"><LogOut size={17}/></button>
      </div>
    </header>

    <main className="sim-main">
      <div className="sim-title-row">
        <div><p className="sim-eyebrow">LABORATOIRE LOCAL / CONNECTÉ AU SOC</p><h1>Simulateur d’alertes SNMP</h1><p className="sim-intro">Déclenchez des scénarios de détection et vérifiez la réponse du SOC, sans envoyer de trafic d’attaque.</p></div>
        <div className="sim-live"><span/> API SOC {status?.running ? 'EN LIGNE' : 'CONNECTÉE'}</div>
      </div>
      {error && <div className="sim-error" role="alert"><CircleAlert size={17}/>{error}</div>}

      <section className="sim-overview" aria-label="État du simulateur">
        <div><span>Mode du moteur</span><strong>{status?.mode || 'Connexion…'}</strong></div>
        <div><span>Équipements ciblés</span><strong>{status?.devices?.length ?? '—'}</strong></div>
        <div><span>Incidents SNMP</span><strong>{status?.incidents?.length ?? '—'}</strong></div>
        <div><span>Événements récents</span><strong>{status?.events?.length ?? '—'}</strong></div>
      </section>

      <div className="sim-columns">
        <section className="sim-section sim-launch-panel">
          <div className="sim-section-heading"><div><p className="sim-eyebrow">SCÉNARIO</p><h2>Déclencher une détection</h2></div><button className={`sim-auto-toggle ${autoRunning ? 'running' : ''}`} onClick={() => setAutoRunning(value => !value)}>{autoRunning ? <Pause size={15}/> : <Play size={15}/>} {autoRunning ? 'Pause auto' : 'Reprendre auto'}</button></div>
          <label className="sim-field-label" htmlFor="sim-scenario">Type de signal</label>
          <select id="sim-scenario" className="sim-select" value={scenario} onChange={event => setScenario(event.target.value)}>
            {scenarios.map(item => <option key={item.type} value={item.type}>{item.label}</option>)}
          </select>
          <p className="sim-scenario-description">{scenarios.find(item => item.type === scenario)?.description}</p>
          <div className="sim-target-heading"><span>Équipements concernés</span><b>{status?.devices?.length || 0}</b></div>
          <div className="sim-target-list">
            {status?.devices?.map(device => <div className="sim-target" key={device.host}><span className="sim-target-dot"/><div><b>{device.name}</b><small>{device.type || 'Équipement réseau'} · {device.host} · SNMP {device.version}</small></div><span className="sim-target-state">SIMULÉ</span></div>)}
            {!status?.devices?.length && <p className="sim-empty">Aucun équipement n’est configuré dans le SOC.</p>}
          </div>
          <button className="sim-launch" onClick={() => launchSimulation()} disabled={busy || !status?.devices?.length}>
            <BellRing size={18}/>{busy ? 'Simulation en cours…' : 'Lancer maintenant'}
          </button>
          {autoRunning && <p className="sim-countdown" aria-live="polite">Prochain scénario automatique dans {countdown} s</p>}
          {!autoRunning && <p className="sim-countdown paused" aria-live="polite">Rotation automatique en pause</p>}
          <p className="sim-disclaimer">Simulation uniquement : aucun paquet, identifiant ou commande n’est envoyé aux équipements. Sans inventaire SNMP configuré, la liste affichée est un jeu d’appareils fictifs de laboratoire.</p>
          {message && <div className="sim-result" role="status"><Check size={18}/><span><b>Scénario transmis au SOC</b><small>{message.targetCount} cible(s) · {message.createdCount} nouvel incident(s) · {displayTime(message.at)}</small></span></div>}
        </section>
      </div>

      <section className="sim-section sim-events-panel">
        <div className="sim-section-heading"><div><p className="sim-eyebrow">FLUX DE DÉTECTION</p><h2>Événements récents du SOC</h2></div><button className="sim-refresh" onClick={loadStatus} title="Actualiser"><RefreshCw size={17}/></button></div>
        <div className="sim-events-table-wrap"><table className="sim-events-table"><thead><tr><th>Heure</th><th>Événement</th><th>Équipement</th><th>Signal</th><th>Incident</th></tr></thead><tbody>
          {recentEvents.map(event => <tr key={event.id}><td>{displayTime(event.at)}</td><td>{event.kind}</td><td>{event.device || '—'}</td><td>{event.signal || '—'}</td><td>{event.reference || '—'}</td></tr>)}
          {!recentEvents.length && <tr><td className="sim-empty" colSpan="5"><Activity size={16}/>Aucune détection enregistrée.</td></tr>}
        </tbody></table></div>
      </section>
    </main>
  </div>;
}