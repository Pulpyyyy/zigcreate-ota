# Câblage ZigCreate — Pinout par carte

Ce guide décrit les connexions à réaliser entre l'ESP32-H2 et le MCU Tuya du ventilateur, selon la carte utilisée.

---

## Alimentation — point critique

Le MCU Tuya expose une sortie **5 V** qui sert à alimenter l'ESP32-H2 via sa broche **5V**. Ne jamais alimenter l'ESP32-H2 simultanément via USB et via cette broche — risque de conflit d'alimentation.

---

## Connexions à réaliser (toutes cartes)

| Signal | De | Vers | Remarque |
|---|---|---|---|
| VCC | MCU Tuya — 5 V | ESP32-H2 — broche **5V** | Alimentation directe |
| GND | MCU Tuya — GND | ESP32-H2 — GND | Masse commune obligatoire |
| TX | ESP32-H2 — GPIO TX | MCU Tuya — RX | |
| RX | MCU Tuya — TX | ESP32-H2 — GPIO RX | |

> La liaison UART fonctionne en **8N1 à 9600 baud**. TX de l'ESP32 → RX du MCU Tuya, et inversement.

---

## Waveshare ESP32-H2-Zero

```
En-têtes de la carte (vue de dessus, USB-C en haut) :

En-tête gauche (haut → bas)   En-tête droit (haut → bas)
  5V   ◄── VCC depuis MCU        24 (TX)
  GND  ─── Masse commune         23 (RX)
  3V3                             25
  0                              22
  1                              14
  2    ◄── EXT_RESET             13
  3    ◄── DHTxx DATA             12
  4    ──► TUYA TX               11
  5    ◄── TUYA RX               10
```

| Fonction | GPIO | Broche en-tête | Remarque |
|---|---|---|---|
| UART TX → MCU Tuya RX | GPIO4 | En-tête gauche, 8e | |
| UART RX ← MCU Tuya TX | GPIO5 | En-tête gauche, 9e | |
| Alimentation entrée | — | En-tête gauche, 1e (**5V**) | Depuis le 5 V du MCU Tuya |
| Masse | — | En-tête gauche, 2e (**GND**) | Commune avec MCU Tuya |
| LED RGB (WS2812) | GPIO8 | Pad LOG (castellé) | Interne, ne pas câbler |
| Bouton BOOT / Reset Zigbee | GPIO9 | Pad castellé bas | En fonctionnement normal : maintenir 5 s pour reset usine. Pour le flash : voir [FLASH.md](../flash/FLASH.md) |
| Reset externe (actif bas) | GPIO2 | En-tête gauche, 7e | Redémarrage software |
| Capteur T°/HR DATA (optionnel) | GPIO3 | En-tête gauche, 8e | Voir section [Capteur T°/HR](#capteur-de-température--humidité-optionnel) |
| USB D+ | GPIO27 | Pad castellé bas | Réservé USB, ne pas utiliser |
| USB D- | GPIO26 | Pad castellé bas | Réservé USB, ne pas utiliser |

### Schéma de câblage

```
Waveshare ESP32-H2-Zero          MCU Tuya
┌──────────────────┐            ┌──────────┐
│  5V          ◄───┼────────────│ 5V       │
│  GND         ────┼────────────│ GND      │
│  GPIO4  (TX) ────┼────────────│ RX       │
│  GPIO5  (RX) ◄───┼────────────│ TX       │
│  GPIO2 (RST) ◄───┼────────────│ EN       │
└──────────────────┘            └──────────┘
```

### Photos du câblage

ESP32-H2-Zero avec les connecteurs Dupont :

![ESP32-H2-Zero câblé](../pcb/H2%20zero/28e13aca6d04eea212abd1fd432b93a9633fbf5a.jpeg)

MCU Tuya côté ventilateur :

![MCU Tuya câblé](../pcb/H2%20zero/df2e5fe1d76eeea9446db5ca287b730bad6cc78a.jpeg)

---

## Reset externe (optionnel)

Un niveau bas (GND) bref sur ce GPIO provoque un redémarrage software, sans effacer le réseau Zigbee ni les préférences.

| Carte | GPIO | Broche en-tête |
|---|---|---|
| ESP32-H2-Zero | GPIO2 | En-tête gauche, 7e |
| ESP32-H2 Super Mini | GPIO14 | |

> Pour un reset usine complet (effacement réseau + préférences), utiliser le bouton BOOT maintenu **5 secondes**.

---

## Capteur de température / humidité (optionnel)

Le firmware intègre la prise en charge d'un capteur **DHT22** ou **DHT11** pour reporter la température et l'humidité ambiantes via Zigbee. Ce capteur est **entièrement optionnel** : sans lui, toutes les autres fonctions restent opérationnelles.

> **DHT11 ou DHT22 ?** Le câblage est identique (même protocole 1 fil) et le firmware **détecte automatiquement** le capteur branché (DHT22, DHT11 ou aucun) — rien à configurer. Au démarrage il sonde les deux familles et verrouille celle qui répond ; si aucun capteur n'est présent, la tâche se contente d'avertir sans perturber le reste. Le DHT22 est plus précis et couvre les températures négatives ; le DHT11 est moins cher mais limité (0–50 °C, ±2 °C, ±5 % HR, résolution 1°).

### Module PCB recommandé

> Utiliser de préférence un **module sur PCB** (3 broches : VCC, DATA, GND). Ces modules intègrent la résistance de pull-up et le condensateur de découplage — aucun composant externe à ajouter.
>
> Le capteur nu (4 broches) nécessite l'ajout d'une résistance de 4,7 kΩ à 10 kΩ entre VCC et DATA, et d'un condensateur 100 nF entre VCC et GND.

### Connexions

| Signal | Module capteur | ESP32-H2 | Remarque |
|---|---|---|---|
| VCC | VCC | **3,3 V** | Ne pas alimenter en 5 V |
| GND | GND | GND | Masse commune |
| DATA | DATA | GPIO selon carte | Voir tableau ci-dessous |

| Carte | GPIO DATA capteur | Broche en-tête |
|---|---|---|
| ESP32-H2-Zero | GPIO3 | En-tête gauche, 8e |
| ESP32-H2 Super Mini | GPIO2 | |

### Entités Zigbee générées

Une fois câblé, le firmware reporte automatiquement la température et l'humidité toutes les 60 secondes :

| Entité | Cluster ZCL | Précision |
|---|---|---|
| `temperature` | TemperatureMeasurement (0x0402) | 0,1 °C |
| `humidity` | RelativeHumidity (0x0405) | 0,1 % |

> Sous **Zigbee2MQTT**, ces entités sont **désactivées par défaut** — les activer manuellement dans l'interface HA si souhaité.
> Sous **ZHA**, les entités température et humidité sont créées actives.
