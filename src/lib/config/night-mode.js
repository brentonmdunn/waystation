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

export const NIGHT_MODE_DEFAULTS = Object.freeze({
	nightModeEnabled: false,
	nightModeStart: '',
	nightModeEnd: '',
	nightModeStyle: 'DIM',
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
