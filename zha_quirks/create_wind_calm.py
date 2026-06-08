"""ZHA quirk for CREATE WIND-CALM ceiling fan (ESP32-H2 Zigbee bridge).

Quirks V2 — feature-parity (best effort) with the Zigbee2MQTT converter:
  • EP1 Fan      : native fan entity (FanControl) + a `fan_speed` number 1-6
  • EP2 Light    : native light entity + a `color_step` button (cycle-only: each press
                   advances one colour step — this lamp can't set an absolute colour)
  • EP3 Timer    : `timer_preset` select (off/1h/2h/4h) + `timer_countdown` sensor
  • EP4/5/7      : OnOff switches (beep / direction / debug firmware)
  • EP6          : temperature + humidity sensors (DHT11/DHT22, optional)

Installation:
  1. Copier ce fichier dans /config/custom_zha_quirks/
  2. configuration.yaml :
       zha:
         custom_quirks_path: /config/custom_zha_quirks
  3. Redémarrer Home Assistant, puis "Reconfigurer" (ou réappairer) l'appareil.

LIMITES vs le converter Z2M (irréductibles en ZHA) :
  - `timer_preset` n'a PAS la logique "sticky" du converter : le preset est dérivé
    par plage du temps restant, donc un timer 4h se relabellise 2h puis 1h en
    décomptant (impossible à reproduire sans logique stateful type fz/tz).
  - `timer_preset` / `fan_speed` sont des attributs synthétiques : ils se remplissent
    quand l'attribut réel (currentLevel / fanMode) est lu ou reporté. Le report nécessite
    le firmware avec les correctifs de reportabilité (fanMode).
  - `color_step` est un bouton poussoir sans état (matériel cycle-only) : chaque appui avance
    d'un cran (cold→neutral→warm→…). La couleur ne peut PAS être choisie en absolu et aucun
    état couleur fiable n'existe (le DP couleur du MCU est découplé de la couleur réelle).

NOTE: testé uniquement à la lecture du code — à valider sur une install ZHA réelle.
"""

import zigpy.types as t
from zigpy.quirks import CustomCluster
from zigpy.quirks.v2 import QuirkBuilder
from zigpy.zcl import foundation
from zigpy.zcl.clusters.hvac import Fan
from zigpy.zcl.clusters.general import LevelControl
from zigpy.zcl.clusters.lighting import ColorControl
from zigpy.zcl.foundation import ZCLAttributeDef


# ── Color temperature: CYCLE-ONLY ────────────────────────────────────────────
# This lamp's colour can NOT be set to an absolute value. The MCU's color_temp DP is
# echo-only — it reports back whatever value was last written, DECOUPLED from the real LED
# colour — and the physical colour only advances one step at a time, exactly like the
# remote: cold→neutral→warm→… (established empirically). So instead of cold/neutral/warm
# presets (which were misleading) we expose a single `color_step` button: each press sends
# one moveToColorTemp, which the firmware turns into a one-step advance. The written value is
# meaningless (just a momentary trigger). See main/zigbee_device.c for the full explanation.
class CreateColorControl(CustomCluster, ColorControl):
    """ColorControl exposing a single `color_step` advance trigger (cycle-only HW)."""

    class AttributeDefs(ColorControl.AttributeDefs):
        color_step = ZCLAttributeDef(
            id=0xF000, type=t.Bool, access="rw", is_manufacturer_specific=True
        )

    async def write_attributes(self, attributes, manufacturer=None, **kwargs):
        remaining = dict(attributes)
        step = remaining.pop("color_step", remaining.pop(0xF000, None))
        if step is not None:
            # Any colour command advances one step; the mireds value is irrelevant (the
            # firmware ignores it and just steps). moveToColorTemp is used so the firmware's
            # command path fires (a Write Attribute to colorTemperature is read-only/ignored).
            await self.move_to_color_temp(color_temp_mireds=250, transition_time=0)
            # Momentary button: just acknowledge the write (no meaningful state to keep).
            super()._update_attribute(self.AttributeDefs.color_step.id, t.Bool(bool(step)))
        if remaining:
            return await super().write_attributes(
                remaining, manufacturer=manufacturer, **kwargs
            )
        return ([foundation.WriteAttributesStatusRecord(foundation.Status.SUCCESS)],)


# ── Timer: LevelControl currentLevel = minutes remaining (0-240) ─────────────
class TimerPreset(t.enum8):
    off = 0x00
    h1 = 0x01
    h2 = 0x02
    h4 = 0x04


_PRESET_TO_MINUTES = {
    TimerPreset.off: 0,
    TimerPreset.h1: 60,
    TimerPreset.h2: 120,
    TimerPreset.h4: 240,
}


