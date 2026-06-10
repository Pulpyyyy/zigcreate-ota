import * as exposes from 'zigbee-herdsman-converters/lib/exposes';
import * as reporting from 'zigbee-herdsman-converters/lib/reporting';

const ea = exposes.access;

// EP1 — Fan: FanControl cluster (0x0202), fanMode 0=off 1-6=speed
const fz_fan_mode = {
    cluster: 'hvacFanCtrl',
    type: ['attributeReport', 'readResponse'],
    convert: (model, msg, publish, options, meta) => {
        if (msg.endpoint.ID !== 1) return;
        if (msg.data.hasOwnProperty('fanMode')) {
            const mode = msg.data['fanMode'];
            // Emit bare `state` (on/off) + `fan_mode` (1-6): HA's fan entity reads on/off from
            // `state` and speed from `fan_mode` (both hardcoded by Z2M). `fan` kept for compat.
            // Bare `state` is the FAN's — the light is `state_lamp` (its own endpoint), no clash.
            if (mode === 0) return {state: 'OFF', fan: 'OFF'};
            return {state: 'ON', fan: 'ON', fan_mode: mode};
        }
    },
};

// EP1 also exposes genOnOff (0x0006) alongside FanControl so a switch can be bound
// directly to the fan. Keep the `fan` state in sync when an on/off report arrives.
const fz_fan_onoff = {
    cluster: 'genOnOff',
    type: ['attributeReport', 'readResponse'],
    convert: (model, msg, publish, options, meta) => {
        if (msg.endpoint.ID !== 1) return;
        if (msg.data.hasOwnProperty('onOff')) {
            const v = msg.data['onOff'] ? 'ON' : 'OFF';
            return {state: v, fan: v};
        }
    },
};

const tz_fan = {
    // HA's native-speed fan commands on/off via the bare `state` key and the speed (1-6) via
    // `speed` (Z2M hardcodes both — see homeassistant.ts fan/nativeSpeed). `fan`/`fan_mode`
    // kept for backward-compat / direct z2m control. The bare `state` does NOT clash with the
    // light: the light is on the 'lamp' endpoint (state_lamp) and tz_light_onoff is gated to
    // endpoints:['lamp'], so this converter only ever gets the fan's non-endpoint `state`.
    key: ['state', 'speed', 'fan', 'fan_mode'],
    convertSet: async (entity, key, value, meta) => {
        const ep1 = meta.device.getEndpoint(1);
        if (key === 'state' || key === 'fan') {
            const on = String(value).toUpperCase() === 'ON';
            if (!on) {
                await ep1.write('hvacFanCtrl', {fanMode: 0});
                return {state: {state: 'OFF', fan: 'OFF'}};
            }
            const speed = Math.max(1, Math.min(6, parseInt(meta.state.fan_mode) || 1));
            await ep1.write('hvacFanCtrl', {fanMode: speed});
            return {state: {state: 'ON', fan: 'ON', fan_mode: speed}};
        }
        // key === 'speed' (HA percentage, 1-6) or 'fan_mode' (direct)
        const speed = Math.max(1, Math.min(6, parseInt(value)));
        if (isNaN(speed)) return;
        await ep1.write('hvacFanCtrl', {fanMode: speed});
        return {state: {state: 'ON', fan: 'ON', fan_mode: speed}};
    },
    convertGet: async (entity, key, meta) => {
        await meta.device.getEndpoint(1).read('hvacFanCtrl', ['fanMode']);
    },
};

