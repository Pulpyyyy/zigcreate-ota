# Installation du converter Zigbee2MQTT

> Un **converter** est un fichier qui indique à Zigbee2MQTT comment communiquer avec l'appareil et quelles entités exposer.

---

## 1. Copier le converter

L'emplacement du dossier `external_converters/` dépend de votre installation Z2M :

| Installation | Chemin |
|---|---|
| **Add-on HA** | même dossier que `configuration.yaml` (ex. `/config/zigbee2mqtt/external_converters/`) |
| **LXC / Docker** | `data/external_converters/` dans le répertoire de données Z2M |

Créez le dossier s'il n'existe pas et copiez-y `create_wind_calm.mjs`.

---

## 2. Déclarer le converter

### Option A — via l'interface Z2M

Dans Z2M → **Paramètres** → **External converters**, ajoutez `create_wind_calm.mjs` directement depuis l'UI.

### Option B — via `configuration.yaml`

Ajoutez dans `configuration.yaml` :

```yaml
advanced:
  enable_external_js: true

external_converters:
  - create_wind_calm.mjs
```

Redémarrez Zigbee2MQTT. L'appareil **WIND-CALM (CREATE)** sera reconnu automatiquement lors du prochain appairage.

![Converter déclaré dans configuration.yaml](https://raw.githubusercontent.com/Pulpyyyy/zigcreate-ota/main/img/z2m_config_converter.png)

---

## 3. Ajouter l'icône de l'appareil

Copiez le fichier `device_icons/windcalm.png` dans le dossier `images/devices/` au même niveau que `configuration.yaml` (créez le dossier s'il n'existe pas).

Ajoutez ensuite l'entrée dans votre `configuration.yaml` :

```yaml
devices:
  '0x<ieee_address>':
    friendly_name: wind_calm
    icon: 'images/devices/windcalm.png'
```

> Remplacez `0x<ieee_address>` par l'adresse IEEE réelle de votre appareil, visible dans l'interface Zigbee2MQTT après appairage.

![Appareil avec icône dans la liste des appareils Z2M](https://raw.githubusercontent.com/Pulpyyyy/zigcreate-ota/main/img/z2m_device_icon.png)

---

## 4. Activer les mises à jour OTA

```yaml
ota:
  zigbee_ota_override_index_location: https://raw.githubusercontent.com/Pulpyyyy/zigcreate-ota/main/ota/index.json
```

Redémarrez Zigbee2MQTT. Les mises à jour firmware seront proposées automatiquement.

![Mise à jour OTA disponible dans Z2M](https://raw.githubusercontent.com/Pulpyyyy/zigcreate-ota/main/img/z2m_ota_update.png)

---

## 5. Appairer l'appareil

Activez le mode appairage dans Zigbee2MQTT, puis mettez le module sous tension (ou maintenez BOOT 5 s pour réinitialiser).

La LED clignote en **cyan** pendant la recherche de réseau, puis effectue **3 flashes verts** à la réussite.

---

## Entités disponibles

| Entité | Type | Description |
|---|---|---|
| `fan` | Interrupteur | Marche / arrêt du ventilateur |
| `fan_mode` | Liste | Vitesse du ventilateur (1 à 6) |
| `light` | Interrupteur | Marche / arrêt de la lumière |
| `color_step` | Interrupteur momentané | Température de couleur — **cycle uniquement** : passer sur **ON** avance d'un cran (froid→neutre→chaud→…) puis revient à **OFF** automatiquement. Cette ampoule ne permet PAS de choisir une couleur absolue, et il n'y a pas d'état couleur fiable. |
| `timer_preset` | Liste | Minuterie : `off` / `1h` / `2h` / `4h` |
| `timer_countdown` | Capteur | Décompte restant en minutes (lecture seule) |
| `beep` | Interrupteur | Bip sonore actif / silencieux |
| `direction` | Liste | Sens de rotation : `forward` (été) / `reverse` (hiver) |
| `power_on_behavior_light` | Liste | Comportement lumière après coupure |
| `power_on_behavior_beep` | Liste | Comportement bip après coupure |
| `temperature` | Capteur | Température ambiante (°C) — **désactivée par défaut** · requiert un capteur DHT11/DHT22 |
| `humidity` | Capteur | Humidité relative (%) — **désactivée par défaut** · requiert un capteur DHT11/DHT22 |
| `debug_firmware` | Interrupteur (config) | Bascule OTA du firmware : `ON` = build debug, `OFF` = build release. L'appareil persiste le choix, redémarre et télécharge l'image du canal correspondant. Outil de maintenance/dev. |

![Toutes les entités dans l'interface Z2M](https://raw.githubusercontent.com/Pulpyyyy/zigcreate-ota/main/img/z2m_entities.png)

> Les entités `temperature` et `humidity` nécessitent un capteur DHT11/DHT22 câblé sur le module (voir [câblage](../docs/wiring/WIRING.md#capteur-de-température--humidité-optionnel)).
>
> L'interrupteur `debug_firmware` permet de passer un appareil déployé du firmware release au firmware debug (et inversement) **entièrement par OTA**, sans repasser par l'USB. Les deux canaux (release / debug) sont publiés automatiquement par la CI ; basculer l'interrupteur fait que l'appareil réclame l'image de l'autre canal au prochain cycle OTA.

