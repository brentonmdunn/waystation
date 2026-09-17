import { describe, expect, it } from 'vitest';
import { COLOR_MODES, DEFAULT_CONFIG, THEMES, normalizeConfig } from './defaults.js';
import { NIGHT_MODE_DEFAULTS, NIGHT_MODE_STYLES } from './night-mode.js';

describe('normalizeConfig', () => {
	it('returns defaults for an empty or missing config', () => {
		expect(normalizeConfig()).toEqual(DEFAULT_CONFIG);
		expect(normalizeConfig({})).toEqual(DEFAULT_CONFIG);
	});

	it('returns defaults for non-object values such as a null settings file', () => {
		expect(normalizeConfig(null)).toEqual(DEFAULT_CONFIG);
		expect(normalizeConfig('dark')).toEqual(DEFAULT_CONFIG);
		expect(normalizeConfig([1, 2])).toEqual(DEFAULT_CONFIG);
	});

	it('keeps valid values', () => {
		const cfg = { maxDepartures: 6, updateInterval: 15, theme: 'light', colorMode: 'mono' };
		expect(normalizeConfig(cfg)).toEqual({
			...cfg,
			branding: DEFAULT_CONFIG.branding,
			...NIGHT_MODE_DEFAULTS
		});
	});

	it('keeps valid night-mode values', () => {
		const nightModeConfig = {
			nightModeEnabled: true,
			nightModeStart: '22:00',
			nightModeEnd: '06:00',
			nightModeStyle: 'MINIMAL',
			nightModePixelShift: false,
			nightModeHideChrome: false
		};
		expect(normalizeConfig(nightModeConfig)).toEqual({
			...DEFAULT_CONFIG,
			...nightModeConfig
		});
	});

	it('falls back on invalid night-mode values', () => {
		const invalidNightModeConfig = {
			nightModeEnabled: 'yes',
			nightModeStart: '25:00',
			nightModeStyle: 'bright',
			nightModePixelShift: 'yes'
		};
		expect(normalizeConfig(invalidNightModeConfig)).toEqual({
			...DEFAULT_CONFIG,
			nightModeEnabled: false,
			nightModeStart: '',
			nightModeStyle: 'DIM',
			nightModePixelShift: true
		});
	});

	it('normalizes branding without throwing on bad values', () => {
		const out = normalizeConfig({ branding: { boardBg: '#101010', brandRed: 'red' } });
		expect(out.branding.boardBg).toBe('#101010');
		expect(out.branding.brandRed).toBe('');
	});

	it('falls back on invalid theme, colorMode, and numbers', () => {
		expect(
			normalizeConfig({ maxDepartures: 'abc', updateInterval: -2, theme: 'neon', colorMode: 'x' })
		).toEqual(DEFAULT_CONFIG);
	});

	it('exposes defaults that are members of the option lists', () => {
		expect(THEMES).toContain(DEFAULT_CONFIG.theme);
		expect(COLOR_MODES).toContain(DEFAULT_CONFIG.colorMode);
		expect(NIGHT_MODE_STYLES).toContain(DEFAULT_CONFIG.nightModeStyle);
	});
});
