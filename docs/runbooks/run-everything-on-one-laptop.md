# Run everything on one laptop (simulated)

Everything below is simulated: no camera, ESP32, Raspberry Pi or physical ramp is involved. It is the software path a demo would take once the hardware is added.

## One command: the scripted scenario

```
npm install                      # from PowerShell on Windows (Git Bash's tar breaks the llama.rn download)
npm run build --workspace @buspass/backend
pip install -r pi/bus-agent/requirements.txt
npm run e2e:scenario
```

It starts the backend on a free port with a device secret and `GOASSIST_AUTO_ACK=off`, runs Bus 1 (`AV-095-01`) and Bus 2 (`AV-095-02`) as simulated agents, walks the sequence in `scripts/e2e_scenario.py` (bay queue, bus-only acknowledgement, unsafe object, mid-deployment halt, sensor dropout, retraction only when the ramp is clear, bay release and grant, audit order) and prints `PASS` or `FAIL` per step. Takes about a minute. The full `npm run verify` runs it too.

## By hand: backend, two buses, a passenger

1. Backend, with bus-only acknowledgement and signed devices:

   ```
   set GOASSIST_AUTO_ACK=off
   set DEVICE_SHARED_SECRET=demo-secret
   npm run dev --workspace @buspass/backend
   ```

   Leave `OPERATOR_API_TOKEN` unset for a local demo (the bus event subscription uses it when set).

2. One terminal per bus (same secret):

   ```
   set DEVICE_SHARED_SECRET=demo-secret
   python -m bus_agent --simulate --bus-id AV-095-01 --backend http://localhost:3000
   python -m bus_agent --simulate --bus-id AV-095-02 --backend http://localhost:3000
   ```

   Type `arrive 18331` in each. Bus 1 takes the bay; Bus 2 is refused and waits. Other commands: `place person`, `clear`, `block on|off`, `dropout on|off`, `cover on|off`, `halt on|off`, `depart`, `status`, `quit`.

3. A passenger request (or use the app): `POST /api/assistance/request` with `busId`, `busService`, `boardingStop`, `stopCode` `18331`, `assistanceTypes: ["WHEELCHAIR_RAMP"]`, `source: "MOBILE_APP"`, `boardingOrAlighting: "BOARDING"`. Nothing shows "acknowledged" until the bus acknowledges it.

4. Watch and steer as an operator:

   | Endpoint                                                                                     | Shows                                                                      |
   | -------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
   | `GET /api/operations/bays/18331`                                                             | occupant, queue, granted bus                                               |
   | `POST /api/operations/bays/18331/proceed`                                                    | grant the bay to the first waiting bus                                     |
   | `GET /api/operations/bus-status`, `/ramp-simulations`, `/safety-decisions`, `/help-required` | latest per bus                                                             |
   | `GET /api/operations/audit?limit=100&busId=AV-095-01`                                        | audit trail, newest first                                                  |
   | `POST /api/operations/cases/:caseId/operator` `{ "action": "COMPLETE" }`                     | finish the case; the ramp retracts only when the Pi says the zone is clear |

## What this does not show

- Real sensors: the beam and camera are simulated and labelled so in every report.
- A deployment timeout or a help-required alert (roadmap R1): the timeout value is not agreed and is not invented here.
- Nothing else is missing from the operator side: `npm run console` and `?mode=live` show the same data as the endpoints above, and covers case actions.

## Beyond one process

The same scenario can run across two backend processes sharing Postgres, Redis and locks (`npm run e2e:scenario:two`); setup and limits are in [`multi-process.md`](multi-process.md).
