# Architecture logicielle

Le projet est structuré en plusieurs composants interdépendants :

- **`tuya_protocol`** : Gère la couche physique UART et le décodage des trames série Tuya (`0x55 0xAA`).
- **`tuya_mcu_device`** : Traduit les Datapoints (DP) bruts en actions logiques (ex: `DP 0x3E` → vitesse du ventilateur).
- **`zigbee_device`** : Gère la pile Zigbee, définit les Endpoints (points d'accès) et les clusters ZCL (On/Off, Level Control, Color Control).
- **`led_indicator`** : Fournit un retour visuel sur l'état du système (appairage, erreur, réinitialisation) via une LED RGB WS2812.

---

## Configuration des Endpoints Zigbee

L'appareil expose 5 Endpoints distincts pour permettre un contrôle granulaire via l'interface Zigbee :

| Endpoint | Fonction   | Clusters utilisés          | Description                                          |
|----------|------------|----------------------------|------------------------------------------------------|
| EP 1     | Ventilateur | On/Off, Level Control      | Contrôle marche/arrêt et vitesse (1 à 6).            |
| EP 2     | Lumière    | On/Off, Level, Color       | Luminosité et température de couleur (Froid/Neutre/Chaud). |
| EP 3     | Minuteur   | Level Control              | Définit le délai d'extinction (60, 120 ou 240 min).  |
| EP 4     | Bip        | On/Off                     | Active ou désactive le retour sonore du MCU.         |
| EP 5     | Direction  | On/Off                     | Alterne entre mode Été (forward) et Hiver (reverse). |

---

## Fonctionnalités Clés

### 1. Synchronisation des états (Bi-directionnelle)

- **Zigbee → MCU** : Lorsqu'un utilisateur change la vitesse sur son application, le bridge convertit le niveau ZCL (0-254) en une valeur Tuya (1-6) et l'envoie via l'UART.
- **MCU → Zigbee** : Si l'utilisateur utilise la télécommande physique RF, le MCU informe le bridge via UART. Le bridge met alors à jour ses attributs Zigbee et envoie un rapport au coordinateur pour synchroniser l'interface mobile.

### 2. Gestion de la Température de Couleur

Le système convertit les mireds Zigbee (153 à 500) en trois paliers Tuya :

| Palier  | Valeur Tuya | Mireds |
|---------|-------------|--------|
| Froid   | ≤ 250       | 153    |
| Neutre  | 251 - 750   | 370    |
| Chaud   | > 750       | 500    |

### 3. Mise à jour OTA (Over-The-Air)

Le code inclut un client OTA Zigbee complet. Il permet de mettre à jour le firmware de l'ESP32 sans connexion physique. Le processus gère l'écriture en partition secondaire et le redémarrage automatique après validation.

### 4. Réinitialisation d'usine

Un appui long de 5 secondes sur le bouton BOOT (`GPIO9`) déclenche une procédure de *Factory Reset* qui efface les données d'appairage Zigbee (partitions `zb_storage` et `zb_fct`) et redémarre l'appareil.