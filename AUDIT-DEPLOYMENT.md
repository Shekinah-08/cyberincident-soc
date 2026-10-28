# Rapport de préparation au déploiement — CyberIncident v3

## Changements appliqués

- Retrait de la base JSON locale `server/data/cyberincident.json` de l'archive livrable : elle contenait des comptes de démonstration et des incidents de test.
- Retrait du dossier compilé `client/dist` : Render le reconstruit pendant le build.
- Build Render rendu reproductible en utilisant `npm ci` et les fichiers lock.
- Configuration CORS restrictive par défaut pour le déploiement monolithique où frontend et API partagent la même origine. `CLIENT_ORIGIN` peut être configuré si le frontend est hébergé séparément.
- Protection supplémentaire contre l'utilisation par erreur du fichier JSON local en production si `DATA_DIR` n'est pas configuré.
- Correction de la détection du secret JWT d'exemple dans `server/src/config.js` et `setup.sh`.
- Protection du tableau de bord contre une réponse API incomplète (`stats`/`recent` absents ou nuls), pour éviter une erreur JavaScript du type `stats is null`.
- Mise à jour des instructions : les incidents doivent provenir du moteur SNMP ; la création manuelle est désactivée.

## Vérifications réalisées dans l'environnement de préparation

- Test `server/test/config.test.js` : réussi.
- Syntaxe des fichiers JavaScript du serveur et des tests : réussie.
- Lecture/validation YAML de `render.yaml` : réussie.
- Vérification de l'archive : les données JSON locales, `client/dist` et les fichiers `.env` réels ne sont pas inclus.

## Vérifications restant à exécuter dans Kali/Render

L'installation des dépendances complètes et le build React n'ont pas pu être exécutés ici : l'accès au registre npm a échoué avec une erreur DNS `EAI_AGAIN`. Après extraction dans Kali, exécuter `./setup.sh`, `npm --prefix server test` et `npm --prefix client run build` avec une connexion réseau fonctionnelle avant le déploiement.

## Important pour la production

- Renseigner `BOOTSTRAP_ADMIN_EMAIL` et `BOOTSTRAP_ADMIN_PASSWORD` dans Render ; utiliser un mot de passe unique d'au moins 12 caractères.
- Ne jamais publier de `.env`, secrets, preuves ou données personnelles.
- Le stockage JSON local n'est pas adapté à une conservation durable sur un hébergement éphémère. Configurer `DATA_DIR` et `EVIDENCE_DIR` sur un stockage persistant adapté, ou migrer vers une base et un stockage gérés.
- `SNMP_DEMO_MODE=true` sert aux démonstrations et génère des événements simulés. Pour surveiller un réseau réel, configurer des équipements autorisés et une architecture réseau permettant le trafic SNMP requis.
