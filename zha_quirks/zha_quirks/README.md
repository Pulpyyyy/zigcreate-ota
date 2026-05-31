# Installation du quirk ZHA (Home Assistant)

> **ZHA** est l'intégration Zigbee native de Home Assistant.
> Un **quirk** est un fichier de personnalisation qui permet à ZHA de reconnaître correctement un appareil non standard. C'est l'équivalent du converter pour Zigbee2MQTT.

---

## 1. Copier le quirk

Copiez le fichier `create_wind_calm.py` dans le dossier `/config/custom_zha_quirks/` de votre installation Home Assistant (créez le dossier s'il n'existe pas).

```
config/
└── custom_zha_quirks/
    └── create_wind_calm.py
```

![Quirk copié dans le dossier custom_zha_quirks via l'éditeur de fichiers HA](img/zha_quirk_file.png)

---

## 2. Déclarer le dossier de quirks dans configuration.yaml

```yaml
zha:
  custom_quirks_path: /config/custom_zha_quirks
```

![Entrée zha dans configuration.yaml](img/zha_config_yaml.png)

---

## 3. Réappairer l'appareil

Redémarrez Home Assistant, puis réappairez l'appareil **WIND-CALM (CREATE)**.

Activez le mode appairage ZHA depuis **Paramètres → Appareils et services → ZHA → Ajouter un appareil**, puis mettez le module sous tension (ou maintenez BOOT 5 s pour réinitialiser).

La LED clignote en **cyan** pendant la recherche de réseau, puis effectue **3 flashes verts** à la réussite.

![Appareil WIND-CALM reconnu lors de l'appairage ZHA](img/zha_pairing.png)

---

## Entités disponibles

| Fonction | Type d'entité HA | Description |
|---|---|---|
| Ventilateur | Ventilateur natif | Marche/arrêt + vitesse 1 à 6 |
| Lumière | Lumière | Marche/arrêt + température de couleur (Froid / Neutre / Chaud) |
| Minuterie | — | Pas d'entité ZHA native — disponible uniquement via Zigbee2MQTT |
| Bip sonore | Interrupteur | Activation / désactivation du bip |
| Direction | Interrupteur | Éteint = été (brassage vers le bas) · Allumé = hiver (remontée d'air) |
| Température | Capteur | Température ambiante (°C) — requiert DHT22 |
| Humidité | Capteur | Humidité relative (%) — requiert DHT22 |

![Page de l'appareil dans Home Assistant avec toutes ses entités](img/zha_device_entities.png)

---

## Limitations vs Zigbee2MQTT

- **Température de couleur** : le slider HA propose une plage continue, mais le firmware n'accepte que 3 valeurs (Froid ~6 500 K, Neutre ~2 700 K, Chaud ~2 000 K).
- **Minuterie** : non accessible directement dans ZHA. Pour l'utiliser, passez par **Zigbee2MQTT** ou créez une automatisation HA avancée via le service `zha.issue_zigbee_cluster_command`.
- **Mises à jour OTA** : les mises à jour sans fil via ZHA ne sont pas supportées. Utilisez Zigbee2MQTT pour les OTA.
