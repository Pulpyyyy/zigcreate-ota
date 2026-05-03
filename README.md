# ZigCreate OTA — Bridge Zigbee pour ventilateur de plafond

Transformez votre ventilateur Tuya en appareil Zigbee natif, pilotable depuis votre box domotique favorite.

---

## Ce que vous pouvez contrôler

| Fonction      | Description                                               |
|---------------|-----------------------------------------------------------|
| Ventilateur   | Marche/arrêt et 6 niveaux de vitesse                      |
| Lumière       | Allumage/extinction et température de couleur (Froid/Neutre/Chaud) |
| Minuteur      | Extinction automatique à 60, 120 ou 240 minutes           |
| Son           | Activation / désactivation du bip de confirmation         |
| Direction     | Mode Été (brassage vers le bas) ou Hiver (remontée d'air chaud) |

---

## Fonctionnalités

- **Contrôle depuis l'appli** — Toutes les commandes sont disponibles depuis votre interface domotique.
- **Synchronisation en temps réel** — Utiliser la télécommande physique met à jour l'état dans l'appli instantanément.
- **Mises à jour sans fil** — Le firmware se met à jour par liaison radio (OTA), sans démontage ni câble.
- **Réinitialisation facile** — Un appui long de 5 secondes sur le bouton BOOT remet l'appareil en configuration d'usine.

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