// EP2 — Light on/off (genOnOff only — no genLevelCtrl on EP2)
const fz_light_onoff = {
    cluster: 'genOnOff',
    type: ['attributeReport', 'readResponse'],
    convert: (model, msg, publish, options, meta) => {
        if (msg.endpoint.ID !== 2) return;
        if (msg.data.hasOwnProperty('onOff')) {
            // Endpoint-suffixed key 'state_lamp' (NOT bare 'state'): the HA `light` (json schema)
            // and the speed-`fan` both want the bare `state` key. Keeping the light on its own
            // 'lamp' endpoint (→ state_lamp, published to the .../lamp subtopic HA reads) is the only
            // way the two entities stay independent. See `lightExpose` + `endpoint()` below.
            return {state_lamp: msg.data['onOff'] ? 'ON' : 'OFF'};
        }
    },
};
const tz_light_onoff = {
    key: ['state'],
    endpoints: ['lamp'],   // match ONLY the 'lamp' (light) endpoint — never the fan's bare `state`
    convertSet: async (entity, key, value, meta) => {
        const ep2 = meta.device.getEndpoint(2);
        const on = String(value).toUpperCase() === 'ON';
        await ep2.command('genOnOff', on ? 'on' : 'off', {});
        return {state: {state: on ? 'ON' : 'OFF'}};  // z2m auto-suffixes → state_lamp
    },
    convertGet: async (entity, key, meta) => {
        await meta.device.getEndpoint(2).read('genOnOff', ['onOff']);
    },
};

// EP3 — Timer
// fz_timer: ZCL level → timer_countdown (minutes) + timer_preset='OFF' when idle
// tz_timer: timer_preset (OFF/1h/2h/4h) → ZCL level; state reflects the active preset
const fz_timer = {
    cluster: 'genLevelCtrl',
    type: ['attributeReport', 'readResponse'],
    convert: (model, msg, publish, options, meta) => {
        if (msg.endpoint.ID !== 3) return;
        if (msg.data.hasOwnProperty('currentLevel')) {
            const lvl = msg.data['currentLevel'];
            // 0xFF = ZCL "undefined" — firmware sends it when no timer is active
            if (lvl === 255 || lvl === 0) return {timer_countdown: 0, timer_preset: 'off'};
            const result = {timer_countdown: lvl};
            // Re-derive the preset on any *deliberate* change — a fresh timer or a
            // switch to a different one — but NOT on the natural minute-by-minute
            // tick-down, so a 240-min timer stays '4h' all the way down.
            //   • rising  (lvl > prev):        new timer started or extended
            //   • big drop (prev - lvl > TOL): switched to a shorter timer — the
            //                                  countdown jumps straight to the new
            //                                  duration instead of elapsing minute-by-minute
            // A normal tick is ~-1/report (firmware queries the MCU every 60 s), so a
            // drop beyond a few minutes can only be a re-set, not elapsed time.
            const TICK_TOL = 3;
            const prev = meta.state.timer_countdown ?? 0;
            if (lvl > prev || prev - lvl > TICK_TOL) {
                // First report after a set is ~the full duration → nearest preset.
                result.timer_preset = lvl <= 90 ? '1h' : lvl <= 180 ? '2h' : '4h';
            }
            return result;
        }
    },
};
const tz_timer = {
    key: ['timer_preset'],
    convertSet: async (entity, key, value, meta) => {
        const levelMap = {'1h': 60, '2h': 120, '4h': 240};
        const level = levelMap[String(value)] ?? 0;
        const ep3 = meta.device.getEndpoint(3);
        await ep3.command('genLevelCtrl', 'moveToLevel', {level, transtime: 0});
        return {state: {timer_preset: level > 0 ? value : 'off'}};
    },
    convertGet: async (entity, key, meta) => {
        await meta.device.getEndpoint(3).read('genLevelCtrl', ['currentLevel']);
    },
};

// EP2 — Colour temperature: CYCLE-ONLY on this hardware.
// The MCU's color_temp DP is echo-only — it reports back whatever value was last written,
// DECOUPLED from the real LED colour (the same physical "warm" reported 0 then 500 during
// debugging). The physical colour can only be advanced one step at a time, exactly like the
// remote: cold→neutral→warm→… An absolute colour CANNOT be selected and the reported colour
// is NOT reliable. So we expose a single "step" trigger instead of cold/neutral/warm presets
// (which were misleading). See main/zigbee_device.c for the full explanation.
// How long the color_step switch stays visually ON before springing back to OFF.
const COLOR_STEP_RESET_MS = 1000;

