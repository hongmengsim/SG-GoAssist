# SG GoAssist feature readiness

This matrix distinguishes tested software, competition fixtures, and functions
that still require physical hardware or a production transport provider. The
app must preserve these labels in passenger-facing responses.

| Passenger capability                                | Current evidence                                                                  | Readiness                               |
| --------------------------------------------------- | --------------------------------------------------------------------------------- | --------------------------------------- |
| Nearby stop ranking and 200 m context               | Backend and app automated tests                                                   | Automated                               |
| Stop amenities for 18301, 18331 and 16181           | Manually reviewed competition fixture, labelled “Prototype verified data”         | Verified fixture                        |
| Unknown regional stop amenities                     | Explicit `UNKNOWN` values and unavailable provenance                              | Automated                               |
| Bus arrivals in the competition route               | Deterministic demonstration provider                                              | Verified fixture                        |
| Parked versus approaching bus                       | Fresh stop-matched safety telemetry and automated tests                           | Automated                               |
| Ramp request confirmation                           | Assistance controller and golden journey test                                     | Automated                               |
| Ramp safety interlocks and harmless-debris handling | Backend safety tests plus mock-bus telemetry                                      | Automated; physical validation required |
| Central-door ramp depiction                         | Code-native operational diagram tests                                             | Automated                               |
| Direct and one-transfer journey planning            | Regional route index integration tests                                            | Automated                               |
| Shelter coverage                                    | Only reviewed route pairs are labelled verified                                   | Verified fixture                        |
| Service advisories                                  | Replaceable provider boundary; competition notice fixture                         | Verified fixture                        |
| Offline map and stop selection                      | Schematic fallback, accessible stop list and browser smoke                        | Automated                               |
| Favourites, five recent journeys and cached context | Versioned device-local persistence tests                                          | Automated                               |
| Deterministic multilingual assistant                | Rule, grounding, confirmation and adversarial tests                               | Automated                               |
| On-device Qwen assistant                            | Host-side runtime tests                                                           | Physical ARM64 device required          |
| Speech input                                        | Browser smoke plus native adapter tests                                           | Physical-device verification required   |
| Live LTA arrivals and production advisories         | Provider boundaries are ready; credentials and service agreement are not included | Future production integration           |
| Real autonomous vehicle, door and ramp actuation    | Simulation never commands a road vehicle                                          | Future certified integration            |

## Release gate

Do not describe the assistant as fully verified until the connected ARM64 Qwen
smoke passes. Do not describe fixture arrivals, amenities, shelter, or
advisories as live data. Safety controllers remain the only authority for door,
ramp, dwell and mock autonomous-vehicle actions.
