import * as exposes from 'zigbee-herdsman-converters/lib/exposes';
import * as reporting from 'zigbee-herdsman-converters/lib/reporting';

const ea = exposes.access;

// EP1 — Fan on/off state from genOnOff
const fz_fan_state = {
    cluster: 'genOnOff',
    type: ['attributeReport', 'readResponse'],
    convert: (model, msg, publish, options, meta) => {
        if (msg.endpoint.ID !== 1) return;
        if (msg.data.hasOwnProperty('onOff')) {
            return {state: msg.data['onOff'] ? 'ON' : 'OFF'};
        }
    },
};

// EP1 — Fan speed: ZCL Level 0-254 ↔ preset '1'..'6'
// level=0 means fan off — on/off state handled by fz_fan_state; don't report stale speed.
const speed_to_level = s => Math.round((s * 254) / 6);
const level_to_speed = l => Math.max(1, Math.min(6, Math.round((l * 6) / 254)));

const fz_fan_speed = {
    cluster: 'genLevelCtrl',
    type: ['attributeReport', 'readResponse'],
    convert: (model, msg, publish, options, meta) => {
        if (msg.endpoint.ID !== 1) return;
        if (msg.data.hasOwnProperty('currentLevel')) {
            const lvl = msg.data['currentLevel'];
            if (lvl === 0) return;
            return {fan_mode: String(level_to_speed(lvl))};
        }
    },
};

const tz_fan = {
    key: ['state', 'fan_mode'],
    convertSet: async (entity, key, value, meta) => {
        const ep1 = meta.device.getEndpoint(1);
        if (key === 'state') {
            const on = String(value).toUpperCase() === 'ON';
            await ep1.command('genOnOff', on ? 'on' : 'off', {});
            return {state: {state: on ? 'ON' : 'OFF'}};
        }
        if (key === 'fan_mode') {
            const parsed = parseInt(value);
            if (isNaN(parsed)) return;
            const speed = Math.max(1, Math.min(6, parsed));
            const level = speed_to_level(speed);
            await ep1.command('genLevelCtrl', 'moveToLevelWithOnOff', {level, transtime: 0});
            return {state: {fan_mode: String(speed), state: 'ON'}};
        }
    },
    convertGet: async (entity, key, meta) => {
        const ep1 = meta.device.getEndpoint(1);
        if (key === 'state')    await ep1.read('genOnOff', ['onOff']);
        if (key === 'fan_mode') await ep1.read('genLevelCtrl', ['currentLevel']);
    },
};

// EP2 — Light on/off (genOnOff only — no genLevelCtrl on EP2)
const fz_light_onoff = {
    cluster: 'genOnOff',
    type: ['attributeReport', 'readResponse'],
    convert: (model, msg, publish, options, meta) => {
        if (msg.endpoint.ID !== 2) return;
        if (msg.data.hasOwnProperty('onOff')) {
            return {state_light: msg.data['onOff'] ? 'ON' : 'OFF'};
        }
    },
};
const tz_light_onoff = {
    key: ['state_light'],
    convertSet: async (entity, key, value, meta) => {
        const ep2 = meta.device.getEndpoint(2);
        const on = String(value).toUpperCase() === 'ON';
        await ep2.command('genOnOff', on ? 'on' : 'off', {});
        return {state: {state_light: on ? 'ON' : 'OFF'}};
    },
    convertGet: async (entity, key, meta) => {
        await meta.device.getEndpoint(2).read('genOnOff', ['onOff']);
    },
};

