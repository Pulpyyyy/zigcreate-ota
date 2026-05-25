# ZigCreate OTA — Bridge Zigbee pour ventilateur de plafond

Transformez votre ventilateur Tuya en appareil Zigbee natif, pilotable depuis votre box domotique favorite.

---

## Ce que vous pouvez contrôler

| Entité | Contrôles disponibles |
|---|---|
| **Ventilateur** | Marche/arrêt · 6 niveaux de vitesse |
| **Lumière** | Marche/arrêt · Température de couleur (Froid / Neutre / Chaud) |
| **Minuterie** | Préréglages 1 h / 2 h / 4 h · Décompte visible en temps réel · Réinitialisation automatique à OFF en fin de décompte |
| **Son** | Activation / désactivation du bip de confirmation |
| **Direction** | Mode Été (brassage vers le bas) · Mode Hiver (remontée d'air chaud) |
| **Comportement après coupure** | État de la lumière et du son configurables (éteint / allumé / bascule / restauration) |

---

## Fonctionnalités

### Contrôle complet depuis l'interface domotique

Toutes les commandes sont disponibles depuis Zigbee2MQTT ou toute box compatible Zigbee :

- **Ventilateur** — marche/arrêt indépendant de la vitesse ; la vitesse peut être réglée de 1 à 6 sans éteindre le ventilateur. La dernière vitesse est mémorisée et restaurée à la prochaine mise en marche.
- **Lumière** — marche/arrêt avec mémorisation de l'état ; température de couleur en 3 paliers : Froid (~6 500 K), Neutre (~2 700 K), Chaud (~2 000 K).
- **Minuterie** — déclenche l'extinction automatique après 1 h, 2 h ou 4 h. Le décompte restant (en minutes) est visible en temps réel dans l'interface. Le préréglage repasse automatiquement à `OFF` lorsque le décompte atteint zéro.
- **Son (bip)** — active ou désactive le bip sonore émis par l'appareil lors de chaque commande.
- **Direction** — inverse le sens de rotation du ventilateur pour le mode Hiver.

### Synchronisation en temps réel

Utiliser la télécommande physique (vitesse, on/off, direction…) met à jour l'état dans l'interface domotique instantanément, sans attendre le prochain poll. L'état est également resynchronisé automatiquement à chaque redémarrage du module.

### Comportement au démarrage configurable (StartUpOnOff)

L'attribut ZCL `StartUpOnOff` est supporté pour la lumière et le son, ce qui permet de définir via l'interface l'état souhaité après une coupure de courant :

| Valeur | Comportement |
|---|---|
| `off` | Toujours éteint au démarrage |
| `on` | Toujours allumé au démarrage |
| `toggle` | Inverse l'état précédent |
| `previous` (défaut lumière) | Restaure l'état avant la coupure |

La température de couleur est également restaurée automatiquement à la valeur avant coupure. Par défaut, le bip démarre toujours désactivé.

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
| 🟡 Ambre (1 s on / 2 s off) | Mode dégradé — MCU injoignable |
| 🟠 Orange clignotant | Réinitialisation en attente (bouton maintenu) |
| ⚫ Éteinte | Fonctionnement normal |

### Réinitialisation

- **Bouton BOOT (5 s)** — maintenir le bouton BOOT appuyé 5 secondes remet l'appareil en configuration d'usine : effacement du réseau Zigbee mémorisé, des préférences et de l'historique de diagnostics. L'appareil redémarre ensuite en mode appairage.
- **GPIO externe** — un signal bas sur le GPIO de reset externe provoque un redémarrage simple (sans effacement). Le GPIO concerné dépend de la carte — consultez le [guide de câblage](wiring/WIRING.md).

### Auto-recovery Zigbee

Si la stack Zigbee échoue à démarrer 3 fois consécutives (détection de boucle de crash), le module efface automatiquement le stockage Zigbee corrompu et redémarre proprement.

### Mode dégradé MCU

Si le MCU Tuya ne répond plus pendant 15 secondes, le module passe en mode dégradé : les commandes Zigbee vers le ventilateur sont ignorées et la LED passe en ambre. Dès que le MCU répond à nouveau, le module reprend son fonctionnement normal automatiquement.

---

## Câblage

Consultez le guide de câblage pour connaître les GPIOs à connecter selon votre carte :

- [Pinout Waveshare ESP32-H2-Zero](wiring/WIRING.md#waveshare-esp32-h2-zero)

---

## Installation dans Zigbee2MQTT

### 1. Installer le converter externe

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

Redémarrez Zigbee2MQTT. L'appareil **WIND-CALM (CREATE)** sera reconnu automatiquement à la prochaine association.

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

---

## Installation dans ZHA (Home Assistant)

> ZHA est l'intégration Zigbee native de Home Assistant. L'appareil est supporté via un **quirk custom** (équivalent du converter externe pour Z2M).

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

| Endpoint | Type d'entité HA | Fonction |
|---|---|---|
| EP1 | Ventilateur natif | Ventilateur — marche/arrêt + vitesse 1 à 6 (cluster FanControl 0x0202) |
| EP2 | Lumière température couleur | Lumière — 3 paliers : 153 / 370 / 500 mireds |
| EP4 | Interrupteur | Bip sonore (activation / désactivation) |
| EP5 | Interrupteur | Direction (éteint = été / allumé = hiver) |

> **Note :** La minuterie (EP3) n'a pas d'entité HA standard. Elle peut être pilotée via le service `zha.issue_zigbee_cluster_command` dans des automatisations (cluster `LevelControl`, commande `moveToLevel`, `level` = durée en minutes : 60, 120 ou 240).

### Limitations vs Zigbee2MQTT

- **Température de couleur** : le slider HA est continu, mais le firmware n'accepte que 3 valeurs (153, 370, 500 mireds).
- **Mises à jour OTA** : les OTA via ZHA ne sont pas supportées pour ce firmware.
