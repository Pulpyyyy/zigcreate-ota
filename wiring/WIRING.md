# Câblage ZigCreate — Pinout par carte

Ce guide décrit les connexions à réaliser entre l'ESP32-H2 et le MCU Tuya du ventilateur, selon la carte utilisée.

---

## Alimentation — point critique

Le MCU Tuya expose une sortie **5 V** qui sert à alimenter l'ESP32-H2 via sa broche **3V3**. Ne jamais alimenter l'ESP32-H2 simultanément via USB et via cette broche — risque de conflit d'alimentation.

---

## Connexions à réaliser (toutes cartes)

| Signal | De | Vers | Remarque |
|---|---|---|---|
| VCC | MCU Tuya — 5 V | ESP32-H2 — broche **3V3** | Alimentation directe |
| GND | MCU Tuya — GND | ESP32-H2 — GND | Masse commune obligatoire |
| TX | ESP32-H2 — GPIO TX | MCU Tuya — RX | |
| RX | MCU Tuya — TX | ESP32-H2 — GPIO RX | |

> La liaison UART fonctionne en **8N1 à 9600 baud**. TX de l'ESP32 → RX du MCU Tuya, et inversement.

---

## Waveshare ESP32-H2-Zero

```
En-têtes de la carte (vue de dessus, USB-C en haut) :

En-tête gauche (haut → bas)   En-tête droit (haut → bas)
  5V                             24 (TX)
  GND  ─── Masse commune         23 (RX)
  3V3  ◄── VCC depuis MCU        25
  0                              22
  1                              14
  2    ◄── EXT_RESET             13
  3                              12
  4    ──► TUYA TX               11
  5    ◄── TUYA RX               10
```

| Fonction | GPIO | Broche en-tête | Remarque |
|---|---|---|---|
| UART TX → MCU Tuya RX | GPIO4 | En-tête gauche, 8e | |
| UART RX ← MCU Tuya TX | GPIO5 | En-tête gauche, 9e | |
| Alimentation entrée | — | En-tête gauche, 3e (**3V3**) | Depuis le 5 V du MCU Tuya |
| Masse | — | En-tête gauche, 2e (**GND**) | Commune avec MCU Tuya |
| LED RGB (WS2812) | GPIO8 | Pad LOG (castellé) | Interne, ne pas câbler |
| Bouton BOOT / Reset Zigbee | GPIO9 | Pad castellé bas | Maintenir 5 s pour reset usine |
| Reset externe (actif bas) | GPIO2 | En-tête gauche, 7e | Redémarrage software |
| USB D+ | GPIO27 | Pad castellé bas | Réservé USB, ne pas utiliser |
| USB D- | GPIO26 | Pad castellé bas | Réservé USB, ne pas utiliser |

### Schéma de câblage

```
Waveshare ESP32-H2-Zero          MCU Tuya
┌──────────────────┐            ┌──────────┐
│  3V3         ◄───┼────────────│ 5V       │
│  GND         ────┼────────────│ GND      │
│  GPIO4  (TX) ────┼────────────│ RX       │
│  GPIO5  (RX) ◄───┼────────────│ TX       │
│  GPIO2 (RST) ◄───┼────────────│ EN       │
└──────────────────┘            └──────────┘
```

---

## Reset externe (optionnel)

Un niveau bas (GND) bref sur ce GPIO provoque un redémarrage software, sans effacer le réseau Zigbee ni les préférences.

| Carte | GPIO | Broche en-tête |
|---|---|---|
| ESP32-H2-Zero | GPIO2 | En-tête gauche, 7e |

> Pour un reset usine complet (effacement réseau + préférences), utiliser le bouton BOOT maintenu **5 secondes**.
