# Restructure plan: independent, modular parts

> **Update, 30 Sep 2026: the project owner chose the full rename, and it is done (step R6 below).** Read every `packages/shared` in this document as **`contracts/`**, `packages/backend` as **`backend/`**, `packages/app` as **`passenger-app/`**, and `packages/operator-console` as top-level **`operator-console/`**. The npm package names (`@buspass/shared`, `@buspass/backend`, `@buspass/app`) are unchanged so no import site changed. Status of the other steps (30 Sep 2026): **done** R0 (module READMEs, `scripts/modules.json`, `npm run check:modules` with 12 tests), R1 (docs reorganised), R3 and R4 (hardware moved to `pi/tof-link` and `firmware/`, reference material to `archive/`), R5 CODEOWNERS. **Skeleton only** R2: `pi/perception`, `pi/safety-gate`, `pi/bus-agent` and `operator-console` have READMEs that define their interfaces but no code yet. **Not done:** per-module CI jobs (cannot be verified locally), generated JSON Schema from the contract, `docs/runbooks/`. Verified after the rename against the pre-rename baseline: typecheck clean; backend 94/94; passenger app 419 pass with the same single pre-existing failure ("does not render empty search shells..."); backend boots; Metro and Expo config load.

Goal (from the project owner, 30 Sep 2026): the repo should be clear and modular, and **each part should be able to live and be developed on its own** without needing the others to be running or even present.

## 1. What the survey found (read-only, 30 Sep 2026)

| Finding | Consequence |
|---|---|
| Only `packages/app` and `packages/backend` import `@buspass/shared`; the Python hardware folders import nothing from each other | Good starting point: the contract is already the only shared surface |
| Hard-coded paths: root `package.json` (`workspaces`, `format` scripts), `.github/workflows/android-ai-build.yml` (`packages/app`), `scripts/prepare-ai-model.mjs` (`packages/app/.model-cache`), backend `tsconfig` (`../shared/dist`), `.gitignore` entries, `.vscode/tasks.json` (npm scripts), README doc references | Renaming or moving the JS packages touches CI, lockfile, scripts, Metro/Expo resolution. High risk, low benefit. |
| Size: `cad` 226 MB, `artifacts` 124 MB, `hardware` 40 MB (includes committed ESP32 build products `.elf`, `.map`, `.merged.bin`), `output` 3 MB, `docs` 52 KB, `packages` 38 MB | Legacy and binary material dominates the tree and buries the code. Moving it does not shrink git history. |
| The teammate is actively committing (latest commit 29 Sep) and owns the app, backend core and laser/ToF work | Large renames of their folders would create painful merge conflicts. Only move what they agree to. |
| Python tests live beside code in five hardware folders and run standalone | Each Python module can already be tested alone; keep that property |
| Not yet verified: the app's own test suite (not installed), Expo/Metro behaviour after any move | Do not touch `packages/app` in this restructure |

## 2. Principles (the "survive on its own" contract)

Every module must have:
1. **A README** stating purpose, its inputs and outputs (its interface), how to run it alone, and how to test it alone.
2. **Its own dependency manifest** (`package.json` or `pyproject.toml`) and **one command** that runs its tests from a clean checkout.
3. **No imports from a sibling module's internals.** Modules talk only through (a) the contract in `packages/shared`, or (b) a small, named interface documented in the README.
4. **A stand-in for every neighbour** so it runs alone: a fake backend, fake serial port, recorded images, or mock data.
5. **An owner** (CODEOWNERS) so changes to a module are reviewed by the person responsible.

Enforcement: a small check script (`scripts/check-modules`) that fails CI if a module lacks a README or test command, or imports across a forbidden boundary; and CI runs each module's tests in isolation (path-filtered matrix jobs).

## 3. Target layout

**Recommended ("moderate")**: keep what works, add clear homes for new work, fence off legacy.

```
SG-GoAssist/
  README.md                     module map: what each part is, how to run it alone / together
  packages/                     JS/TS workspaces (existing convention, unchanged)
    shared/                     THE contract (types now; JSON Schema generated from it)
    backend/                    cloud + controller API. Bay/bus/decision additions go in
                                  clearly named files (services/busOperations*, routes/...)
    app/                        passenger app. Untouched. Teammate-owned.
    operator-console/           NEW (CE2 UI). Own package: mock mode + live mode
  pi/                           NEW. Python for Raspberry Pi nodes
    tof-link/                   ESP32 serial protocol + BeamState (their code, moved unchanged)
    perception/                 camera + model runner + object safe/unsafe policy
    safety-gate/                pure decision logic (no hardware, no network)
    bus-agent/                  composes the three; talks to backend; simulated ramp;
                                  local status page
  firmware/                     ESP32 sketches in use (APAS ToF + lasers)
  scripts/                      dev/e2e tooling (name kept: npm scripts and CI reference it)
  docs/
    architecture/  decisions/  contracts/  runbooks/  handoff/
  archive/                      legacy and reference: cad, artifacts, output, esp32-mock-bus,
                                  esp32-physical-button, esp32-accessible-stop, old edge-observer
```

**Full rename (not recommended now)**: move `packages/*` to top-level `backend/`, `passenger-app/`, `contracts/`. It reads well but rewrites the lockfile keys, CI, scripts, Metro config and collides with the teammate's work. Revisit after the demo.

