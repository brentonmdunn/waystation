// Fake OneBusAway API for local development, so the board can be driven without a real
// upstream. Edit scenario.js to change what it serves; this file only shapes the responses.
//
// Point the app at it with a shell override, which beats .env and leaves your real credentials
// alone (no API key needed — the mock never checks it):
//
//   npm run mock                                              terminal 1
//   PUBLIC_OBA_SERVER_URL=http://localhost:4010/ npm run dev   terminal 2
//
// Then open /stops/1_1 or /stops/1_1+1_2. Setting PUBLIC_OBA_SERVER_URL in .env works too, but
// restart the dev server after: SvelteKit reads $env/static/* at startup.
//
// The board's language is a browser cookie, not an env var: pick one in /admin, or run
// `document.cookie = 'PARAGLIDE_LOCALE=ar; path=/'; location.reload()` in the devtools console
// (en, de, ar, es, fr).
//
// Env knobs below are for this server only — set them on the `npm run mock` command, not in
// .env — and exercise the proxy's failure paths in src/routes/api/oba/*:
//   MOCK_OBA_PORT=4010        port to listen on
//   MOCK_OBA_DELAY=2000       delay every response by N ms
//   MOCK_OBA_FAIL=1           return HTTP 500 (proxy serves cached data as stale, else 503)
//   MOCK_OBA_EMPTY=1          return `"data": null` (the board shows its empty state)
import http from 'node:http';

import { agency, alerts, departures, routes, stops } from './scenario.js';

const PORT = Number(process.env.MOCK_OBA_PORT) || 4010;
const DELAY = Number(process.env.MOCK_OBA_DELAY) || 0;
const FAIL = process.env.MOCK_OBA_FAIL === '1';
const EMPTY = process.env.MOCK_OBA_EMPTY === '1';

const MINUTE = 60_000;

// Stop and route IDs are agency-prefixed on the wire ('1_1'); scenario.js uses bare keys ('1').
const withAgency = (key) => `${agency.id}_${key}`;
const bareKey = (id) => String(id).split('_').pop();

// A stop with no list of its own falls back to `default`; with neither, it simply has no
// departures, which is a real OBA case and renders the board's empty state.
const departuresFor = (key) => departures[key] ?? departures.default ?? [];

function stopBean(key) {
	const stop = stops[key] ?? {};
	const routeIds = departuresFor(key).map((d) => withAgency(d.route));
	return {
		code: stop.code ?? key,
		direction: stop.direction ?? '',
		id: withAgency(key),
		lat: stop.lat ?? 47.2337,
		locationType: 0,
		lon: stop.lon ?? -122.5503,
		name: stop.name ?? `Mock Stop ${key}`,
		parent: '',
		routeIds,
		staticRouteIds: routeIds,
		wheelchairBoarding: 'ACCESSIBLE'
	};
}

function routeBean(key) {
	const route = routes[key] ?? { shortName: key, longName: `Route ${key}` };
	return {
		agencyId: agency.id,
		color: route.color ?? '',
		description: '',
		id: withAgency(key),
		longName: route.longName,
		nullSafeShortName: route.shortName,
		shortName: route.shortName,
		textColor: route.textColor ?? '',
		type: 3,
		url: ''
	};
}

function situationBean(key, now) {
	const alert = alerts[key] ?? {};
	const activeWindow = {};
	if (alert.fromMin !== undefined) activeWindow.from = now + alert.fromMin * MINUTE;
	if (alert.toMin !== undefined) activeWindow.to = now + alert.toMin * MINUTE;

	return {
		id: withAgency(key),
		creationTime: now - 60 * MINUTE,
		activeWindows: Object.keys(activeWindow).length ? [activeWindow] : [],
		allAffects: [],
		consequences: [],
		description: { lang: agency.lang, value: alert.description ?? '' },
		reason: alert.reason ?? 'OTHER_CAUSE',
		severity: alert.severity ?? 'NORMAL',
		summary: { lang: agency.lang, value: alert.summary ?? '' },
		url: { lang: agency.lang, value: alert.url ?? '' }
	};
}

