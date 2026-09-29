# passenger-app (`@buspass/app`)

## Purpose

The Expo / React Native passenger app (web, Android, iOS): stop discovery, journey planning, assistance requests with live status, a private on-device assistant, and accessibility preferences.

## Interface

- Talks to the backend over HTTP and WebSocket (`EXPO_PUBLIC_API_BASE_URL`, default `http://localhost:3000`). It uses only what `contracts/` defines.
- Ignores WebSocket message types it does not recognise, so the backend can add operator-only messages safely.
- Passenger-visible request status is `SENDING` and `ACKNOWLEDGED` (plus exception updates `CANCELLED` and `FAILED`).

**Scope note:** the app still contains alighting and destination features (about 350 mentions of alighting across roughly 20 files). The 29 Sep handoff says the assistance workflow is boarding only. The app is deliberately left as it is and the mismatch is tracked as an open item in `docs/decisions/0002-architecture-ruling.md`.

## Run it alone

Needs `contracts/`, and any server that implements the backend routes for live data (the backend can run alone):

```powershell
npm.cmd install
npm.cmd run dev:app          # from the repo root; http://localhost:8081
```

A full `npm install` must be run from PowerShell: Git Bash's `tar` breaks the native `llama.rn` download.

## Test

```powershell
npm.cmd test --workspace @buspass/app
```

Verified 30 Sep 2026: 420 of 420 pass. Some tests read source files as text and match multi-line strings, so they need LF line endings; `.gitattributes` enforces that on every checkout (see `docs/decisions/0003-line-endings.md`). Before that fix, one test ("does not render empty search shells...") failed on Windows checkouts with `core.autocrlf=true`. `npm run typecheck` is clean.

## Depends on

`contracts` only.
