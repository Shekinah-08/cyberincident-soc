# CyberIncident — SOC + Supervision SNMP automatique

Plateforme académique React + Node.js/Express pour démontrer une chaîne complète :

**SNMP → détection → criticité serveur → incident automatique → preuves → SHA-256 → chaîne de possession → audit hash-chaîné → rapport PDF.**

## Règle fonctionnelle principale

Il n'existe **aucune création manuelle d'incident**.

Le bouton « Nouvel incident » n'existe pas et `POST /api/incidents` répond HTTP 405. Un incident est créé uniquement par `server/src/snmp.js` après détection d'un signal SNMP.

La criticité est calculée uniquement côté serveur dans `server/src/severity.js` et n'est jamais acceptée depuis le frontend.

> Le tableau de criticité est centralisé dans `severity.js` afin de pouvoir être remplacé par le barème exact du professeur sans modifier l'interface.

## Criticité par défaut

| Signal SNMP | Criticité |
|---|---|
| DEVICE_UNREACHABLE | CRITICAL |
| INTERFACE_DOWN | CRITICAL |
| AUTH_FAILURE | HIGH |
| HIGH_ERROR_RATE | HIGH |
| CONFIG_CHANGE | MEDIUM |
| SNMP_TRAP | MEDIUM |
| INFO | LOW |

## Architecture

```text
Switch / routeur / serveur
          │
          │ SNMP polling / traps
          ▼
     Moteur SNMP Node.js
          │
          ├── IF-MIB
          ├── sysName
          ├── sysUpTime
          └── compteurs d'erreurs
          │
          ▼
    Moteur de criticité
          │
          ▼
 Incident automatique
          │
   ┌──────┼──────────┐
   ▼      ▼          ▼
Preuves SHA-256  Audit    Rapport PDF
```

## Installation Kali / Linux

Prérequis : Node.js 20+ et npm.

```bash
chmod +x setup.sh
./setup.sh
npm start
```

Puis ouvrir : `http://localhost:4000`

API de santé : `http://localhost:4000/api/health`

## Développement

Terminal 1 :

```bash
npm --prefix server run dev
```

Terminal 2 :

```bash
npm --prefix client run dev
```

Interface : `http://localhost:5173`

## Comptes de démonstration

