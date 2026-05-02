import * as m from 'zigbee-herdsman-converters/lib/modernExtend';
import * as exposes from 'zigbee-herdsman-converters/lib/exposes';
import * as reporting from 'zigbee-herdsman-converters/lib/reporting';

const ea = exposes.access;

// EP1 — fan speed: ZCL Level 0-254 ↔ speed 1-6
// level=0 means fan is off (on/off state tracked by m.onOff); don't report a stale speed in that case.
const fz_fan_speed = {
    cluster: 'genLevelCtrl',
    type: ['attributeReport', 'readResponse'],
    convert: (model, msg, publish, options, meta) => {
        if (msg.endpoint.ID !== 1) return;
        if (msg.data.hasOwnProperty('currentLevel')) {
            const lvl = msg.data['currentLevel'];
            if (lvl === 0) return;  // fan off — on/off state is handled by m.onOff
            const speed = Math.max(1, Math.min(6, Math.round((lvl * 6) / 254)));
            return {fan_speed: speed};
        }
    },
};
const tz_fan_speed = {
    key: ['fan_speed'],
    convertSet: async (entity, key, value, meta) => {
        const speed = Math.max(1, Math.min(6, parseInt(value)));
        const level = Math.round((speed * 254) / 6);
        const ep1 = meta.device.getEndpoint(1);
        await ep1.command('genLevelCtrl', 'moveToLevelWithOnOff', {level, transtime: 0});
        return {state: {fan_speed: speed}};
    },
    convertGet: async (entity, key, meta) => {
        const ep1 = meta.device.getEndpoint(1);
        await ep1.read('genLevelCtrl', ['currentLevel']);
    },
};

// EP2 — color temp: 3 paliers Tuya ↔ mireds ZCL
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
        return {state: {light_color_temp: value}};
    },
    convertGet: async (entity, key, meta) => {
        const ep2 = meta.device.getEndpoint(2);
        await ep2.read('lightingColorCtrl', ['colorTemperature']);
    },
};

// EP3 — timer
// fz_timer   : ZCL level → timer_countdown (real decreasing value, read-only)
// tz_timer   : timer_preset (enum 0/60/120/240) → ZCL level (write-only)
const fz_timer = {
    cluster: 'genLevelCtrl',
    type: ['attributeReport', 'readResponse'],
    convert: (model, msg, publish, options, meta) => {
        if (msg.endpoint.ID !== 3) return;
        if (msg.data.hasOwnProperty('currentLevel')) {
            const lvl = msg.data['currentLevel'];
            const minutes = lvl === 0 ? 0 : Math.round((lvl * 240) / 254);
            return {timer_countdown: minutes};
        }
    },
};
const tz_timer = {
    key: ['timer_preset'],
    convertSet: async (entity, key, value, meta) => {
        // hours label → ZCL level
        const levelMap = {'1h': 64, '2h': 127, '4h': 254};
        const level = levelMap[String(value)] ?? 0;
        const ep3 = meta.device.getEndpoint(3);
        await ep3.command('genLevelCtrl', 'moveToLevel', {level, transtime: 0});
        return {state: {timer_preset: String(value)}};
    },
};

export default {
    fingerprint: [{modelID: 'WIND-CALM', manufacturerName: 'CREATE'}],
    model:       'WIND-CALM',
    vendor:      'CREATE',
    description: 'Wind Calm ceiling fan with light (ESP32-H2 Zigbee bridge)',
    ota:         true,

    extend: [
        // EP1 — ventilateur on/off
        m.onOff({endpointNames: ['fan'], powerOnBehavior: false}),
        // EP2 — lumière: on/off uniquement (brightness masqué, colorTemp géré par converter custom)
        m.onOff({endpointNames: ['light'], powerOnBehavior: false}),
        // EP4 — bip sonore
        m.onOff({endpointNames: ['beep']}),
        // EP5 — sens de rotation
        m.onOff({endpointNames: ['direction'], powerOnBehavior: false}),
    ],

    fromZigbee: [fz_fan_speed, fz_light_color_temp, fz_timer],
    toZigbee:   [tz_fan_speed, tz_light_color_temp, tz_timer],

    exposes: [
        // No .withEndpoint() here: avoids z2m appending '_fan'/'_light'/'_timer' suffix
        // that would mismatch the keys returned by fromZigbee converters.
        // Endpoint routing is handled explicitly via meta.device.getEndpoint() in toZigbee.
        exposes.numeric('fan_speed', ea.ALL)
            .withValueMin(1).withValueMax(6)
            .withDescription('Vitesse 1-6'),
        exposes.enum('light_color_temp', ea.ALL, ['cool', 'neutral', 'warm'])
            .withDescription('Température de couleur (cool=6500K, neutral=2700K, warm=2000K)'),
        exposes.enum('timer_preset', ea.SET, ['1h', '2h', '4h'])
            .withDescription('Réglage minuterie (min)'),
        exposes.numeric('timer_countdown', ea.STATE)
            .withValueMin(0).withValueMax(240).withUnit('min')
            .withDescription('Décompte en cours (min)'),
    ],

    endpoint: (device) => ({
        fan:       1,
        light:     2,
        timer:     3,
        beep:      4,
        direction: 5,
    }),

    meta: {multiEndpoint: true},

    configure: async (device, coordinatorEndpoint, logger) => {
        const ep1 = device.getEndpoint(1);
        const ep2 = device.getEndpoint(2);
        const ep3 = device.getEndpoint(3);
        const ep4 = device.getEndpoint(4);
        const ep5 = device.getEndpoint(5);

        // EP1: fan speed (genLevelCtrl)
        await reporting.bind(ep1, coordinatorEndpoint, ['genLevelCtrl']);
        await reporting.brightness(ep1);

        // EP2: color temp (lightingColorCtrl) — on/off configuré par m.onOff()
        await reporting.bind(ep2, coordinatorEndpoint, ['lightingColorCtrl']);
        await reporting.colorTemperature(ep2);

        // EP3: timer (genLevelCtrl)
        await reporting.bind(ep3, coordinatorEndpoint, ['genLevelCtrl']);
        await reporting.brightness(ep3);

        // EP4: beep on/off
        await reporting.bind(ep4, coordinatorEndpoint, ['genOnOff']);
        await reporting.onOff(ep4);

        // EP5: fan direction on/off
        await reporting.bind(ep5, coordinatorEndpoint, ['genOnOff']);
        await reporting.onOff(ep5);
    },
};