const tz_color_step = {
    key: ['color_step'],
    convertSet: async (entity, key, value, meta) => {
        // Momentary "button" built from a switch (Z2M has no native button expose): turning it
        // ON advances the lamp ONE colour step. Turning it OFF does nothing.
        if (String(value).toUpperCase() !== 'ON') return {state: {color_step: 'OFF'}};
        const ep2 = meta.device.getEndpoint(2);
        // Mirror the physical remote: pressing "next colour" also turns the light ON, so stepping
        // a switched-off lamp lights it. But ONLY if it's currently off — sending a redundant
        // `on` when already lit would fire a second MCU command (extra beep). Light = state_lamp.
        if (String(meta.state.state_lamp).toUpperCase() !== 'ON') {
            await ep2.command('genOnOff', 'on', {});
        }
        // The firmware ignores the requested mireds and just steps; moveToColorTemp is used so
        // the firmware's command path fires (a plain colorTemperature Write Attribute is
        // read-only/ignored in ZCL).
        await ep2.command('lightingColorCtrl', 'moveToColorTemp', {colortemp: 250, transtime: 0});
        // Spring back to OFF for a momentary feel. To make the ON state actually VISIBLE in HA
        // (the switch is non-optimistic), we must publish ON now and OFF later — a single
        // blocking await would only ever publish the final OFF. meta.publish does the deferred
        // OFF. Fallback (older Z2M without meta.publish): report OFF immediately — reliable
        // one-tap-per-step, just without the brief ON indication.
        // Also reflect the light turning ON (state_lamp) so HA updates immediately.
        if (typeof meta.publish === 'function') {
            setTimeout(() => meta.publish({color_step: 'OFF'}), COLOR_STEP_RESET_MS);
            return {state: {state_lamp: 'ON', color_step: 'ON'}};
        }
        return {state: {state_lamp: 'ON', color_step: 'OFF'}};
    },
};

// EP4 — Audible beep
const fz_beep = {
    cluster: 'genOnOff',
    type: ['attributeReport', 'readResponse'],
    convert: (model, msg, publish, options, meta) => {
        if (msg.endpoint.ID !== 4) return;
        if (msg.data.hasOwnProperty('onOff')) {
            return {beep: msg.data['onOff'] ? 'ON' : 'OFF'};
        }
    },
};
const tz_beep = {
    key: ['beep'],
    convertSet: async (entity, key, value, meta) => {
        const ep4 = meta.device.getEndpoint(4);
        const on = String(value).toUpperCase() === 'ON';
        await ep4.command('genOnOff', on ? 'on' : 'off', {});
        return {state: {beep: on ? 'ON' : 'OFF'}};
    },
    convertGet: async (entity, key, meta) => {
        await meta.device.getEndpoint(4).read('genOnOff', ['onOff']);
    },
};

// EP5 — Fan rotation direction (forward=OFF, reverse=ON)
const fz_direction = {
    cluster: 'genOnOff',
    type: ['attributeReport', 'readResponse'],
    convert: (model, msg, publish, options, meta) => {
        if (msg.endpoint.ID !== 5) return;
        if (msg.data.hasOwnProperty('onOff')) {
            return {direction: msg.data['onOff'] ? 'reverse' : 'forward'};
        }
    },
};
const tz_direction = {
    key: ['direction'],
    convertSet: async (entity, key, value, meta) => {
        const ep5 = meta.device.getEndpoint(5);
        const reverse = value === 'reverse';
        await ep5.command('genOnOff', reverse ? 'on' : 'off', {});
        return {state: {direction: value}};
    },
    convertGet: async (entity, key, meta) => {
        await meta.device.getEndpoint(5).read('genOnOff', ['onOff']);
    },
};

// EP7 — Debug firmware OTA channel switch (OFF=release build, ON=debug build).
// Toggling makes the device persist the choice and reboot; it then pulls the matching
// firmware from the other OTA channel. Maintenance/development control.
const fz_debug_firmware = {
    cluster: 'genOnOff',
    type: ['attributeReport', 'readResponse'],
    convert: (model, msg, publish, options, meta) => {
        if (msg.endpoint.ID !== 7) return;
        if (msg.data.hasOwnProperty('onOff')) {
            return {debug_firmware: msg.data['onOff'] ? 'ON' : 'OFF'};
        }
    },
};
const tz_debug_firmware = {
    key: ['debug_firmware'],
    convertSet: async (entity, key, value, meta) => {
        const ep7 = meta.device.getEndpoint(7);
        const on = String(value).toUpperCase() === 'ON';
        await ep7.command('genOnOff', on ? 'on' : 'off', {});
        return {state: {debug_firmware: on ? 'ON' : 'OFF'}};
    },
    convertGet: async (entity, key, meta) => {
        await meta.device.getEndpoint(7).read('genOnOff', ['onOff']);
    },
};

