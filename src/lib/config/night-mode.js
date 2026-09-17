import { asObject } from './branding.js';

export const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

/**
 * Parse an `HH:mm` string into minutes since midnight.
 * @param {unknown} value
 * @returns {number|null} null when invalid
 */
export function parseHHMM(value) {
	if (typeof value !== 'string' || !HHMM.test(value)) return null;
	const [hours, minutes] = value.split(':').map(Number);
	return hours * 60 + minutes;
}

export const NIGHT_MODE_STYLES = ['DIM', 'MINIMAL'];
export const NIGHT_MODE_DIM_PERCENT_RANGE = Object.freeze({ min: 50, max: 90, step: 5 });

export const NIGHT_MODE_DEFAULTS = Object.freeze({
	nightModeEnabled: false,
	nightModeStart: '',
	nightModeEnd: '',
	nightModeStyle: 'DIM',
	nightModeDimPercent: 70,
	nightModePixelShift: true,
	nightModeHideChrome: true
});

// Each field's validity check and the message reported when a submitted value fails it.
const FIELD_RULES = {
	nightModeEnabled: {
		isValid: (value) => typeof value === 'boolean',
		error: 'nightModeEnabled must be true or false'
	},
	nightModeStart: {
		isValid: (value) => parseHHMM(value) !== null,
		error: 'Night mode start must be a time like 22:00'
	},
	nightModeEnd: {
		isValid: (value) => parseHHMM(value) !== null,
		error: 'Night mode end must be a time like 06:00'
	},
	nightModeStyle: {
		isValid: (value) => NIGHT_MODE_STYLES.includes(value),
		error: `Night mode style must be one of: ${NIGHT_MODE_STYLES.join(', ')}`
	},
	nightModeDimPercent: {
		isValid: (value) =>
			Number.isInteger(value) &&
			value >= NIGHT_MODE_DIM_PERCENT_RANGE.min &&
			value <= NIGHT_MODE_DIM_PERCENT_RANGE.max,
		error: `Night mode dim level must be a whole number from ${NIGHT_MODE_DIM_PERCENT_RANGE.min} to ${NIGHT_MODE_DIM_PERCENT_RANGE.max}`
	},
	nightModePixelShift: {
		isValid: (value) => typeof value === 'boolean',
		error: 'nightModePixelShift must be true or false'
	},
	nightModeHideChrome: {
		isValid: (value) => typeof value === 'boolean',
		error: 'nightModeHideChrome must be true or false'
	}
};

/**
 * Whether a config value was left unset.
 * @param {unknown} value
 * @returns {boolean}
 */
function isBlank(value) {
	return value == null || value === '';
}

/**
 * List problems with a submitted night-mode config; blank fields are allowed.
 * @param {unknown} raw
 * @returns {string[]} empty when valid
 */
export function validateNightMode(raw) {
	const source = asObject(raw);
	return Object.entries(FIELD_RULES)
		.filter(([key, rule]) => !isBlank(source[key]) && !rule.isValid(source[key]))
		.map(([, rule]) => rule.error);
}

/**
 * Fill in missing night-mode fields and replace malformed values with defaults.
 * @param {unknown} raw
 * @returns {typeof NIGHT_MODE_DEFAULTS}
 */
export function normalizeNightMode(raw) {
	const source = asObject(raw);
	return Object.fromEntries(
		Object.entries(FIELD_RULES).map(([key, rule]) => [
			key,
			rule.isValid(source[key]) ? source[key] : NIGHT_MODE_DEFAULTS[key]
		])
	);
}

// A 9-position path over the 3x3 grid of {-1, 0, 1} units, ordered so each step moves to an
// adjacent cell (including the wrap from the last entry back to the first).
const PIXEL_SHIFT_PATH = [
	{ unitX: 0, unitY: 0 },
	{ unitX: 1, unitY: 0 },
	{ unitX: 1, unitY: 1 },
	{ unitX: 0, unitY: 1 },
	{ unitX: -1, unitY: 1 },
	{ unitX: -1, unitY: 0 },
	{ unitX: -1, unitY: -1 },
	{ unitX: 0, unitY: -1 },
	{ unitX: 1, unitY: -1 }
];

/**
 * Compute a slow-drifting pixel offset for burn-in mitigation, stepping through a fixed path.
 * @param {number} minuteMs - the current time truncated to the minute, in epoch milliseconds
 * @param {{ stepMinutes?: number, amplitude?: number }} [options]
 * @returns {{ offsetX: number, offsetY: number }} offset in px, zero when minuteMs is invalid
 */
export function pixelShiftOffset(minuteMs, { stepMinutes = 5, amplitude = 24 } = {}) {
	if (typeof minuteMs !== 'number' || Number.isNaN(minuteMs)) {
		return { offsetX: 0, offsetY: 0 };
	}
	const stepIndex = Math.floor(minuteMs / (stepMinutes * 60_000));
	const pathLength = PIXEL_SHIFT_PATH.length;
	const position = PIXEL_SHIFT_PATH[((stepIndex % pathLength) + pathLength) % pathLength];
	return {
		offsetX: position.unitX * amplitude + 0,
		offsetY: position.unitY * amplitude + 0
	};
}
