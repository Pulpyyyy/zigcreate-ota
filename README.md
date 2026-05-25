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
| 🟡 Ambre (1 s on / 2 s off) | Mode dégradé — ventilateur injoignable |
| 🟠 Orange clignotant | Réinitialisation en attente (bouton maintenu) |
| ⚫ Éteinte | Fonctionnement normal |

### Réinitialisation

- **Bouton BOOT (5 s)** — maintenir le bouton BOOT appuyé 5 secondes remet l'appareil en configuration d'usine : effacement du réseau Zigbee mémorisé, des préférences et de l'historique de diagnostics. L'appareil redémarre ensuite en mode appairage.
- **GPIO externe** — un signal bas sur le GPIO de reset externe provoque un redémarrage simple (sans effacement). Consultez le [guide de câblage](wiring/WIRING.md).

### Récupération automatique

Si la connexion Zigbee échoue 3 fois de suite au démarrage, le module efface automatiquement sa configuration réseau et redémarre proprement.

Si le ventilateur ne répond plus pendant 15 secondes, le module passe en mode dégradé (LED ambre) : les commandes sont suspendues jusqu'au rétablissement de la communication, puis le fonctionnement reprend automatiquement.

---

## Câblage

Consultez le guide de câblage pour connaître les GPIOs à connecter selon votre carte :

- [Pinout Waveshare ESP32-H2-Zero](wiring/WIRING.md#waveshare-esp32-h2-zero)

---

## Installation dans Zigbee2MQTT

### 1. Installer le converter externe

> Un **converter** est un fichier JavaScript qui indique à Zigbee2MQTT comment communiquer avec l'appareil : quelles commandes envoyer, comment interpréter les réponses, et quelles entités afficher dans l'interface. Sans ce fichier, Zigbee2MQTT ne sait pas que l'appareil est un ventilateur avec lumière.

Copiez le fichier `external_converters/create_wind_calm.mjs` dans le dossier `data/external_converters/` de votre installation Zigbee2MQTT (créez le dossier s'il n'existe pas).

```
data/
└── external_converters/
    └── create_wind_calm.mjs
```

Déclarez ensuite le converter dans votre `configuration.yaml` :

```yaml
external_converters:
  - create_wind_calm.mjs
```

Redémarrez Zigbee2MQTT. L'appareil **WIND-CALM (CREATE)** sera reconnu automatiquement lors du prochain appairage.

### 2. Ajouter l'icône de l'appareil

Copiez le fichier `device_icons/windcalm.png` dans le dossier `data/images/devices/` de votre installation Zigbee2MQTT (créez le dossier s'il n'existe pas).

```
data/
└── images/
    └── devices/
        └── windcalm.png
```

Ajoutez ensuite l'entrée dans votre `configuration.yaml` :

```yaml
devices:
  '0x<ieee_address>':
    friendly_name: wind_calm
    icon: 'images/devices/windcalm.png'
```

> Remplacez `0x<ieee_address>` par l'adresse IEEE réelle de votre appareil, visible dans l'interface Zigbee2MQTT après appairage.

### 3. Activer les mises à jour OTA

Ajoutez l'index OTA de ce dépôt dans votre `configuration.yaml` :

```yaml
ota:
  zigbee_ota_override_index_location: https://raw.githubusercontent.com/Pulpyyyy/zigcreate-ota/main/ota/index.json
```

Redémarrez Zigbee2MQTT. Les mises à jour firmware seront proposées automatiquement depuis l'interface.

### Entités disponibles dans Zigbee2MQTT

Après appairage, les entités suivantes apparaissent dans l'interface Z2M :

| Entité | Type | Description |
|---|---|---|
| `fan` | Interrupteur | Marche / arrêt du ventilateur |
| `fan_mode` | Liste | Vitesse du ventilateur (1 à 6) |
| `light` | Interrupteur | Marche / arrêt de la lumière |
| `light_color_temp` | Liste | Température de couleur : `cool` / `neutral` / `warm` |
| `timer_preset` | Liste | Minuterie : `off` / `1h` / `2h` / `4h` |
| `timer_countdown` | Capteur | Décompte restant en minutes (lecture seule) |
| `beep` | Interrupteur | Bip sonore actif / silencieux |
| `direction` | Liste | Sens de rotation : `forward` (été) / `reverse` (hiver) |
| `power_on_behavior_light` | Liste | Comportement lumière après coupure |
| `power_on_behavior_beep` | Liste | Comportement bip après coupure |

---

## Installation dans ZHA (Home Assistant)

> **ZHA** est l'intégration Zigbee native de Home Assistant. Elle permet de piloter des appareils Zigbee directement depuis HA, sans logiciel supplémentaire.
>
> Un **quirk** est un fichier Python qui permet à ZHA de reconnaître correctement un appareil non standard et de créer les bonnes entités. Sans ce fichier, ZHA ne sait pas à quoi correspondent les différentes fonctions de l'appareil. C'est l'équivalent du converter pour Zigbee2MQTT.

### 1. Installer le quirk custom

Copiez le fichier `zha_quirks/create_wind_calm.py` dans le dossier `/config/custom_zha_quirks/` de votre installation Home Assistant (créez le dossier s'il n'existe pas).

```
config/
└── custom_zha_quirks/
    └── create_wind_calm.py
```

### 2. Déclarer le dossier de quirks dans Home Assistant

Ajoutez l'entrée suivante dans votre `configuration.yaml` :

```yaml
zha:
  custom_quirks_path: /config/custom_zha_quirks
```

### 3. Réappairer l'appareil

Redémarrez Home Assistant, puis réappairez l'appareil **WIND-CALM (CREATE)**. Les entités suivantes seront créées :

| Fonction | Type d'entité HA | Description |
|---|---|---|
| Ventilateur | Ventilateur natif | Marche/arrêt + vitesse 1 à 6 |
| Lumière | Lumière | Marche/arrêt + température de couleur (Froid / Neutre / Chaud) |
| Minuterie | — | Pas d'entité ZHA native — disponible uniquement via Zigbee2MQTT |
| Bip sonore | Interrupteur | Activation / désactivation du bip |
| Direction | Interrupteur | Éteint = été (brassage vers le bas) · Allumé = hiver (remontée d'air) |

> **Note minuterie sous ZHA :** La minuterie n'est pas accessible directement dans l'interface ZHA. Pour l'utiliser, passez par **Zigbee2MQTT** ou créez une automatisation HA avancée via le service `zha.issue_zigbee_cluster_command`.

### Limitations vs Zigbee2MQTT

- **Température de couleur** : le curseur HA propose une plage continue, mais le firmware n'accepte que 3 valeurs (Froid ~6 500 K, Neutre ~2 700 K, Chaud ~2 000 K).
- **Minuterie** : non accessible directement dans ZHA (voir note ci-dessus).
- **Mises à jour OTA** : les mises à jour sans fil via ZHA ne sont pas supportées. Utilisez Zigbee2MQTT pour les OTA.
