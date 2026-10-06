# Documentation map

Start with the [comprehensive project guide](PROJECT_GUIDE.md) for scope, architecture, setup and evidence boundaries.

Read in this order when you are new to the project.

| Folder                           | What it holds                                                                                                                                                                             | Start with                                                                                                                                                                              |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`handoff/`](handoff/)           | The owner-confirmed project context. **Where a document elsewhere conflicts with this, the handoff wins for scope and architecture.**                                                     | [`2026-09-29-project-context.md`](handoff/2026-09-29-project-context.md)                                                                                                                |
| [`decisions/`](decisions/)       | Numbered decision records: what was decided, by whom, why, and what is still open                                                                                                         | [`0002`](decisions/0002-architecture-ruling.md), then [`0001`](decisions/0001-full-rename-and-modular-layout.md); scale in [`0004`](decisions/0004-design-for-scale-build-in-stages.md) |
| [`architecture/`](architecture/) | How the system works: MVP architecture, the integrated prototype and its safety policy, requirements traceability, feature readiness, the on-device assistant, and the scalability design | [`mvp.md`](architecture/mvp.md); [`scalability.md`](architecture/scalability.md) is written to be lifted into the report                                                                |
| [`interfaces/`](interfaces/)     | Message and endpoint definitions between the parts, and proposed additions                                                                                                                | [`message-additions.md`](interfaces/message-additions.md)                                                                                                                               |

What is still missing and in what order: [`roadmap.md`](roadmap.md).

The message contract itself is code: [`contracts/src/index.ts`](../contracts/src/index.ts).

Current status and checklist: [status.md](status.md). Each module documents how to run and test itself in its own README. Reviews and their fixes: [reviews/2026-10-01-reviews.md](reviews/2026-10-01-reviews.md). Walkthrough for the backend owner: [review-guide-for-teammate.md](review-guide-for-teammate.md).

Runbooks (`docs/runbooks/`):

- [Run everything on one laptop](runbooks/run-everything-on-one-laptop.md): the backend, the console and simulated buses, no hardware.
- [Hardware bring-up](runbooks/hardware-bring-up.md): ESP32, camera, model and the real Pi, stage by stage, with a fallback at each stage. Nothing in it has been run on hardware yet.
- [Multi-process](runbooks/multi-process.md): Postgres, Redis and shared locks; how to run and check more than one backend process.

Decisions worth knowing: [0004](decisions/0004-design-for-scale-build-in-stages.md) (design for scale, build in stages) and [0005](decisions/0005-scale-ready-storage-and-processes.md) (async storage, shared event bus, shared locks, Postgres, the lock-free hot path, and what has and has not been shown across processes).
