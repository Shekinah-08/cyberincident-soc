# Barème de criticité — moteur SNMP

Le moteur ne laisse pas l'utilisateur choisir la criticité.

| Signal | Niveau | Justification |
|---|---|---|
| DEVICE_UNREACHABLE | CRITICAL | Perte de disponibilité d'un équipement supervisé |
| INTERFACE_DOWN | CRITICAL | Indisponibilité d'une interface réseau |
| AUTH_FAILURE | HIGH | Échec d'authentification pouvant signaler une anomalie de sécurité |
| HIGH_ERROR_RATE | HIGH | Dégradation importante du trafic / de la qualité réseau |
| CONFIG_CHANGE | MEDIUM | Modification nécessitant vérification |
| SNMP_TRAP | MEDIUM | Événement SNMP non encore classifié plus sévèrement |
| INFO | LOW | Événement informatif |

**Pour le travail académique :** si le professeur a fourni un barème différent, modifier uniquement `server/src/severity.js`. Le frontend ne doit jamais accepter un champ `severity` fourni par l'utilisateur.
