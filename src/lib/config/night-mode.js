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
