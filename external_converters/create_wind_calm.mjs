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
            if (mode === 0) return {fan: 'OFF'};
            return {fan: 'ON', fan_mode: String(mode)};
        }
    },
};

const tz_fan = {
    key: ['fan', 'fan_mode'],
    convertSet: async (entity, key, value, meta) => {
        const ep1 = meta.device.getEndpoint(1);
        if (key === 'fan') {
            const on = String(value).toUpperCase() === 'ON';
            if (!on) {
                await ep1.write('hvacFanCtrl', {fanMode: 0});
                return {state: {fan: 'OFF'}};
            }
            const cur = parseInt(meta.state.fan_mode) || 1;
            const speed = Math.max(1, Math.min(6, cur));
            await ep1.write('hvacFanCtrl', {fanMode: speed});
            return {state: {fan: 'ON', fan_mode: String(speed)}};
        }
        if (key === 'fan_mode') {
            const speed = Math.max(1, Math.min(6, parseInt(value)));
            if (isNaN(speed)) return;
            await ep1.write('hvacFanCtrl', {fanMode: speed});
            return {state: {fan: 'ON', fan_mode: String(speed)}};
        }
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
            return {light: msg.data['onOff'] ? 'ON' : 'OFF'};
        }
    },
};
const tz_light_onoff = {
    key: ['light'],
    convertSet: async (entity, key, value, meta) => {
        const ep2 = meta.device.getEndpoint(2);
        const on = String(value).toUpperCase() === 'ON';
        await ep2.command('genOnOff', on ? 'on' : 'off', {});
        return {state: {light: on ? 'ON' : 'OFF'}};
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
            if (lvl === 255) return {timer_countdown: 0, timer_preset: 'off'};
            const result = {timer_countdown: lvl};
            if (lvl === 0) result.timer_preset = 'off';
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
        return {state: {light_color_temp: value, light: 'ON'}};
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

    fromZigbee: [fz_fan_mode, fz_light_onoff, fz_light_color_temp, fz_timer, fz_beep, fz_direction, fz_power_on_behavior],
    toZigbee:   [tz_light_onoff, tz_fan, tz_light_color_temp, tz_timer, tz_beep, tz_direction, tz_power_on_behavior_light, tz_power_on_behavior_beep],

    exposes: [
        exposes.binary('fan', ea.ALL, 'ON', 'OFF')
            .withDescription('Fan on/off'),
        exposes.enum('fan_mode', ea.ALL, ['1', '2', '3', '4', '5', '6'])
            .withDescription('Fan speed (1-6); setting any speed turns the fan on'),
        exposes.binary('light', ea.ALL, 'ON', 'OFF')
            .withDescription('Light on/off'),
        exposes.enum('light_color_temp', ea.ALL, ['cool', 'neutral', 'warm'])
            .withDescription('Color temperature (cool=6500K, neutral=2700K, warm=2000K)'),
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
    ],

    endpoint: (device) => ({}),

    meta: {multiEndpoint: true},

    configure: async (device, coordinatorEndpoint, logger) => {
        const ep1 = device.getEndpoint(1);
        const ep2 = device.getEndpoint(2);
        const ep4 = device.getEndpoint(4);
        const ep5 = device.getEndpoint(5);

        // EP1: fan mode (FanControl cluster — no configureReporting, cluster doesn't support it)
        await reporting.bind(ep1, coordinatorEndpoint, ['hvacFanCtrl']);

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

        // Read current states so Z2M cache is populated immediately after configure
        await ep1.read('hvacFanCtrl', ['fanMode']);
        await ep2.read('genOnOff', ['onOff']);
        await ep2.read('lightingColorCtrl', ['colorTemperature']);
        await ep4.read('genOnOff', ['onOff']);
        await ep5.read('genOnOff', ['onOff']);
        await ep3.read('genLevelCtrl', ['currentLevel']);

        // Read StartUpOnOff for light and beep (non-reportable, read on configure)
        await ep2.read('genOnOff', ['startUpOnOff']);
        await ep4.read('genOnOff', ['startUpOnOff']);
    },
};
