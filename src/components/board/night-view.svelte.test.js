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
				agencyLogo: '/logo.png',
				hideChrome: false
			}
		});
		const header = container.querySelector('[data-testid="night-chrome-header"]');
		expect(header.querySelector('img').getAttribute('src')).toBe('/logo.png');
		expect(header.textContent).toContain('Open Transit Software Foundation');
	});

	test('shows the updated time in the footer when lastUpdatedAt is set', () => {
		const { container } = render(NightView, {
			props: { arrivals: [arrival()], now, lastUpdatedAt: now.getTime(), hideChrome: false }
		});
		const footer = container.querySelector('[data-testid="night-chrome-footer"]');
		expect(footer.textContent).toContain('UPDATED');
	});

	test('hides chrome by default: no header, footer, logo, or agency name', () => {
		const { container } = render(NightView, {
			props: {
				arrivals: [arrival()],
				now,
				stopName: 'Pine St & 3rd Ave',
				agencyName: 'Open Transit Software Foundation',
				agencyLogo: '/logo.png',
				lastUpdatedAt: now.getTime()
			}
		});
		expect(container.querySelector('[data-testid="night-chrome-header"]')).toBeNull();
		expect(container.querySelector('[data-testid="night-chrome-footer"]')).toBeNull();
		expect(container.querySelector('img')).toBeNull();
		expect(container.textContent).not.toContain('Open Transit Software Foundation');
		expect(container.textContent).toContain('Pine St & 3rd Ave');
		expect(container.querySelectorAll('[data-testid="night-departure"]')).toHaveLength(1);
	});

	test('disables the pixel-shift wrapper when pixelShift is false', () => {
		const { container } = render(NightView, {
			props: { arrivals: [arrival()], now, pixelShift: false }
		});
		expect(container.querySelector('[data-testid="pixel-shift"]')).toBeNull();
	});

	test('renders a pixel-shift wrapper with a transform when pixelShift is true', () => {
		const { container } = render(NightView, {
			props: { arrivals: [arrival()], now, pixelShift: true }
		});
		const wrapper = container.querySelector('[data-testid="pixel-shift"]');
		expect(wrapper).not.toBeNull();
		expect(wrapper.style.transform).toMatch(/translate/);
	});

	test('the pixel-shift transform changes between now values 5 minutes apart', () => {
		const laterNow = new Date(now.getTime() + 5 * 60_000);

		const { container: firstContainer } = render(NightView, {
			props: { arrivals: [arrival()], now, pixelShift: true }
		});
		const firstTransform = firstContainer.querySelector('[data-testid="pixel-shift"]').style
			.transform;
		cleanup();

		const { container: secondContainer } = render(NightView, {
			props: { arrivals: [arrival()], now: laterNow, pixelShift: true }
		});
		const secondTransform = secondContainer.querySelector('[data-testid="pixel-shift"]').style
			.transform;

		expect(secondTransform).not.toBe(firstTransform);
	});
});