// EP2/EP4 — Power-on behavior: StartUpOnOff ZCL attr (0x4003)
// 0=off, 1=on, 2=toggle, 0xFF=previous (restore last saved state)
const POB_MAP  = {off: 0, on: 1, toggle: 2, previous: 255};
const POB_RMAP = {0: 'off', 1: 'on', 2: 'toggle', 255: 'previous'};

const fz_power_on_behavior = {
    cluster: 'genOnOff',
    type: ['attributeReport', 'readResponse'],
    convert: (model, msg, publish, options, meta) => {
        if (!msg.data.hasOwnProperty('startUpOnOff')) return;
        const val = POB_RMAP[msg.data['startUpOnOff']] ?? 'previous';
        if (msg.endpoint.ID === 2) return {power_on_behavior_light: val, power_on_behavior: val};
        if (msg.endpoint.ID === 4) return {power_on_behavior_beep: val};
    },
};

const tz_power_on_behavior_light = {
    key: ['power_on_behavior_light', 'power_on_behavior'],
    convertSet: async (entity, key, value, meta) => {
        await meta.device.getEndpoint(2).write('genOnOff', {startUpOnOff: POB_MAP[value] ?? 255});
        return {state: {power_on_behavior_light: value, power_on_behavior: value}};
    },
    convertGet: async (entity, key, meta) => {
        await meta.device.getEndpoint(2).read('genOnOff', ['startUpOnOff']);
    },
};
const tz_power_on_behavior_beep = {
    key: ['power_on_behavior_beep'],
    convertSet: async (entity, key, value, meta) => {
        await meta.device.getEndpoint(4).write('genOnOff', {startUpOnOff: POB_MAP[value] ?? 255});
        return {state: {power_on_behavior_beep: value}};
    },
    convertGet: async (entity, key, meta) => {
        await meta.device.getEndpoint(4).read('genOnOff', ['startUpOnOff']);
    },
};

// EP6 — Temp/Hum (DHT11/DHT22): temperature (msTemperatureMeasurement) + humidity (msRelativeHumidity)
const fz_temperature = {
    cluster: 'msTemperatureMeasurement',
    type: ['attributeReport', 'readResponse'],
    convert: (model, msg, publish, options, meta) => {
        if (msg.endpoint.ID !== 6) return;
        if (msg.data.hasOwnProperty('measuredValue') && msg.data['measuredValue'] !== 0x8000) {
            return {temperature: parseFloat((msg.data['measuredValue'] / 100).toFixed(1))};
        }
    },
};

const fz_humidity = {
    cluster: 'msRelativeHumidity',
    type: ['attributeReport', 'readResponse'],
    convert: (model, msg, publish, options, meta) => {
        if (msg.endpoint.ID !== 6) return;
        if (msg.data.hasOwnProperty('measuredValue') && msg.data['measuredValue'] !== 0xFFFF) {
            return {humidity: parseFloat((msg.data['measuredValue'] / 100).toFixed(1))};
        }
    },
};

const tz_temp_hum = {
    key: ['temperature', 'humidity'],
    convertGet: async (entity, key, meta) => {
        const ep6 = meta.device.getEndpoint(6);
        if (key === 'temperature') await ep6.read('msTemperatureMeasurement', ['measuredValue']);
        if (key === 'humidity')    await ep6.read('msRelativeHumidity', ['measuredValue']);
    },
};

