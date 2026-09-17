import { describe, expect, it } from 'vitest';
import {
	HHMM,
	NIGHT_MODE_DEFAULTS,
	NIGHT_MODE_STYLES,
	normalizeNightMode,
	parseHHMM,
	pixelShiftOffset,
	validateNightMode
} from './night-mode.js';

describe('parseHHMM', () => {
	it('returns minutes since midnight for valid HH:mm strings', () => {
		expect(parseHHMM('00:00')).toBe(0);
		expect(parseHHMM('06:30')).toBe(390);
		expect(parseHHMM('23:59')).toBe(1439);
	});

	it('returns null for invalid strings', () => {
		expect(parseHHMM('24:00')).toBeNull();
		expect(parseHHMM('7:00')).toBeNull();
		expect(parseHHMM('07:5')).toBeNull();
		expect(parseHHMM('aa:bb')).toBeNull();
		expect(parseHHMM('')).toBeNull();
		expect(parseHHMM(' 07:00')).toBeNull();
	});

	it('returns null for non-string input', () => {
		expect(parseHHMM(undefined)).toBeNull();
		expect(parseHHMM(null)).toBeNull();
		expect(parseHHMM(700)).toBeNull();
	});
});

describe('HHMM', () => {
	it('matches valid HH:mm strings', () => {
		expect(HHMM.test('22:00')).toBe(true);
	});

	it('rejects invalid HH:mm strings', () => {
		expect(HHMM.test('22:60')).toBe(false);
	});
});

describe('validateNightMode', () => {
	it('returns no errors for undefined', () => {
		expect(validateNightMode(undefined)).toEqual([]);
	});

	it('returns no errors for an empty object', () => {
		expect(validateNightMode({})).toEqual([]);
	});

	it('returns no errors when all fields are the defaults', () => {
		expect(validateNightMode(NIGHT_MODE_DEFAULTS)).toEqual([]);
	});

	it('returns no errors for a fully valid config', () => {
		const validConfig = {
			nightModeEnabled: true,
			nightModeStart: '22:00',
			nightModeEnd: '06:00',
			nightModeStyle: 'MINIMAL',
			nightModePixelShift: false,
			nightModeHideChrome: false
		};
		expect(validateNightMode(validConfig)).toEqual([]);
	});

	it('returns no errors when time fields are empty strings', () => {
		expect(validateNightMode({ nightModeStart: '', nightModeEnd: '' })).toEqual([]);
	});

	it('returns one error for an invalid start time', () => {
		expect(validateNightMode({ nightModeStart: '25:00' })).toEqual([
			'Night mode start must be a time like 22:00'
		]);
	});

	it('returns one error for an invalid end time', () => {
		expect(validateNightMode({ nightModeEnd: '25:00' })).toEqual([
			'Night mode end must be a time like 06:00'
		]);
	});

	it('returns one error for an invalid style', () => {
		expect(validateNightMode({ nightModeStyle: 'bright' })).toEqual([
			'Night mode style must be one of: DIM, MINIMAL'
		]);
	});

	it('returns one error for a non-boolean enabled flag', () => {
		expect(validateNightMode({ nightModeEnabled: 'yes' })).toEqual([
			'nightModeEnabled must be true or false'
		]);
	});

	it('returns one error for a non-boolean toggle', () => {
		expect(validateNightMode({ nightModePixelShift: 'yes' })).toEqual([
			'nightModePixelShift must be true or false'
		]);
	});

	it('returns one error per invalid field when several fields are bad', () => {
		const badConfig = {
			nightModeStart: '25:00',
			nightModeStyle: 'bright',
			nightModeHideChrome: 'yes'
		};
		expect(validateNightMode(badConfig)).toHaveLength(3);
	});

	it('ignores unrelated keys', () => {
		expect(validateNightMode({ maxDepartures: 10 })).toEqual([]);
	});
});

