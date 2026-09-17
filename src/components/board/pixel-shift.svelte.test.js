import { render, cleanup } from '@testing-library/svelte';
import { createRawSnippet } from 'svelte';
import { describe, test, expect, afterEach } from 'vitest';
import PixelShift from './pixel-shift.svelte';

const childSnippet = createRawSnippet(() => ({
	render: () => '<span data-testid="child">hi</span>'
}));

describe('PixelShift', () => {
	afterEach(() => cleanup());

	test('renders the child with no wrapper when disabled', () => {
		const { container } = render(PixelShift, {
			props: { enabled: false, now: new Date(2026, 7, 25, 19, 50, 0), children: childSnippet }
		});
		expect(container.querySelector('[data-testid="child"]')).not.toBeNull();
		expect(container.querySelector('[data-testid="pixel-shift"]')).toBeNull();
	});

	test('wraps the child in a translated container when enabled', () => {
		const { container } = render(PixelShift, {
			props: { enabled: true, now: new Date(2026, 7, 25, 19, 50, 0), children: childSnippet }
		});
		const wrapper = container.querySelector('[data-testid="pixel-shift"]');
		expect(wrapper).not.toBeNull();
		expect(wrapper.querySelector('[data-testid="child"]')).not.toBeNull();
		expect(wrapper.style.transform).toMatch(/^translate\(-?\d+px, -?\d+px\)$/);
	});

	test('gives different transforms for now values 5 minutes apart', () => {
		const a = render(PixelShift, {
			props: { enabled: true, now: new Date(2026, 7, 25, 19, 50, 0), children: childSnippet }
		});
		const first = a.container.querySelector('[data-testid="pixel-shift"]').style.transform;
		cleanup();

		const b = render(PixelShift, {
			props: { enabled: true, now: new Date(2026, 7, 25, 19, 55, 0), children: childSnippet }
		});
		const second = b.container.querySelector('[data-testid="pixel-shift"]').style.transform;

		expect(second).not.toBe(first);
	});
});