## 4. Module interfaces

| Module | Consumes | Produces | Runs alone with |
|---|---|---|---|
| `packages/shared` | nothing | TypeScript types, exported constants, generated JSON Schema | `npm run build`, schema test |
| `packages/backend` | contract; HTTP/WS from devices, app, console | REST + WebSocket per contract; audit log | its own node tests; simulator CLI acts as a bus |
| `packages/app` | backend HTTP/WS | passenger UI | unchanged (its own mocks) |
| `packages/operator-console` | backend REST + WS (contract) | operator UI: overview, stop, bus, audit log, case actions | mock mode (fixtures validated against contract types) |
| `pi/tof-link` | serial port | `BeamReading(state, distanceMm, observedAt, simulated)` | fake serial port (their existing tests) |
| `pi/perception` | camera frame, model file | `PerceptionResult(objects[className, safety, confidence, inZone], imageOk, degradedReason, observedAt)` | recorded images; no camera needed |
| `pi/safety-gate` | `PerceptionResult`, `BeamReading`, bus context (movement, accepted request) | `RampSafetyDecision` (same fields as the shared type) | pure unit tests |
| `pi/bus-agent` | the three above; backend client | HTTP posts to backend; simulated ramp state; local status page | `FakeBackend` + `--simulate` sensors |
| `ml/` (separate repo, not here) | labelled data | model file + manifest | Colab / local |

Contract enforcement across languages: generate JSON Schema from `packages/shared` and have the Python tests validate every message the agent can emit against it (and the console's mock fixtures validate against the TS types). This turns naming drift into a failing test. It adds one dev dependency (a schema generator) to the workspace; the alternative is hand-maintained schemas, which drift.

## 5. Ownership (proposed CODEOWNERS)

| Path | Owner |
|---|---|
| `packages/app`, `packages/shared` (existing types), `packages/backend` core, `firmware/`, `pi/tof-link` | teammate |
| `pi/perception`, `pi/safety-gate`, `pi/bus-agent`, `packages/operator-console`, backend bay/bus-status additions | CE2 |
| `docs/decisions`, root README | both |

Changes to `packages/shared` need both to approve because both sides depend on it.

## 6. Migration steps (each is one reviewable commit; history kept with `git mv`)

Every step must leave green: backend 94/94 tests, `npm run typecheck`, Python tests in every touched folder, no broken links in README and docs.

| Step | Change | Risk | Needs teammate OK |
|---|---|---|---|
| R0 | Add module READMEs and the `scripts/check-modules` check (report-only) without moving code | none | no |
| R1 | Reorganise `docs/` into `architecture/`, `decisions/`, `contracts/`, `runbooks/`, `handoff/`; fix references in README | low | no (docs only) |
| R2 | Create `pi/` and `packages/operator-console/` skeletons with READMEs, manifests and one passing test each | none (new code) | no |
| R3 | Move `hardware/apas-tabletop-demo` code into `pi/tof-link` (Python, unchanged) and the sketch into `firmware/apas-tof-lasers` | low (no imports, tests move with it) | **yes** |
| R4 | Move superseded hardware and bulky reference material (`cad`, `artifacts`, `output`, old ESP32 folders, old edge-observer) into `archive/`; update `.gitignore` and README references | low-medium (path-specific ignores, links) | **yes** |
| R5 | Add CODEOWNERS and CI matrix jobs per module | low | yes |
| R6 | Optional later: rename `packages/*` to top-level names | high | **yes**, after the demo |

R0 to R2 are safe to start immediately because they only add things. R3 and R4 move the teammate's material, so they wait for agreement.

## 7. What continues in parallel (no conflict with the restructure)

The shared-type additions and backend work in `docs/interfaces/message-additions.md` stay in `packages/shared` and `packages/backend`, whose paths do not change under the recommended layout. The Pi code is built directly in the new `pi/` modules, so it never has to be moved.

## 8. Risks and mitigations

| Risk | Mitigation |
|---|---|
| Merge conflicts with the teammate's active branch | Only add new folders (R0 to R2); move their files (R3, R4) in one agreed window, with them merging first |
| Lockfile changes from partial installs | Keep restoring `package-lock.json` after partial installs; add the schema-generator dependency in one deliberate commit |
| Broken links and paths after moves | Link check in `check-modules`; grep the repo for old paths before and after each move |
| Large binaries stay in git history | Moving files does not shrink history; dropping committed ESP32 build outputs or using Git LFS is a separate decision for the teammate |
| "Standalone" claim drifts over time | The isolation CI jobs and import-boundary check make it a tested property |

## 9. Decisions needed

1. Moderate layout (recommended) or full rename?
2. Is the teammate willing to have hardware and reference material moved (R3, R4), and when?
3. Python granularity: four modules (`tof-link`, `perception`, `safety-gate`, `bus-agent`) or merge `safety-gate` into `bus-agent`?
4. Generate JSON Schema from the TS types (adds a dev dependency) or maintain schemas by hand?
5. The teammate's `/operator` console has case actions (confirm, escalate, cancel, complete, retry) that the CE2 console does not yet replicate. Keep it reachable as a legacy page during the port, and port those actions before it is retired.
