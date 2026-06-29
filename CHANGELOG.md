# Changelog

Historique des évolutions du firmware. Chaque version correspond à une mise à jour
`vAAAAMMJJ-HHMM` (date et heure de build).

<!--
Note maintenance (dev) : remplir la section [Unreleased] ci-dessous en langage utilisateur.
La CI la publie comme notes de release et remplace "[Unreleased]" par le vrai numéro de
version (voir .github/workflows/build.yml). Ne pas éditer la copie du repo OTA : régénérée.
-->

## v20260629-2033

### Nouveautés
- **Mises à jour OTA fiables** : la mise à jour du firmware par Zigbee (sans fil) va
  désormais jusqu'au bout, même quand le signal radio est faible ou perturbé — plus besoin
  de démonter l'appareil pour le brancher en USB. Les versions précédentes sont à flasher via USB.

### Améliorations
- **Température / humidité un peu plus fiables** : les valeurs aberrantes dues aux parasites
  électriques (ventilateur, etc.) sont écartées automatiquement.
