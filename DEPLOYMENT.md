# Déploiement rapide

## 1. Tester localement

```bash
./setup.sh
npm start
```

Puis ouvrir : `http://localhost:4000`

Vérifier : `http://localhost:4000/api/health`

## 2. Publier sur GitHub

```bash
git init
git add .
git commit -m "Prepare CyberIncident for production demo deployment"
git branch -M main
git remote add origin <URL_DU_DEPOT_GITHUB>
git push -u origin main
```

Ne jamais commiter `server/.env`, `server/data/*.json` ni les preuves.
Le dépôt doit contenir `render.yaml`. Ne publiez pas les comptes de démonstration locaux comme identifiants de production.

## 3. Créer le service Web

Importer le dépôt GitHub dans un service Web Node.js.

Build (installations reproductibles à partir des lockfiles) :

```bash
npm ci --prefix client && npm --prefix client run build && npm ci --prefix server
```

Start :

```bash
npm --prefix server start
```

Health check : `/api/health`

## 4. Variables

Le blueprint définit `NODE_ENV=production`, un `JWT_SECRET` généré, et active le mode démonstration contrôlé. Au premier démarrage, définir dans Render les variables privées `BOOTSTRAP_ADMIN_EMAIL` et `BOOTSTRAP_ADMIN_PASSWORD` (12 caractères minimum). Le compte admin est créé avec ces valeurs ; les mots de passe locaux connus ne sont pas utilisés en production.

Le frontend est servi par le même service que l’API : aucune variable CORS n'est nécessaire pour ce déploiement monolithique. Si le frontend est hébergé séparément, définissez `CLIENT_ORIGIN` avec son origine HTTPS exacte.

Définir au minimum :

```text
BOOTSTRAP_ADMIN_EMAIL=<adresse admin de production>
BOOTSTRAP_ADMIN_PASSWORD=<mot de passe fort, 12 caractères minimum>
MAX_UPLOAD_MB=50
RATE_LIMIT_MAX=300
```

Le plan Render sans disque persistant peut perdre la base JSON, les comptes et les preuves lors d’un redémarrage ou redéploiement. Pour conserver les données, configurer un disque persistant sur le service et définir `DATA_DIR` et `EVIDENCE_DIR` sur ses chemins montés, ou migrer vers une base et un stockage gérés.

## 5. Vérification finale

- `/api/health` doit retourner `ok: true`.
- La page d'accueil doit afficher l'écran de connexion.
- Se connecter avec l’adresse et le mot de passe admin saisis dans les variables Render.
- Vérifier que le simulateur est en mode démonstration.
- Lancer un scénario SNMP de démonstration depuis l'espace réservé à l'administrateur ; l'incident doit être généré automatiquement.
- Ajouter une preuve fictive.
- Télécharger la preuve et vérifier le journal.
- Générer le PDF.
