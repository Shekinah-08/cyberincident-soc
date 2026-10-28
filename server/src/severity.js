// Moteur centralisé de criticité.
// IMPORTANT : les valeurs sont décidées côté serveur et ne sont jamais saisies
// par l'utilisateur. Le barème peut être ajusté ici selon les exigences du professeur.

export const SEVERITY_RULES = Object.freeze([
  { type: 'DEVICE_UNREACHABLE', severity: 'CRITICAL', priority: 100, reason: 'Équipement supervisé inaccessible.' },
  { type: 'INTERFACE_DOWN', severity: 'CRITICAL', priority: 90, reason: 'Interface réseau détectée DOWN.' },
  { type: 'AUTH_FAILURE', severity: 'HIGH', priority: 80, reason: 'Échec d’authentification SNMP détecté.' },
  { type: 'HIGH_ERROR_RATE', severity: 'HIGH', priority: 70, reason: 'Taux d’erreurs réseau supérieur au seuil.' },
  { type: 'CONFIG_CHANGE', severity: 'MEDIUM', priority: 50, reason: 'Changement de configuration détecté.' },
  { type: 'SNMP_TRAP', severity: 'MEDIUM', priority: 40, reason: 'Trap SNMP reçu sans classification plus sévère.' },
  { type: 'INFO', severity: 'LOW', priority: 10, reason: 'Événement informatif.' }
]);

export function severityFor(signal = {}) {
  return SEVERITY_RULES.find(rule => rule.type === signal.type)?.severity || 'MEDIUM';
}

export function severityReason(signal = {}) {
  return SEVERITY_RULES.find(rule => rule.type === signal.type)?.reason || 'Événement SNMP non classifié.';
}

export function severityRules() {
  return SEVERITY_RULES.map(({ type, severity, reason }) => ({ type, severity, reason }));
}