def _level_to_preset(v: int) -> TimerPreset:
    # No "sticky" logic (impossible in ZHA): derive the bucket from remaining time.
    if v == 0 or v >= 255:
        return TimerPreset.off
    if v <= 90:
        return TimerPreset.h1
    if v <= 180:
        return TimerPreset.h2
    return TimerPreset.h4


class CreateLevelControl(CustomCluster, LevelControl):
    """LevelControl repurposed as a timer.

    currentLevel = minutes remaining → exposed as `timer_countdown` sensor.
    `timer_preset` (off/1h/2h/4h) write → moveToLevel(minutes).
    """

    class AttributeDefs(LevelControl.AttributeDefs):
        timer_preset = ZCLAttributeDef(
            id=0xF000, type=TimerPreset, access="rw", is_manufacturer_specific=True
        )

    def _update_attribute(self, attrid, value):
        super()._update_attribute(attrid, value)
        if attrid == LevelControl.AttributeDefs.current_level.id and value is not None:
            super()._update_attribute(
                self.AttributeDefs.timer_preset.id, _level_to_preset(int(value))
            )

    async def write_attributes(self, attributes, manufacturer=None, **kwargs):
        remaining = dict(attributes)
        preset = remaining.pop("timer_preset", remaining.pop(0xF000, None))
        if preset is not None:
            minutes = _PRESET_TO_MINUTES[TimerPreset(preset)]
            await self.move_to_level(level=minutes, transition_time=0)
            super()._update_attribute(
                self.AttributeDefs.timer_preset.id, TimerPreset(preset)
            )
        if remaining:
            return await super().write_attributes(
                remaining, manufacturer=manufacturer, **kwargs
            )
        return ([foundation.WriteAttributesStatusRecord(foundation.Status.SUCCESS)],)


# ── Fan: FanControl fanMode 0=off, 1-6=speed ─────────────────────────────────
class CreateFan(CustomCluster, Fan):
    """FanControl + a synthetic `fan_speed` (1-6) number.

    The native ZHA fan entity maps fanMode 1-6 onto the ZCL mode names
    (low/medium/high/on/auto/smart). `fan_speed` mirrors fanMode as a plain 1-6
    number; writing it sets fanMode (the firmware handles a fanMode write).
    """

    class AttributeDefs(Fan.AttributeDefs):
        fan_speed = ZCLAttributeDef(
            id=0xF000, type=t.uint8_t, access="rw", is_manufacturer_specific=True
        )

    def _update_attribute(self, attrid, value):
        super()._update_attribute(attrid, value)
        if attrid == Fan.AttributeDefs.fan_mode.id and value is not None:
            super()._update_attribute(self.AttributeDefs.fan_speed.id, t.uint8_t(int(value)))

    async def write_attributes(self, attributes, manufacturer=None, **kwargs):
        remaining = dict(attributes)
        speed = remaining.pop("fan_speed", remaining.pop(0xF000, None))
        if speed is not None:
            remaining[Fan.AttributeDefs.fan_mode.id] = int(speed)
        return await super().write_attributes(
            remaining, manufacturer=manufacturer, **kwargs
        )


# ── Quirk registration ───────────────────────────────────────────────────────
(
    QuirkBuilder("CREATE", "WIND-CALM")
    .replaces(CreateFan, endpoint_id=1)
    .replaces(CreateColorControl, endpoint_id=2)
    .replaces(CreateLevelControl, endpoint_id=3)
    # EP1 — fan speed 1-6 (0 = off) alongside the native fan entity
    .number(
        CreateFan.AttributeDefs.fan_speed.name,
        CreateFan.cluster_id,
        endpoint_id=1,
        min_value=0,
        max_value=6,
        step=1,
        translation_key="fan_speed",
        fallback_name="Fan speed",
    )
    # EP2 — colour: cycle-only, exposed as a momentary "next step" button (each press = one step)
    .write_attr_button(
        CreateColorControl.AttributeDefs.color_step.name,
        1,  # value written on press — irrelevant, the firmware just advances one step
        CreateColorControl.cluster_id,
        endpoint_id=2,
        translation_key="color_step",
        fallback_name="Color step (next)",
    )
    # EP3 — timer preset select + remaining-countdown sensor
    .enum(
        CreateLevelControl.AttributeDefs.timer_preset.name,
        TimerPreset,
        CreateLevelControl.cluster_id,
        endpoint_id=3,
        translation_key="timer_preset",
        fallback_name="Timer preset",
    )
    .sensor(
        LevelControl.AttributeDefs.current_level.name,
        LevelControl.cluster_id,
        endpoint_id=3,
        unit="min",
        translation_key="timer_countdown",
        fallback_name="Timer countdown",
    )
    .add_to_registry()
)
