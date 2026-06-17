# Dépannage ZigCreate

Ce guide couvre les problèmes rencontrés **en fonctionnement** (après flash et câblage). Pour les problèmes liés au flash USB, voir [FLASH.md § Dépannage](flash/FLASH.md#dépannage). Pour la préparation et le test à blanc avant soudure, voir [WIRING.md § Préparation & test à blanc](wiring/WIRING.md#préparation--test-à-blanc-avant-soudure-définitive).

---

## Comprendre la LED

La LED RGB intégrée est le premier outil de diagnostic. Rappel des états :

| Couleur / comportement | Signification |
|---|---|
| 🟠 Orange (ramping) | Démarrage en cours |
| 🔵 Cyan clignotant (0,5 s) | Recherche d'un réseau Zigbee (appairage) |
| 🟢 3 flashes verts | Appairage réussi |
| 🔴 Rouge clignotant rapide | Échec de connexion Zigbee, nouvelle tentative |
| 🟡 Ambre (1 s on / 2 s off) | Mode dégradé — MCU ventilateur injoignable |
| 🟠 Orange clignotant | Réinitialisation en attente (bouton BOOT maintenu) |
| ⚫ Éteinte | Fonctionnement normal |

---

## Tableau de dépannage

| Symptôme | Cause probable | Solution |
|---|---|---|
| 🟡 **LED ambre** (1 s on / 2 s off) | Le MCU est silencieux depuis **plus de 15 s** : TX/RX inversés, masse non commune, mauvaise soudure, ou baud ≠ 9600 | Vérifier que **TX et RX sont croisés** (ESP TX → MCU RX, MCU TX → ESP RX), la masse commune et les soudures. Le module repasse en fonctionnement normal dès que le MCU répond. |
| Commandes sans effet, LED éteinte | Liaison UART partiellement fonctionnelle (un seul fil en défaut) | Contrôler chaque fil UART individuellement |
| 🔴 **Rouge clignotant rapide** | Échec du *steering* Zigbee : coordinateur hors portée ou réseau saturé | Rapprocher le module du coordinateur, rouvrir le mode appairage côté box |
| 🔵 **Cyan en continu** | Aucun réseau trouvé (le module est en mode appairage) | Ouvrir l'appairage côté box ; vérifier le canal et la portée |
| **Redémarrages en boucle (bootloop)** | Carte **ESP32-H2 Super Mini** (régulateur de tension insuffisant) — piste abandonnée | Utiliser la **Waveshare ESP32-H2-Zero**, alimentée en **3,3 V** depuis le MCU |
| Reboot Zigbee spontané au démarrage | Récupération automatique : après 3 échecs de connexion consécutifs, le firmware efface le réseau corrompu et redémarre | Comportement normal — laisser le module réappairer |
| **DHT : pas de valeurs** | Résistance de pull-up absente (capteur nu), alimentation en 5 V, ou mauvais GPIO | Préférer un module 3 broches (pull-up intégrée), alimenter en **3,3 V**, DATA sur **GPIO3** (ESP32-H2-Zero) |
| Reset usine impossible | Bouton BOOT pas maintenu assez longtemps | Maintenir **BOOT 5 s** (GPIO9) — la LED passe orange clignotant pour confirmer le reset en attente |
| Carte ne démarre pas / instable | Conflit d'alimentation USB + 3,3 V simultanés | N'alimenter que par **une seule** source à la fois |

---

## Récupération automatique (intégrée au firmware)

- **Réseau Zigbee corrompu** : si la connexion échoue 3 fois de suite au démarrage, le module efface automatiquement sa configuration réseau et redémarre proprement.
- **Mode dégradé** : si le MCU du ventilateur ne répond plus pendant 15 s, le module passe en LED ambre et suspend les commandes ; le fonctionnement reprend automatiquement dès le rétablissement de la communication.

---

## Réinitialisation manuelle

- **Reset usine** (efface réseau Zigbee + préférences + diagnostics) : maintenir **BOOT 5 s**. Le module redémarre en mode appairage.
- **Redémarrage simple** (sans effacement) : signal bas bref sur le GPIO de reset externe (GPIO2 sur l'ESP32-H2-Zero). Voir [WIRING.md § Reset externe](wiring/WIRING.md#reset-externe-optionnel).