// EP3 — Timer
// fz_timer: ZCL level → timer_countdown (real decreasing value, read-only)
// tz_timer: timer_preset (enum 0/60/120/240) → ZCL level (write-only)
const fz_timer = {
    cluster: 'genLevelCtrl',
    type: ['attributeReport', 'readResponse'],
    convert: (model, msg, publish, options, meta) => {
        if (msg.endpoint.ID !== 3) return;
        if (msg.data.hasOwnProperty('currentLevel')) {
            const lvl = msg.data['currentLevel'];
            const minutes = lvl;  // ZCL level = minutes directly (firmware v2)
            return {timer_countdown: minutes};
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
    },
};

// EP2 — Color temperature: 3 Tuya levels ↔ ZCL mireds
// cool=153 mir (Tuya 0), neutral=370 mir (Tuya 500), warm=500 mir (Tuya 1000)
const COLOR_TEMP = {cool: 153, neutral: 370, warm: 500};

const fz_light_color_temp = {
    cluster: 'lightingColorCtrl',
    type: ['attributeReport', 'readResponse'],
    convert: (model, msg, publish, options, meta) => {
        if (msg.endpoint.ID !== 2) return;
        const mir = msg.data['colorTemperature'];
        if (mir == null) return;
        const preset = mir <= 260 ? 'cool' : mir <= 435 ? 'neutral' : 'warm';
        return {light_color_temp: preset};
    },
};
const tz_light_color_temp = {
    key: ['light_color_temp'],
    convertSet: async (entity, key, value, meta) => {
        const mireds = COLOR_TEMP[value] ?? 153;
        const ep2 = meta.device.getEndpoint(2);
        // colorTemperature (0x0007) is read-only in ZCL — must use the moveToColorTemp
        // command (0x0A) so the firmware's command callback fires instead of Write Attribute.
        await ep2.command('lightingColorCtrl', 'moveToColorTemp', {colortemp: mireds, transtime: 0});
        // Firmware auto-turns on the light when CT is set while off — reflect it optimistically.
        return {state: {light_color_temp: value, state_light: 'ON'}};
    },
    convertGet: async (entity, key, meta) => {
        const ep2 = meta.device.getEndpoint(2);
        await ep2.read('lightingColorCtrl', ['colorTemperature']);
    },
};

// EP4 — Audible beep
const fz_beep = {
    cluster: 'genOnOff',
    type: ['attributeReport', 'readResponse'],
    convert: (model, msg, publish, options, meta) => {
        if (msg.endpoint.ID !== 4) return;
        if (msg.data.hasOwnProperty('onOff')) {
            return {state_beep: msg.data['onOff'] ? 'ON' : 'OFF'};
        }
    },
};
const tz_beep = {
    key: ['state_beep'],
    convertSet: async (entity, key, value, meta) => {
        const ep4 = meta.device.getEndpoint(4);
        const on = String(value).toUpperCase() === 'ON';
        await ep4.command('genOnOff', on ? 'on' : 'off', {});
        return {state: {state_beep: on ? 'ON' : 'OFF'}};
    },
    convertGet: async (entity, key, meta) => {
        await meta.device.getEndpoint(4).read('genOnOff', ['onOff']);
    },
};

// EP5 — Fan rotation direction (OFF=forward, ON=reverse)
const fz_direction = {
    cluster: 'genOnOff',
    type: ['attributeReport', 'readResponse'],
    convert: (model, msg, publish, options, meta) => {
        if (msg.endpoint.ID !== 5) return;
        if (msg.data.hasOwnProperty('onOff')) {
            return {state_direction: msg.data['onOff'] ? 'ON' : 'OFF'};
        }
    },
};
const tz_direction = {
    key: ['state_direction'],
    convertSet: async (entity, key, value, meta) => {
        const ep5 = meta.device.getEndpoint(5);
        const on = String(value).toUpperCase() === 'ON';
        await ep5.command('genOnOff', on ? 'on' : 'off', {});
        return {state: {state_direction: on ? 'ON' : 'OFF'}};
    },
    convertGet: async (entity, key, meta) => {
        await meta.device.getEndpoint(5).read('genOnOff', ['onOff']);
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

export default {
    fingerprint: [{modelID: 'WIND-CALM', manufacturerName: 'CREATE'}],
    model:       'WIND-CALM',
    vendor:      'CREATE',
    description: 'Wind Calm ceiling fan with light (ESP32-H2 Zigbee bridge)',
    ota:         true,

    fromZigbee: [fz_fan_state, fz_fan_speed, fz_light_onoff, fz_light_color_temp, fz_timer, fz_beep, fz_direction, fz_power_on_behavior],
    toZigbee:   [tz_light_onoff, tz_fan, tz_light_color_temp, tz_timer, tz_beep, tz_direction, tz_power_on_behavior_light, tz_power_on_behavior_beep],

    exposes: [
        exposes.binary('state', ea.ALL, 'ON', 'OFF')
            .withDescription('Fan on/off'),
        exposes.enum('fan_mode', ea.ALL, ['1', '2', '3', '4', '5', '6'])
            .withDescription('Fan speed'),
        exposes.binary('state_light', ea.ALL, 'ON', 'OFF')
            .withDescription('Light on/off'),
        exposes.enum('light_color_temp', ea.ALL, ['cool', 'neutral', 'warm'])
            .withDescription('Color temperature (cool=6500K, neutral=2700K, warm=2000K)'),
        exposes.enum('timer_preset', ea.SET, ['1h', '2h', '4h'])
            .withDescription('Timer setting'),
        exposes.numeric('timer_countdown', ea.STATE)
            .withValueMin(0).withValueMax(240).withUnit('min')
            .withDescription('Remaining countdown (min)'),
        exposes.binary('state_beep', ea.ALL, 'ON', 'OFF')
            .withDescription('Audible beep'),
        exposes.binary('state_direction', ea.ALL, 'ON', 'OFF')
            .withDescription('Rotation direction (OFF=forward, ON=reverse)'),
        exposes.enum('power_on_behavior_light', ea.ALL, ['off', 'on', 'toggle', 'previous'])
            .withDescription('Light power-on behavior'),
        exposes.enum('power_on_behavior_beep', ea.ALL, ['off', 'on', 'toggle', 'previous'])
            .withDescription('Beep power-on behavior'),
    ],

    endpoint: (device) => ({}),

    meta: {multiEndpoint: true},

    configure: async (device, coordinatorEndpoint, logger) => {
        const ep1 = device.getEndpoint(1);
        const ep2 = device.getEndpoint(2);
        const ep4 = device.getEndpoint(4);
        const ep5 = device.getEndpoint(5);

        // EP1: fan on/off + speed
        await reporting.bind(ep1, coordinatorEndpoint, ['genOnOff', 'genLevelCtrl']);
        await reporting.onOff(ep1);
        await reporting.brightness(ep1);

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

        // Read StartUpOnOff for light and beep (non-reportable, read on configure)
        await ep2.read('genOnOff', ['startUpOnOff']);
        await ep4.read('genOnOff', ['startUpOnOff']);
    },
};
