<script>
	import { getLocale } from '$lib/paraglide/runtime.js';
	import * as t from '$lib/paraglide/messages.js';
	import ArrivalHero from '$components/board/arrival-hero.svelte';
	import ClockBlock from '$components/board/clock-block.svelte';
	import EmptyBoard from '$components/board/empty-board.svelte';
	import PixelShift from '$components/board/pixel-shift.svelte';
	import RouteBadge from '$components/board/route-badge.svelte';

	const STALE_THRESHOLD_MS = 90_000;

	let {
		arrivals = [],
		now,
		stopName = '',
		agencyName = '',
		agencyLogo = '',
		lastUpdatedAt = null,
		isStale = false,
		fetchFailed = false,
		pixelShift = true,
		hideChrome = true
	} = $props();

	const visibleArrivals = $derived(arrivals.slice(0, 2));
	const updatedDate = $derived(lastUpdatedAt ? new Date(lastUpdatedAt) : null);
	const ageMs = $derived(updatedDate ? now.getTime() - updatedDate.getTime() : null);
	const stale = $derived(isStale || (ageMs != null && ageMs > STALE_THRESHOLD_MS));
	const emptyMode = $derived.by(() => {
		if (updatedDate) return stale ? 'stale' : 'empty';
		return fetchFailed ? 'error' : 'connecting';
	});
</script>

<div
	data-testid="night-view"
	style:position="absolute"
	style:inset="0"
	style:background="#000"
	style:color="var(--ink-dim)"
>
	<!-- 48px inset leaves room for pixel-shift drift without clipping. -->
	<PixelShift enabled={pixelShift} {now}>
		<div
			style:position="absolute"
			style:inset="0"
			style:padding="48px"
			style:display="flex"
			style:flex-direction="column"
			style:gap="28px"
			style:min-height="0"
		>
			{#if !hideChrome}
				<!-- CHROME HEADER -->
				<div
					data-testid="night-chrome-header"
					style:display="flex"
					style:align-items="center"
					style:gap="20px"
				>
					{#if agencyLogo}
						<img
							src={agencyLogo}
							alt={agencyName}
							style:height="48px"
							style:width="auto"
							style:object-fit="contain"
						/>
					{/if}
					{#if agencyName}
						<span
							style:font-family="'IBM Plex Sans', sans-serif"
							style:font-weight="700"
							style:font-size="18px"
							style:color="var(--ink-mute)"
							style:letter-spacing="0.01em"
						>
							{agencyName}
						</span>
					{/if}
				</div>
			{/if}

			<!-- STOP IDENTITY -->
			<div
				style:display="flex"
				style:align-items="flex-start"
				style:justify-content="space-between"
				style:gap="24px"
			>
				<div
					class="display"
					style:font-size="64px"
					style:font-weight="700"
					style:line-height="1"
					style:letter-spacing="-0.01em"
					style:white-space="nowrap"
					style:overflow="hidden"
					style:text-overflow="ellipsis"
					style:color="var(--ink-dim)"
				>
					{stopName}
				</div>
				<ClockBlock {now} />
			</div>

			<!-- DEPARTURES -->
			<div
				style:flex="1"
				style:display="flex"
				style:flex-direction="column"
				style:gap="32px"
				style:min-height="0"
			>
				{#if visibleArrivals.length === 0}
					<EmptyBoard mode={emptyMode} rowCount={2} />
				{:else}
					{#each visibleArrivals as arrival (arrival.tripId ?? `${arrival.route}-${arrival.departureAt}`)}
						<div
							data-testid="night-departure"
							style:flex="1"
							style:display="flex"
							style:align-items="center"
							style:gap="40px"
							style:min-height="0"
							style:opacity={arrival.status === 'CANCEL' ? 0.78 : 1}
						>
							<RouteBadge route={arrival.route} />
							<div
								class="display"
								style:flex="1"
								style:min-width="0"
								style:font-size="72px"
								style:font-weight="700"
								style:line-height="1.05"
								style:letter-spacing="-0.01em"
								style:white-space="nowrap"
								style:overflow="hidden"
								style:text-overflow="ellipsis"
								style:color="var(--ink-dim)"
							>
								{arrival.dest}
							</div>
							<ArrivalHero {arrival} />
						</div>
					{/each}
				{/if}
			</div>

			{#if !hideChrome}
				<!-- CHROME FOOTER -->
				<footer
					data-testid="night-chrome-footer"
					class="sc tnum"
					style:font-size="16px"
					style:letter-spacing="0.14em"
					style:color={stale ? 'var(--late)' : 'var(--ink-mute)'}
					style:font-weight={stale ? 700 : 400}
				>
					{#if !updatedDate}
						{t.board_updating()}
					{:else if stale}
						{t.board_stale_prefix()}
						{updatedDate.toLocaleTimeString(getLocale(), {
							hour: 'numeric',
							minute: '2-digit',
							second: '2-digit'
						})}
					{:else}
						{t.board_updated()}
						{updatedDate.toLocaleTimeString(getLocale(), {
							hour: 'numeric',
							minute: '2-digit',
							second: '2-digit'
						})}
					{/if}
				</footer>
			{/if}
		</div>
	</PixelShift>
</div>
