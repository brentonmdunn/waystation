// The data the mock OBA server serves. Edit this file to set up whatever the board
// should show; the server (server.js) turns it into OBA-shaped responses.
//
// Stop and route keys are the bare IDs. The server prefixes them with the agency ID, so
// stop '1' is served as '1_1' and both /stops/1 and /stops/1_1 reach it.

export const agency = {
	id: '1',
	name: 'Mock Transit',
	timezone: 'America/Los_Angeles',
	lang: 'en',
	url: 'https://example.com',
	phone: '1-555-0100',
	email: '',
	fareUrl: '',
	disclaimer: '',
	privateService: false
};

export const routes = {
	1: { shortName: '1', longName: 'Downtown', color: '006cb3', textColor: 'ffffff' },
	2: { shortName: '2', longName: 'Airport', color: '6cb33f', textColor: '000000' },
	3: { shortName: '3', longName: 'University', color: 'c8102e', textColor: 'ffffff' },
	4: { shortName: '4', longName: 'Harbor', color: 'f2a900', textColor: '000000' },
	5: { shortName: '5', longName: 'Lakewood', color: '6b2c91', textColor: 'ffffff' }
};

export const stops = {
	1: { name: 'Grandview Dr W & 29th St W', code: '1040', direction: 'N' },
	2: { name: 'Grandview Dr W & 29th St W - Bay 3', code: '1041', direction: 'S' }
};

// Service alerts, keyed by name. Attach them to departures with `alerts: ['detour']`.
// severity: NOIMPACT | VERYSLIGHT | SLIGHT -> info, NORMAL -> advisory, SEVERE | VERYSEVERE -> alert
export const alerts = {
	detour: {
		summary: 'Route 3 is on detour between 6th Ave and Pine St.',
		description: 'Buses are using Division Ave. Stops on 6th Ave are closed.',
		severity: 'SEVERE',
		url: '',
		fromMin: -60, // active window start, minutes from now (omit for no window)
		toMin: 120
	},
	elevator: {
		summary: 'Elevator at the transit center is out of service.',
		severity: 'SLIGHT'
	}
};

// Departures per stop. `default` covers any stop that has no entry of its own.
//
// Each departure takes:
//   route          key from `routes` above
//   inMin          minutes from now the trip is SCHEDULED to depart
//   lateMin        minutes late (negative = early, 0/omitted = on time)
//   occupancy      GTFS-RT OccupancyStatus: EMPTY, MANY_SEATS_AVAILABLE, FEW_SEATS_AVAILABLE,
//                  STANDING_ROOM_ONLY, CRUSHED_STANDING_ROOM_ONLY, FULL,
//                  NOT_ACCEPTING_PASSENGERS, or '' for no data
//   canceled       true marks the trip CANCELED (the board hides the crowding indicator)
//   scheduledOnly  true drops the real-time prediction, so the board shows it as scheduled
//   headsign       overrides the route's long name
//   alerts         keys from `alerts` above
export const departures = {
	1: [
		{ route: '1', inMin: 3, occupancy: 'MANY_SEATS_AVAILABLE' },
		{ route: '2', inMin: 7, lateMin: 2, occupancy: 'STANDING_ROOM_ONLY' },
		{ route: '3', inMin: 11, occupancy: 'FULL', alerts: ['detour'] },
		{ route: '4', inMin: 15, occupancy: 'FULL', canceled: true }
	],
	2: [{ route: '5', inMin: 3, lateMin: 5, occupancy: 'EMPTY' }],
	default: [
		{ route: '1', inMin: 4, occupancy: 'MANY_SEATS_AVAILABLE' },
		{ route: '2', inMin: 9, lateMin: -1, occupancy: 'FEW_SEATS_AVAILABLE' },
		{ route: '3', inMin: 14, scheduledOnly: true, occupancy: '' }
	]
};
