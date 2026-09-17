import { render, cleanup } from '@testing-library/svelte';
import { describe, test, expect, afterEach } from 'vitest';
import NightView from './night-view.svelte';

/**
 * Builds a minimal arrival fixture in the shape formatBoardDeparture produces.
 * @param {object} overrides - fields to override on the default fixture.
 * @returns {object} an arrival object suitable for NightView's `arrivals` prop.
 */
function arrival(overrides = {}) {
	return {
		route: '249',
		name: 'Route 249',
		dest: 'South Bellevue Station',
		min: 6,
		delta: 0,
		status: 'ONTIME',
		departureAt: Date.now() + 6 * 60000,
		tripId: `t-${Math.random()}`,
		...overrides
	};
}

describe('NightView', () => {
	afterEach(() => cleanup());

	const now = new Date('2026-06-11T15:55:00Z');

	test('renders only the first two of five arrivals', () => {
		const arrivals = Array.from({ length: 5 }, (_, index) =>
			arrival({ tripId: `t-${index}`, route: String(index) })
		);
		const { container } = render(NightView, { props: { arrivals, now } });
		expect(container.querySelectorAll('[data-testid="night-departure"]')).toHaveLength(2);
	});

	test('shows the empty state once loaded with no departures', () => {
		const { container } = render(NightView, {
			props: { arrivals: [], now, lastUpdatedAt: now.getTime() }
		});
		expect(container.innerHTML).toContain('NO DEPARTURES');
	});

	test('shows the connecting state before the first fetch resolves', () => {
		const { container } = render(NightView, {
			props: { arrivals: [], now, lastUpdatedAt: null }
		});
		expect(container.innerHTML).toContain('CONNECTING');
	});

	test('renders the stop name and the clock', () => {
		const { container } = render(NightView, {
			props: { arrivals: [arrival()], now, stopName: 'Pine St & 3rd Ave' }
		});
		expect(container.textContent).toContain('Pine St & 3rd Ave');
		expect(container.querySelector('[data-testid="clock"]')).not.toBeNull();
	});

	test('renders the agency logo and name when provided', () => {
		const { container } = render(NightView, {
			props: {
				arrivals: [arrival()],
				now,
				agencyName: 'Open Transit Software Foundation',
				agencyLogo: '/logo.png'
			}
		});
		const header = container.querySelector('[data-testid="night-chrome-header"]');
		expect(header.querySelector('img').getAttribute('src')).toBe('/logo.png');
		expect(header.textContent).toContain('Open Transit Software Foundation');
	});

	test('shows the updated time in the footer when lastUpdatedAt is set', () => {
		const { container } = render(NightView, {
			props: { arrivals: [arrival()], now, lastUpdatedAt: now.getTime() }
		});
		const footer = container.querySelector('[data-testid="night-chrome-footer"]');
		expect(footer.textContent).toContain('UPDATED');
	});
});
