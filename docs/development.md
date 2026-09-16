# Developer Guide

This guide provides the essentials for setting up a development environment, running the app, and contributing safely.


## Getting Started

### 1. Prerequisites

* Node.js v16+
* npm

### 2. Setup

1. Clone the repository.
2. Install dependencies:

   ```bash
   npm install
   ```
3. Create a `.env` file for environment variables (see below).

### 3. Environment Variables

Define the following keys in `.env`:

```env
PUBLIC_OBA_LOGO_URL="https://opentransitsoftwarefoundation.org/images/logos/onebusaway.svg"
PUBLIC_OBA_REGION_NAME="Sound Transit"
PUBLIC_OBA_SERVER_URL="https://api.pugetsound.onebusaway.org/"
PRIVATE_OBA_API_KEY="test"
```

> [!TIP]
> OBA API usage may be rate-limited. Contact the project admins via [Slack](https://opentransitsoftwarefoundation.org/join-our-slack/) if you encounter issues.

### 4. Mock OBA server (optional)

`npm run mock` serves a fake OneBusAway API on port 4010, so the board can be developed without a
live upstream or an API key. Point the app at it with a shell override, which beats `.env` and
leaves your real credentials alone:

```bash
npm run mock                                          # terminal 1
PUBLIC_OBA_SERVER_URL=http://localhost:4010/ npm run dev   # terminal 2
```

Then open `/stops/1_1` (four routes, one per crowding level, plus a canceled trip and a service
alert) or `/stops/1_1+1_2` for the multi-stop board.

Edit `scripts/mock-oba/scenario.js` to change the agency, routes, stops, alerts, and departures —
arrival times, delays, occupancy status, and cancellations are all set there. Env knobs for
failure paths (`MOCK_OBA_FAIL`, `MOCK_OBA_EMPTY`, `MOCK_OBA_DELAY`, `MOCK_OBA_PORT`) are
documented at the top of `scripts/mock-oba/server.js`.

The server also exposes a runtime control seam, `/__control`, for tools (such as `npm run
ui-diff`) that need to flip failure modes or freeze the clock without restarting the process:

```bash
curl http://localhost:4010/__control                                # -> current state
curl -X POST http://localhost:4010/__control -d '{"mode":"fail"}'    # switch to 500s
curl -X POST http://localhost:4010/__control -d '{"mode":"normal","now":null}'  # restore
```

`GET /__control` returns the current `{mode, delay, now}`; `POST /__control` merges a partial
JSON body into that state and returns the result. `mode` is one of `normal` | `empty` | `fail`;
`delay` is ms added to every data response; `now` pins the epoch-ms the server treats as "the
time" (`null` uses the real clock), which makes departure minutes reproducible across repeated
requests. Absent keys are left alone; an invalid `mode` or non-numeric `delay` leaves the state
untouched and returns `400 {"error": "..."}`. `/__control` always answers immediately, ahead of
the artificial delay and the fail check, so it works even while the mock is pretending to be slow
or down.

### 5. Testing

* Each component or utility has an accompanying `.test.js` file.
* Ensure your changes do not break existing tests.
* Add tests for any new functionality.

```bash
npm test
```

## Documentation

* [OneBusAway JS-SDK](https://github.com/OneBusAway/js-sdk) — technical details & testing.
* [OBA Documentation](https://developer.onebusaway.org/) — general API reference.
* [Routing Guide](routing.md) — Waystation architecture overview.
* [API Reference](api-reference.md) — list of internal API endpoints.

## Support

* For further help & guidance, check our [Support](../SUPPORT.md) framework!