// EP1 — HA `fan` domain entity: on/off (property 'fan') + speed 1-6.
// IMPORTANT: do NOT use withModes()/an enum here. Z2M's HA fan discovery treats
// numeric mode values as percentage speeds and REQUIRES at least one preset among
// on/auto/smart (`assert(presets.length !== 0)` in homeassistant.ts) — with pure
// 1-6 speeds that assertion throws and crashes the *entire* HA discovery extension
// (no entities published at all). withSpeed() registers a native speed instead, no
// preset needed. Rename its feature property 'speed' → 'fan_mode' so fz/tz and the
// firmware are untouched. The genOnOff cluster on EP1 stays for direct binding.
const fanExpose = exposes.presets.fan()
    .withState('fan', ea.ALL)
    .withSpeed(1, 6)
    .withDescription('Fan: on/off + speed 1-6');
fanExpose.features.find((f) => f.name === 'speed').withProperty('fan_mode');

// EP2 — HA `light` entity (on/off only). MUST be on its own endpoint ('lamp'): both this
// json-schema light and the speed-`fan` are hardcoded by Z2M to the bare `state` key, so
// without an endpoint they'd share `state` and toggle each other. The endpoint makes the
// light's on/off `state_lamp` (HA reads/commands it via the .../lamp subtopic) — independent
// from the fan. HA names the entity '<device> Lamp' by default; rename it in HA if desired
// (purely cosmetic). The genOnOff cluster on EP2 also stays for direct binding.
const lightExpose = exposes.presets.light().withEndpoint('lamp').withDescription('Light on/off');

