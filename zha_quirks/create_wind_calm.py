"""ZHA quirk for CREATE WIND-CALM ceiling fan (ESP32-H2 Zigbee bridge).

Installation:
  1. Copier ce fichier dans /config/custom_zha_quirks/
  2. Ajouter dans configuration.yaml :
       zha:
         custom_quirks_path: /config/custom_zha_quirks
  3. Redémarrer Home Assistant et réappairer l'appareil.

Mapping des endpoints :
  EP1 — Ventilateur  : FanControl 0x0202 (fanMode 0=off, 1-6=vitesse) + OnOff 0x0006 (on/off simple, binding direct)
  EP2 — Lumière      : OnOff + ColorControl (température couleur en mireds)
  EP3 — Minuterie    : LevelControl (niveau = minutes restantes, 0-240)
  EP4 — Bip          : OnOff + StartUpOnOff (0x4003)
  EP5 — Direction    : OnOff (OFF=été/forward, ON=hiver/reverse)
  EP6 — Capteur      : TemperatureMeasurement + RelativeHumidity (DHT11/DHT22, optionnel)
  EP7 — Firmware OTA : OnOff (OFF=build release, ON=build debug — bascule + reboot)

Notes :
  - EP1 expose une entité fan native HA grâce au cluster FanControl 0x0202.
    fanMode 0=off, 1-6=vitesse. Les 6 vitesses correspondent aux modes ZCL
    off/low/medium/high/on/auto/smart dont seuls 0-6 sont utilisés.
  - EP3 (minuterie) n'a pas d'entité HA standard ; piloter via zha.issue_zigbee_cluster_command
    ou des automatisations.
  - La température de couleur est continue dans le slider HA mais le firmware
    n'accepte que 3 valeurs (153, 370, 500 mireds).
"""

from zigpy.profiles import zha
from zigpy.zcl.clusters.general import (
    Basic,
    Groups,
    Identify,
    LevelControl,
    OnOff,
    Ota,
    Scenes,
)
from zigpy.zcl.clusters.hvac import Fan
from zigpy.zcl.clusters.lighting import ColorControl
from zigpy.zcl.clusters.measurement import RelativeHumidity, TemperatureMeasurement
from zhaquirks import CustomDevice
from zhaquirks.const import (
    DEVICE_TYPE,
    ENDPOINTS,
    INPUT_CLUSTERS,
    MODELS_INFO,
    OUTPUT_CLUSTERS,
    PROFILE_ID,
)


class CreateWindCalm(CustomDevice):
    """CREATE WIND-CALM — ventilateur de plafond avec lumière (pont Zigbee ESP32-H2)."""

    MODELS_INFO = {("CREATE", "WIND-CALM")}

    replacement = {
        ENDPOINTS: {
            # --- EP1 : Ventilateur ---
            # FanControl → fanMode : 0=off, 1-6=vitesse
            # OnOff      → marche/arrêt simple (binding direct, ex. NSPanel/interrupteur)
            # HA : entité fan native (marche/arrêt + 6 vitesses)
            1: {
                PROFILE_ID: zha.PROFILE_ID,
                DEVICE_TYPE: 0x0300,           # HA Fan
                INPUT_CLUSTERS: [
                    Basic.cluster_id,          # 0x0000
                    OnOff.cluster_id,          # 0x0006 — on/off simple en plus du FanControl
                    Fan.cluster_id,            # 0x0202
                ],
                OUTPUT_CLUSTERS: [
                    Ota.cluster_id,            # 0x0019 — client OTA (mises à jour sans fil)
                ],
            },

            # --- EP2 : Lumière ---
            # OnOff        → marche/arrêt de la lumière
            # ColorControl → température de couleur (3 paliers : 153 / 370 / 500 mireds)
            # HA : entité lumière avec curseur température couleur
            2: {
                PROFILE_ID: zha.PROFILE_ID,
                DEVICE_TYPE: zha.DeviceType.COLOR_TEMPERATURE_LIGHT,
                INPUT_CLUSTERS: [
                    OnOff.cluster_id,          # 0x0006
                    ColorControl.cluster_id,   # 0x0300
                ],
                OUTPUT_CLUSTERS: [],
            },

            # --- EP3 : Minuterie ---
            # LevelControl → currentLevel = minutes restantes (0-240)
            #   level=60  → minuterie 1h
            #   level=120 → minuterie 2h
            #   level=240 → minuterie 4h
            #   level=0   → minuterie désactivée
            # HA : pas d'entité standard — utiliser zha.issue_zigbee_cluster_command
            3: {
                PROFILE_ID: zha.PROFILE_ID,
                DEVICE_TYPE: zha.DeviceType.LEVEL_CONTROL_SWITCH,
                INPUT_CLUSTERS: [
                    LevelControl.cluster_id,   # 0x0008
                ],
                OUTPUT_CLUSTERS: [],
            },

            # --- EP4 : Bip sonore ---
            # OnOff        → activation/désactivation du bip de confirmation
            # StartUpOnOff → comportement après coupure (attr 0x4003)
            # HA : entité interrupteur
            4: {
                PROFILE_ID: zha.PROFILE_ID,
                DEVICE_TYPE: zha.DeviceType.ON_OFF_SWITCH,
                INPUT_CLUSTERS: [
                    OnOff.cluster_id,          # 0x0006
                ],
                OUTPUT_CLUSTERS: [],
            },

            # --- EP5 : Direction du ventilateur ---
            # OnOff → OFF=mode été (brassage vers le bas) / ON=mode hiver (remontée)
            # HA : entité interrupteur
            5: {
                PROFILE_ID: zha.PROFILE_ID,
                DEVICE_TYPE: zha.DeviceType.ON_OFF_SWITCH,
                INPUT_CLUSTERS: [
                    OnOff.cluster_id,          # 0x0006
                ],
                OUTPUT_CLUSTERS: [],
            },

            # --- EP6 : capteur température + humidité (DHT11/DHT22) ---
            # TemperatureMeasurement → measuredValue (0.01 °C)
            # RelativeHumidity       → measuredValue (0.01 %)
            # HA : entités sensor désactivées par défaut
            6: {
                PROFILE_ID: zha.PROFILE_ID,
                DEVICE_TYPE: zha.DeviceType.TEMPERATURE_SENSOR,
                INPUT_CLUSTERS: [
                    TemperatureMeasurement.cluster_id,  # 0x0402
                    RelativeHumidity.cluster_id,        # 0x0405
                ],
                OUTPUT_CLUSTERS: [],
            },

            # --- EP7 : Bascule firmware OTA ---
            # OnOff → OFF=canal release / ON=canal debug.
            # Basculer fait persister le choix et redémarre l'appareil, qui télécharge
            # alors le firmware du canal correspondant. Contrôle de maintenance.
            7: {
                PROFILE_ID: zha.PROFILE_ID,
                DEVICE_TYPE: zha.DeviceType.ON_OFF_SWITCH,
                INPUT_CLUSTERS: [
                    OnOff.cluster_id,          # 0x0006
                ],
                OUTPUT_CLUSTERS: [],
            },
        }
    }