function departureBean(stopKey, dep, i, now) {
	const {
		route,
		inMin = (i + 1) * 5,
		lateMin = 0,
		occupancy = '',
		canceled = false,
		scheduledOnly = false,
		headsign,
		alerts: alertKeys = []
	} = dep;

	const scheduled = now + inMin * MINUTE;
	// A real server leaves predictions unset on a canceled trip, and has none at all for a
	// schedule-only departure. 0 is how OBA reports "no prediction".
	const predicted = canceled || scheduledOnly ? 0 : scheduled + lateMin * MINUTE;
	const tripId = withAgency(`trip_${stopKey}_${route}_${i}`);
	const vehicleId = withAgency(`veh_${stopKey}_${i}`);
	const routeName = routes[route]?.longName ?? `Route ${route}`;
	const situationIds = alertKeys.map(withAgency);

	return {
		actualTrack: '',
		arrivalEnabled: true,
		blockTripSequence: i,
		departureEnabled: true,
		distanceFromStop: inMin * 250,
		frequency: null,
		historicalOccupancy: '',
		lastUpdateTime: now,
		numberOfStopsAway: i + 2,
		occupancyStatus: occupancy,
		predicted: predicted > 0,
		predictedArrivalInterval: null,
		predictedArrivalTime: predicted,
		predictedDepartureInterval: null,
		predictedDepartureTime: predicted,
		predictedOccupancy: '',
		routeId: withAgency(route),
		routeLongName: routeName,
		routeShortName: routes[route]?.shortName ?? route,
		scheduledArrivalInterval: null,
		scheduledArrivalTime: scheduled,
		scheduledDepartureInterval: null,
		scheduledDepartureTime: scheduled,
		scheduledTrack: '',
		serviceDate: now,
		situationIds,
		// OBA sets the top-level status to CANCELED too, not just on tripStatus.
		status: canceled ? 'CANCELED' : 'default',
		stopId: withAgency(stopKey),
		stopSequence: i + 1,
		totalStopsInTrip: 30,
		tripHeadsign: headsign ?? routeName,
		tripId,
		tripStatus: {
			activeTripId: tripId,
			blockTripSequence: i,
			closestStop: withAgency(stopKey),
			closestStopTimeOffset: inMin * 60,
			distanceAlongTrip: 6000,
			frequency: null,
			lastKnownDistanceAlongTrip: 0,
			lastKnownOrientation: 0,
			lastLocationUpdateTime: predicted > 0 ? now : 0,
			lastUpdateTime: now,
			nextStop: withAgency(stopKey),
			nextStopTimeOffset: inMin * 60,
			occupancyCapacity: -1,
			occupancyCount: -1,
			occupancyStatus: occupancy,
			orientation: 104.5,
			phase: 'in_progress',
			position: { lat: 47.2076, lon: -122.5052 },
			predicted: predicted > 0,
			scheduleDeviation: lateMin * 60,
			scheduledDistanceAlongTrip: 6000,
			serviceDate: now,
			situationIds,
			// 'CANCELED' is OBA's TransitDataConstants.STATUS_CANCELED; live trips report the
			// GTFS-RT schedule relationship, and trips with no real-time data report 'default'.
			status: canceled ? 'CANCELED' : scheduledOnly ? 'default' : 'SCHEDULED',
			totalDistanceAlongTrip: 16000,
			vehicleFeatures: [],
			vehicleId: predicted > 0 ? vehicleId : ''
		},
		vehicleId: predicted > 0 ? vehicleId : ''
	};
}

function tripBean(stopKey, dep, i) {
	const routeName = routes[dep.route]?.longName ?? `Route ${dep.route}`;
	return {
		blockId: withAgency(`veh_${stopKey}_${i}`),
		directionId: '0',
		id: withAgency(`trip_${stopKey}_${dep.route}_${i}`),
		peakOffpeak: 0,
		routeId: withAgency(dep.route),
		routeShortName: '',
		serviceId: withAgency('service'),
		shapeId: withAgency(`shp-${dep.route}`),
		timeZone: '',
		tripHeadsign: dep.headsign ?? routeName,
		tripShortName: ''
	};
}

