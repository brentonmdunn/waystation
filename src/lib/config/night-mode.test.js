import { describe, expect, it } from 'vitest';
import { HHMM, parseHHMM } from './night-mode.js';

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
