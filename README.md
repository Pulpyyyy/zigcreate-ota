# ZigCreate OTA — Bridge Zigbee pour ventilateur de plafond

Transformez votre ventilateur Tuya en appareil Zigbee natif, pilotable depuis votre box domotique favorite.

---

## Ce que vous pouvez contrôler

| Fonction | Contrôles disponibles |
|---|---|
| **Ventilateur** | Marche/arrêt · 6 niveaux de vitesse |
| **Lumière** | Marche/arrêt · Température de couleur (Froid / Neutre / Chaud) |
| **Minuterie** | Préréglages `1h` / `2h` / `4h` · Décompte visible en temps réel · Réinitialisation automatique à `off` en fin de décompte |
| **Son** | Activation / désactivation du bip de confirmation |
| **Direction** | Mode Été (brassage vers le bas) · Mode Hiver (remontée d'air chaud) |
| **Comportement après coupure** | État de la lumière et du son configurables (éteint / allumé / bascule / restauration) |
| **Température / Humidité** | Lecture de la température et de l'humidité ambiante — nécessite un capteur DHT22 (optionnel, voir [câblage](wiring/WIRING.md#dht22-capteur-de-température--humidité-optionnel)) |

---

## Fonctionnalités

### Contrôle complet depuis l'interface domotique

Toutes les commandes sont disponibles depuis Zigbee2MQTT ou toute box compatible Zigbee :

- **Ventilateur** — marche/arrêt indépendant de la vitesse ; la vitesse peut être réglée de 1 à 6 sans éteindre le ventilateur. La dernière vitesse est mémorisée et restaurée à la prochaine mise en marche.
- **Lumière** — marche/arrêt avec mémorisation de l'état ; température de couleur en 3 paliers : Froid (~6 500 K), Neutre (~2 700 K), Chaud (~2 000 K).
- **Minuterie** — déclenche l'extinction automatique après 1 h, 2 h ou 4 h. Le décompte restant (en minutes) est visible en temps réel dans l'interface. Le préréglage repasse automatiquement à `off` lorsque le décompte atteint zéro.
- **Son (bip)** — active ou désactive le bip sonore émis par l'appareil lors de chaque commande.
- **Direction** — inverse le sens de rotation du ventilateur pour le mode Hiver.

### Synchronisation en temps réel

Utiliser la télécommande physique (vitesse, on/off, direction…) met à jour l'état dans l'interface domotique instantanément. L'état est également resynchronisé automatiquement à chaque redémarrage du module.

### Comportement après coupure de courant

Il est possible de définir ce que fait chaque appareil au redémarrage après une coupure de courant. Ce réglage est disponible séparément pour la **lumière** et le **son** :

| Valeur | Comportement |
|---|---|
| `off` | Toujours éteint au démarrage |
| `on` | Toujours allumé au démarrage |
| `toggle` | Inverse l'état précédent |
| `previous` (défaut lumière) | Restaure l'état avant la coupure |

La température de couleur de la lumière est également restaurée automatiquement. Par défaut, le bip démarre toujours désactivé.

### Mises à jour sans fil (OTA)

Le firmware se met à jour par liaison radio depuis Zigbee2MQTT, sans démontage ni câble. Les mises à jour sont proposées automatiquement dès qu'une nouvelle version est disponible dans l'index OTA de ce dépôt.

### Rôle routeur Zigbee

Le module fonctionne en tant que **routeur Zigbee** : il peut relayer les communications d'autres appareils Zigbee du réseau, contribuant ainsi à améliorer la portée et la robustesse du maillage.

### Indicateur LED

La LED RGB intégrée indique l'état du module en temps réel :

| Couleur / comportement | Signification |
|---|---|
| 🟠 Orange (ramping) | Démarrage en cours |
| 🔵 Cyan clignotant (0,5 s) | Recherche d'un réseau Zigbee (appairage) |
| 🟢 3 flashes verts | Appairage réussi |
| 🔴 Rouge clignotant rapide | Échec de connexion, nouvelle tentative |
| 🟡 Ambre (1 s on / 2 s off) | Mode dégradé — MU ventilateur injoignable |
| 🟠 Orange clignotant | Réinitialisation en attente (bouton maintenu) |
| ⚫ Éteinte | Fonctionnement normal |

### Réinitialisation

- **Bouton BOOT (5 s)** — maintenir le bouton BOOT appuyé 5 secondes remet l'appareil en configuration d'usine : effacement du réseau Zigbee mémorisé, des préférences et de l'historique de diagnostics. L'appareil redémarre ensuite en mode appairage.
- **GPIO externe** — un signal bas sur le GPIO de reset externe provoque un redémarrage simple (sans effacement). Consultez le [guide de câblage](wiring/WIRING.md).

### Récupération automatique

Si la connexion Zigbee échoue 3 fois de suite au démarrage, le module efface automatiquement sa configuration réseau corrompue et redémarre proprement.

Si le ventilateur ne répond plus pendant 15 secondes, le module passe en mode dégradé (LED ambre) : les commandes sont suspendues jusqu'au rétablissement de la communication, puis le fonctionnement reprend automatiquement.

---

## Câblage

Consultez le guide de câblage pour connaître les GPIOs à connecter selon votre carte :

- [Pinout Waveshare ESP32-H2-Zero](wiring/WIRING.md#waveshare-esp32-h2-zero)

---

## Installation dans Zigbee2MQTT

Le converter externe expose toutes les entités de l'appareil dans Z2M : ventilateur, lumière, minuterie, bip, direction, température de couleur, et capteurs DHT22.

**[→ Guide d'installation Z2M complet](../external_converters/README.md)**

---

## Installation dans ZHA (Home Assistant)

Le quirk custom permet à ZHA de reconnaître l'appareil et d'exposer les entités natives Home Assistant.

**[→ Guide d'installation ZHA complet](../zha_quirks/README.md)**
