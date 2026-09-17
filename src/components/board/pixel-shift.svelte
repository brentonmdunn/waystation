<script>
	import { pixelShiftOffset } from '$lib/config/night-mode.js';

	let { enabled = true, now, children } = $props();

	// Truncate to the minute so the offset (and its dependents) only recompute once a minute,
	// the same reasoning as clock-block.svelte's minuteMs: this has to be a primitive because
	// $derived compares with ===, and a fresh Date object would invalidate every tick.
	const minuteMs = $derived(Math.floor(now.getTime() / 60_000) * 60_000);

	const offset = $derived(pixelShiftOffset(minuteMs));
</script>

{#if !enabled}
	{@render children()}
{:else}
	<div
		data-testid="pixel-shift"
		style:position="absolute"
		style:inset="0"
		style:transform="translate({offset.offsetX}px, {offset.offsetY}px)"
	>
		{@render children()}
	</div>
{/if}