export default {
    fingerprint: [{modelID: 'WIND-CALM', manufacturerName: 'CREATE'}],
    model:       'WIND-CALM',
    vendor:      'CREATE',
    description: 'Wind Calm ceiling fan with light (ESP32-H2 Zigbee bridge)',
    ota:         true,

    fromZigbee: [fz_fan_mode, fz_fan_onoff, fz_light_onoff, fz_timer, fz_beep, fz_direction, fz_power_on_behavior, fz_temperature, fz_humidity, fz_debug_firmware],
    toZigbee:   [tz_light_onoff, tz_fan, tz_color_step, tz_timer, tz_beep, tz_direction, tz_power_on_behavior_light, tz_power_on_behavior_beep, tz_temp_hum, tz_debug_firmware],

    exposes: [
        // HA `fan` domain entity (on/off + speed). Built above with withSpeed.
        fanExpose,
        // HA `light` domain entity (on/off). On endpoint 'lamp' → property state_lamp (see above).
        lightExpose,
        exposes.binary('color_step', ea.STATE_SET, 'ON', 'OFF')
            .withDescription('Colour temperature — momentary: switch ON to advance ONE step ' +
                             '(cold→neutral→warm→…); it springs back to OFF automatically. This ' +
                             'lamp can only cycle — an absolute colour cannot be selected and ' +
                             'there is no reliable colour state.'),
        exposes.enum('timer_preset', ea.STATE_SET, ['off', '1h', '2h', '4h'])
            .withDescription('Timer setting; auto-resets to OFF when countdown reaches 0'),
        exposes.numeric('timer_countdown', ea.STATE)
            .withValueMin(0).withValueMax(240).withUnit('min')
            .withDescription('Remaining countdown (min)'),
        exposes.binary('beep', ea.ALL, 'ON', 'OFF')
            .withDescription('Audible beep'),
        exposes.enum('direction', ea.ALL, ['forward', 'reverse'])
            .withDescription('Fan rotation direction'),
        exposes.enum('power_on_behavior_light', ea.ALL, ['off', 'on', 'toggle', 'previous'])
            .withDescription('Light power-on behavior'),
        exposes.enum('power_on_behavior_beep', ea.ALL, ['off', 'on', 'toggle', 'previous'])
            .withDescription('Beep power-on behavior'),
        exposes.numeric('temperature', ea.STATE)
            .withUnit('°C').withDescription('Temperature'),
        exposes.numeric('humidity', ea.STATE)
            .withUnit('%').withDescription('Relative humidity'),
        exposes.binary('debug_firmware', ea.ALL, 'ON', 'OFF')
            .withCategory('config')
            .withDescription('Swap the installed firmware over OTA: ON = debug build, OFF = release build. ' +
                             'The device persists the choice, reboots, and pulls the matching image from the other ' +
                             'OTA channel. For development/diagnostics — not a fan function.'),
    ],

    // 'lamp' → EP2: names the light's endpoint so its on/off becomes `state_lamp`, decoupled from
    // the fan's bare `state`. Other EP2 functions (color_step, power_on_behavior_light) stay
    // flat (no withEndpoint) — none end in `_lamp`, so the endpoint regex never mis-parses them.
    endpoint: (device) => ({lamp: 2}),

    meta: {
        multiEndpoint: true,
        // The 'lamp' endpoint is required to decouple the light's on/off from the fan (both
        // are hardcoded by Z2M to the bare `state` key otherwise), but it makes Z2M name the
        // light entity '<device> Lamp' → light.<device>_lamp. Null out the name on the light's
        // discovery (it's the only entity using schema:"json") so HA falls back to the device
        // name → clean `light.<device>`, mirroring the fan's `fan.<device>`.
        overrideHaDiscoveryPayload: (payload) => {
            if (payload.schema === 'json') {
                payload.name = null;
            }
        },
    },

    configure: async (device, coordinatorEndpoint, logger) => {
        const ep1 = device.getEndpoint(1);
        const ep2 = device.getEndpoint(2);
        const ep4 = device.getEndpoint(4);
        const ep5 = device.getEndpoint(5);

        // EP1: fan mode (FanControl cluster — no configureReporting, cluster doesn't support it)
        // plus genOnOff (0x0006) so the fan can be controlled/bound via plain on/off.
        await reporting.bind(ep1, coordinatorEndpoint, ['hvacFanCtrl', 'genOnOff']);
        await reporting.onOff(ep1);

        // EP2: light on/off + color temp
        await reporting.bind(ep2, coordinatorEndpoint, ['genOnOff', 'lightingColorCtrl']);
        await reporting.onOff(ep2);
        await reporting.colorTemperature(ep2);

        // EP3: timer (genLevelCtrl)
        const ep3 = device.getEndpoint(3);
        await reporting.bind(ep3, coordinatorEndpoint, ['genLevelCtrl']);
        await reporting.brightness(ep3);

        // EP4: beep on/off
        await reporting.bind(ep4, coordinatorEndpoint, ['genOnOff']);
        await reporting.onOff(ep4);

        // EP5: fan direction on/off
        await reporting.bind(ep5, coordinatorEndpoint, ['genOnOff']);
        await reporting.onOff(ep5);

        // EP7: debug firmware OTA channel switch (guarded — absent on older firmware)
        const ep7 = device.getEndpoint(7);
        if (ep7) {
            await reporting.bind(ep7, coordinatorEndpoint, ['genOnOff']);
            await reporting.onOff(ep7);
            await ep7.read('genOnOff', ['onOff']);
        }

        // Read current states so Z2M cache is populated immediately after configure
        await ep1.read('hvacFanCtrl', ['fanMode']);
        await ep1.read('genOnOff', ['onOff']);
        await ep2.read('genOnOff', ['onOff']);
        await ep2.read('lightingColorCtrl', ['colorTemperature']);
        await ep4.read('genOnOff', ['onOff']);
        await ep5.read('genOnOff', ['onOff']);
        await ep3.read('genLevelCtrl', ['currentLevel']);

        // Read StartUpOnOff for light and beep (non-reportable, read on configure)
        await ep2.read('genOnOff', ['startUpOnOff']);
        await ep4.read('genOnOff', ['startUpOnOff']);

        // EP6: temperature + humidity (DHT11/DHT22, disabled by default, only bound/configured if EP exists)
        const ep6 = device.getEndpoint(6);
        if (ep6) {
            await reporting.bind(ep6, coordinatorEndpoint, ['msTemperatureMeasurement', 'msRelativeHumidity']);
            await ep6.configureReporting('msTemperatureMeasurement', [{
                attribute: 'measuredValue', minimumReportInterval: 60, maximumReportInterval: 300, reportableChange: 50,
            }]);
            await ep6.configureReporting('msRelativeHumidity', [{
                attribute: 'measuredValue', minimumReportInterval: 60, maximumReportInterval: 300, reportableChange: 100,
            }]);
        }
    },
};
