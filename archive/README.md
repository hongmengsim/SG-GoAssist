# archive

Earlier designs and reference material. **Nothing here is part of the current build, and nothing here is maintained.** Statements in these folders may describe superseded designs (for example a physical servo ramp, which the 29 Sep handoff replaces with a simulated ramp). Do not copy claims from here into current documents without checking them.

| Folder | What it holds |
|---|---|
| `legacy-hardware/` | Earlier firmware and tools: `esp32-mock-bus` (servo ramp and VL53L5CX), `esp32-accessible-stop`, `esp32-physical-button`, `edge-observer` (camera observer and an ML1 training pipeline), and `INTEGRATED_PROTOTYPE.md`. The `edge-observer` Python tests still pass (6) but are not run as part of any module check. |
| `cad/` | CAD scripts, print packages and reports for the physical model bus. |
| `project-artifacts/` | Report and slide drafts, circuit diagrams, and ESP32 build outputs. (Named to avoid confusion with the `artifacts/e2e` folder the end-to-end scripts create at the repo root at run time.) |
| `output/` | Generated PDF and draft output. |

Moving these here does not shrink the git history; the large binaries remain in earlier commits.