describe('normalizeNightMode', () => {
	it('returns the defaults for undefined', () => {
		expect(normalizeNightMode(undefined)).toEqual(NIGHT_MODE_DEFAULTS);
	});

	it('returns the defaults for null', () => {
		expect(normalizeNightMode(null)).toEqual(NIGHT_MODE_DEFAULTS);
	});

	it('returns the defaults for a non-object value', () => {
		expect(normalizeNightMode('x')).toEqual(NIGHT_MODE_DEFAULTS);
	});

	it('keeps valid values', () => {
		const validConfig = {
			nightModeEnabled: true,
			nightModeStart: '22:00',
			nightModeEnd: '06:00',
			nightModeStyle: 'MINIMAL',
			nightModePixelShift: false,
			nightModeHideChrome: false
		};
		expect(normalizeNightMode(validConfig)).toEqual(validConfig);
	});

	it('falls back to defaults per field when values are invalid', () => {
		const badConfig = {
			nightModeEnabled: 'yes',
			nightModeStart: '25:00',
			nightModeEnd: '25:00',
			nightModeStyle: 'bright',
			nightModePixelShift: 'yes',
			nightModeHideChrome: 'yes'
		};
		expect(normalizeNightMode(badConfig)).toEqual(NIGHT_MODE_DEFAULTS);
	});

	it('drops unknown keys', () => {
		expect(normalizeNightMode({ maxDepartures: 10 })).toEqual(NIGHT_MODE_DEFAULTS);
	});

	it('replaces empty strings with defaults', () => {
		const blankConfig = { nightModeStyle: '', nightModePixelShift: '', nightModeHideChrome: '' };
		expect(normalizeNightMode(blankConfig)).toEqual(NIGHT_MODE_DEFAULTS);
	});

	it('keeps false toggles instead of replacing them with the true default', () => {
		const normalized = normalizeNightMode({
			nightModePixelShift: false,
			nightModeHideChrome: false
		});
		expect(normalized.nightModePixelShift).toBe(false);
		expect(normalized.nightModeHideChrome).toBe(false);
	});
});

describe('pixelShiftOffset', () => {
	const stepMs = 5 * 60_000;

	it('stays within +/- amplitude for many inputs', () => {
		for (let step = 0; step < 200; step += 1) {
			const { offsetX, offsetY } = pixelShiftOffset(step * stepMs);
			expect(Math.abs(offsetX)).toBeLessThanOrEqual(24);
			expect(Math.abs(offsetY)).toBeLessThanOrEqual(24);
		}
	});

	it('gives the same output for the same input', () => {
		expect(pixelShiftOffset(12 * stepMs)).toEqual(pixelShiftOffset(12 * stepMs));
	});

	it('gives the same offset for the same 5-minute step', () => {
		const start = pixelShiftOffset(3 * stepMs);
		const middle = pixelShiftOffset(3 * stepMs + 4 * 60_000);
		expect(middle).toEqual(start);
	});

	it('moves to an adjacent cell on each consecutive step, including the wrap from 8 to 0', () => {
		let previous = pixelShiftOffset(0);
		for (let step = 1; step <= 9; step += 1) {
			const current = pixelShiftOffset(step * stepMs);
			expect(current).not.toEqual(previous);
			expect(Math.abs(current.offsetX - previous.offsetX)).toBeLessThanOrEqual(24);
			expect(Math.abs(current.offsetY - previous.offsetY)).toBeLessThanOrEqual(24);
			previous = current;
		}
	});

	it('respects a custom amplitude', () => {
		const { offsetX, offsetY } = pixelShiftOffset(stepMs, { amplitude: 10 });
		expect(Math.abs(offsetX)).toBeLessThanOrEqual(10);
		expect(Math.abs(offsetY)).toBeLessThanOrEqual(10);
	});

	it('respects a custom stepMinutes', () => {
		const oneMinuteStep = pixelShiftOffset(60_000, { stepMinutes: 1 });
		const anotherOneMinuteStep = pixelShiftOffset(2 * 60_000, { stepMinutes: 1 });
		expect(oneMinuteStep).not.toEqual(anotherOneMinuteStep);
	});

	it('returns zero offset for NaN input', () => {
		expect(pixelShiftOffset(NaN)).toEqual({ offsetX: 0, offsetY: 0 });
	});

	it('does not throw and stays in bounds for negative input', () => {
		const { offsetX, offsetY } = pixelShiftOffset(-7 * stepMs);
		expect(Math.abs(offsetX)).toBeLessThanOrEqual(24);
		expect(Math.abs(offsetY)).toBeLessThanOrEqual(24);
	});
});

describe('NIGHT_MODE_DEFAULTS', () => {
	it('is disabled by default', () => {
		expect(NIGHT_MODE_DEFAULTS.nightModeEnabled).toBe(false);
	});

	it('has a nightModeStyle that is a member of NIGHT_MODE_STYLES', () => {
		expect(NIGHT_MODE_STYLES).toContain(NIGHT_MODE_DEFAULTS.nightModeStyle);
	});
});