function arrivalsForStop(stopKey) {
	const now = Date.now();
	const list = departuresFor(stopKey);
	const alertKeys = [...new Set(list.flatMap((d) => d.alerts ?? []))];
	const routeKeys = [...new Set(list.map((d) => d.route))];

	return {
		entry: {
			arrivalsAndDepartures: list.map((dep, i) => departureBean(stopKey, dep, i, now)),
			nearbyStopIds: [],
			situationIds: alertKeys.map(withAgency),
			stopId: withAgency(stopKey)
		},
		references: {
			agencies: [agency],
			routes: routeKeys.map(routeBean),
			situations: alertKeys.map((key) => situationBean(key, now)),
			stopTimes: [],
			stops: [stopBean(stopKey)],
			trips: list.map((dep, i) => tripBean(stopKey, dep, i))
		}
	};
}

const emptyReferences = {
	agencies: [],
	routes: [],
	situations: [],
	stopTimes: [],
	stops: [],
	trips: []
};

// path -> data, mirroring the OBA endpoints the app calls through the SDK.
const ROUTES = [
	[
		/^\/api\/where\/arrivals-and-departures-for-stop\/(.+)\.json$/,
		(id) => arrivalsForStop(bareKey(id))
	],
	[
		/^\/api\/where\/stop\/(.+)\.json$/,
		(id) => ({
			entry: stopBean(bareKey(id)),
			references: { ...emptyReferences, agencies: [agency], stops: [stopBean(bareKey(id))] }
		})
	],
	[
		/^\/api\/where\/agencies-with-coverage\.json$/,
		() => ({
			limitExceeded: false,
			list: [{ agencyId: agency.id, lat: 47.2337, latSpan: 0.5, lon: -122.5503, lonSpan: 0.5 }],
			references: { ...emptyReferences, agencies: [agency] }
		})
	],
	[
		/^\/api\/where\/stops-for-agency\/(.+)\.json$/,
		() => ({
			limitExceeded: false,
			list: Object.keys(stops).map(stopBean),
			references: emptyReferences
		})
	],
	[
		/^\/api\/where\/stop-ids-for-agency\/(.+)\.json$/,
		() => ({
			limitExceeded: false,
			list: Object.keys(stops).map(withAgency),
			references: emptyReferences
		})
	]
];

function handle(pathname) {
	for (const [pattern, build] of ROUTES) {
		const match = pathname.match(pattern);
		if (match) return build(match[1] ? decodeURIComponent(match[1]) : undefined);
	}
	return undefined;
}

http
	.createServer(async (req, res) => {
		const { pathname } = new URL(req.url, `http://localhost:${PORT}`);
		res.setHeader('Content-Type', 'application/json');

		if (DELAY) await new Promise((resolve) => setTimeout(resolve, DELAY));

		if (FAIL) {
			console.log(`500 ${pathname} (MOCK_OBA_FAIL)`);
			res.statusCode = 500;
			return res.end(JSON.stringify({ code: 500, text: 'Mock failure', version: 2, data: null }));
		}

		const data = handle(pathname);
		if (data === undefined) {
			console.log(`404 ${pathname}`);
			res.statusCode = 404;
			return res.end(JSON.stringify({ code: 404, text: 'Not mocked', version: 2, data: null }));
		}

		console.log(`200 ${pathname}${EMPTY ? ' (MOCK_OBA_EMPTY)' : ''}`);
		res.end(
			JSON.stringify({
				code: 200,
				currentTime: Date.now(),
				text: 'OK',
				version: 2,
				data: EMPTY ? null : data
			})
		);
	})
	.listen(PORT, () => {
		console.log(`Mock OBA listening on http://localhost:${PORT}`);
		console.log(
			`Stops: ${Object.keys(stops).map(withAgency).join(', ')} (any other ID also works)`
		);
	});
