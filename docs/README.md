# Documentation map

Read in this order when you are new to the project.

| Folder                           | What it holds                                                                                                                                                 | Start with                                                                                                                                                                 |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`handoff/`](handoff/)           | The owner-confirmed project context. **Where a document elsewhere conflicts with this, the handoff wins for scope and architecture.**                         | [`2026-09-29-project-context.md`](handoff/2026-09-29-project-context.md)                                                                                                   |
| [`decisions/`](decisions/)       | Numbered decision records: what was decided, by whom, why, and what is still open                                                                             | [`0002`](decisions/0002-architecture-ruling.md), then [`0001`](decisions/0001-full-rename-and-modular-layout.md); line endings in [`0003`](decisions/0003-line-endings.md) |
| [`architecture/`](architecture/) | How the system works: MVP architecture, the integrated prototype and its safety policy, requirements traceability, feature readiness, the on-device assistant | [`mvp.md`](architecture/mvp.md)                                                                                                                                            |
| [`interfaces/`](interfaces/)     | Message and endpoint definitions between the parts, and proposed additions                                                                                    | [`message-additions.md`](interfaces/message-additions.md)                                                                                                                  |

What is still missing and in what order: [`roadmap.md`](roadmap.md).

The message contract itself is code: [`contracts/src/index.ts`](../contracts/src/index.ts).

Runbooks (how to run and demo each part) will live in `docs/runbooks/` once the module READMEs exist. Each module documents how to run and test itself in its own README.
