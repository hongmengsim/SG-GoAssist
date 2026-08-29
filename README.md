# SG GoAssist

Accessible journeys. Guided with care.

## Local development

From the repository root, start the complete development environment once:

```powershell
npm.cmd run dev
```

This command uses the canonical URLs below and does not open a browser:

- Frontend: `http://localhost:8081`
- Backend: `http://localhost:3000`

Open the frontend URL manually once. Expo Fast Refresh applies ordinary changes
to `App.tsx`, map components, styles, and API clients in that same tab. Running
`npm.cmd run dev` again reuses healthy SG GoAssist servers; it does not choose a
new port. If either port belongs to another application, the command fails with
a clear message.

Useful explicit commands:

```powershell
npm.cmd run dev:app
npm.cmd run dev:backend
npm.cmd run dev:health
npm.cmd run typecheck
npm.cmd test
npm.cmd run build
npm.cmd run format:check
```

Tests, builds, typechecks, and formatting checks never start Expo or open a
browser. Runtime smoke checks reuse `http://localhost:8081`; E2E checks reuse the
backend already running on port 3000. Restart Expo only for environment,
configuration, dependency, or bundler-health changes: stop the current `dev`
command first, then run it again so the same ports are reused.

## Regional bus-stop data

The backend serves a normalized, indexed bus-stop snapshot through:

- `GET /api/bus-stops/nearby?lat=&lng=&radius=&limit=`
- `GET /api/bus-stops/bounds?north=&south=&east=&west=&limit=`
- `GET /api/bus-stops/search?q=`
- `GET /api/bus-stops/:code`
- `GET /api/bus-stops/:code/services/:serviceNo/routes`

Local development includes a normalized static LTA DataMall snapshot with 5,204
geocoded stops, names, roads, stop-to-service memberships, and compact route
patterns. Service membership and route/destination selection remain available
when the live Bus Arrival endpoint is unavailable.

The checked-in snapshot can be reproduced from its source CSV files with:

```powershell
npm.cmd run import:lta-snapshot --workspace @buspass/backend -- data/BusStops.source.csv data/BusRoutes.source.csv data/bus-stops.sg.json
```

To refresh directly from DataMall, copy `.env.example` to `.env`, set the
server-only `LTA_DATAMALL_ACCOUNT_KEY` value, and run:

```powershell
npm.cmd run sync:lta --workspace @buspass/backend
```

The sync paginates both `BusStops` and `BusRoutes` in 500-record pages and writes
`packages/backend/data/bus-stops.sg.json`. Never expose this key through an `EXPO_PUBLIC_`
variable.

The vendored BusStops and BusRoutes source snapshots contain LTA DataMall data
accessed on 2026-07-06 via the transparent
[Vorld/singapore-gtfs](https://github.com/Vorld/singapore-gtfs) snapshot. The
underlying LTA data is made available under the Singapore Open Data Licence
v1.0. This project is unofficial and is not endorsed by LTA or any transport
operator.