Comptes de démonstration **uniquement en local** (créés automatiquement si aucun utilisateur n'existe) :

- ADMIN : `admin@cyber.local` / `Admin@12345`
- INVESTIGATOR : `investigator@cyber.local` / `Investigator@12345`
- AUDITOR : `auditor@cyber.local` / `Auditor@12345`

Ne réutilisez jamais ces comptes en production. En production, créez le premier compte via `BOOTSTRAP_ADMIN_EMAIL` et `BOOTSTRAP_ADMIN_PASSWORD`.

## Démonstration SNMP sans équipement réel

Dans `server/.env` :

```env
SNMP_DEMO_MODE=true
SNMP_DEMO_SCENARIO=INTERFACE_DOWN
SNMP_POLL_INTERVAL_MS=30000
```

Au démarrage, le serveur lance automatiquement le moteur de démonstration. Par défaut, le laboratoire présente cinq cibles fictives utilisant des adresses réservées aux exemples : un routeur (`192.0.2.1`), un switch (`192.0.2.2`), un serveur (`192.0.2.10`), un ordinateur (`192.0.2.20`) et un téléphone (`192.0.2.30`). Ces appareils ne sont pas découverts sur le réseau réel.

Le moteur produit un signal simulé à chaque cycle. La page indépendante du simulateur, `http://localhost:5173/simulator`, lance également un scénario après un compte à rebours de 10 secondes. Le lancement manuel reste disponible. Les deux modes utilisent des signaux de laboratoire : ils n’envoient aucun paquet d’attaque aux équipements.

Pour une démonstration orale reproductible :

1. Connectez-vous avec le compte ADMIN.
2. Dans l’application principale, activez les alertes sonores avec l’icône de volume. Le navigateur demande une interaction explicite avant d’autoriser le son.
3. Ouvrez le simulateur depuis le menu ou rendez-vous sur `http://localhost:5173/simulator`.
4. Attendez le compte à rebours ou lancez un scénario manuellement.
5. Revenez au tableau de bord principal : le flux « Événements récents du SOC » affiche la détection, l’équipement et la criticité calculée côté serveur. Une nouvelle détection déclenche la sonnerie correspondante dans l’onglet SOC.

Le niveau de criticité n’est ni choisi ni calculé par l’interface du simulateur. La réponse de l’API et le tableau `server/src/severity.js` font autorité. Les incidents ouverts en double sont dédupliqués par équipement et signal.

Pour substituer des cibles de laboratoire, renseignez `SNMP_DEVICES` avec des équipements autorisés. En mode démonstration, ces entrées servent de cibles aux signaux simulés ; aucun poll SNMP réel n’est envoyé. N’indiquez pas d’adresse d’équipement sans autorisation.

Le système fait alors :

```text
Événement SNMP simulé
        ↓
INTERFACE_DOWN
        ↓
Règle serveur
        ↓
CRITICAL
        ↓
Création automatique INC-XXXX
        ↓
Audit hash-chaîné
```

Le moteur crée automatiquement l'incident lorsqu'un signal simulé le justifie. Les scénarios accessibles dans le simulateur sont `AUTH_FAILURE`, `CONFIG_CHANGE`, `DEVICE_UNREACHABLE`, `HIGH_ERROR_RATE`, `INTERFACE_DOWN` et `SNMP_TRAP`.

## Supervision d'un vrai équipement

Mettre `SNMP_DEMO_MODE=false` et configurer :

```env
SNMP_DEVICES=[{"name":"SW-01","host":"192.168.1.10","type":"Switch","community":"public","version":"2c","timeout":2000,"retries":1}]
```

Le moteur interroge `sysName`, `sysUpTime`, `ifDescr`, `ifOperStatus`, `ifAdminStatus`, `ifInErrors` et `ifOutErrors`.

Les interfaces DOWN et les compteurs d'erreurs dépassant `SNMP_ERROR_THRESHOLD` peuvent générer automatiquement des incidents.

Pour un vrai environnement, préférer SNMPv3 avec authentification/chiffrement et ne jamais utiliser une communauté sensible dans Git.

Le système supervise les appareils explicitement configurés et accessibles en SNMP ; il ne découvre pas automatiquement tous les téléphones ou ordinateurs du réseau. Les appareils qui n’exposent pas SNMP nécessitent une autre source d’inventaire ou un agent adapté.

## API SNMP

- `GET /api/snmp/status` — état du moteur, équipements, événements et incidents SNMP.
- `GET /api/snmp/rules` — règles de criticité exposées en lecture.
- `POST /api/snmp/poll` — lance un cycle de polling de laboratoire ; il ne crée pas directement un incident, le moteur décide selon les signaux.
- `POST /api/snmp/simulate` — accepte un scénario allowlisté, réservé à un administrateur et au mode démo ; la criticité est calculée côté serveur.

## Tests

Les tests serveur utilisent un répertoire temporaire et ne modifient pas les données locales :

```bash
npm --prefix server test
npm --prefix client run build
```

La suite vérifie le barème de criticité, la simulation des cinq cibles de labo, l’ignorance d’une criticité envoyée par le client, la déduplication et les contrôles d’accès.

## Forensic

- Upload de preuve.
- SHA-256 côté serveur.
- Vérification du hash avant téléchargement.
- Chaîne de possession.
- Journal d'audit hash-chaîné.
- Rapport PDF.

## Important

Pour un vrai système de production ou une conservation judiciaire, remplacer le stockage JSON local par une base de données et un stockage persistant/immuable, ajouter MFA, gestion robuste des secrets, chiffrement au repos, sauvegardes et procédures légales de conservation.
