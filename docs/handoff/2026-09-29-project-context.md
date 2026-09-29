# SG GoAssist project context and agreed integration plan

**Team:** SmaRHt Buses, National University of Singapore  
**Competition:** Singapore BusTech Grand Challenge 2026, IHL Student Category  
**Context version:** 29 September 2026, Singapore time  
**Purpose:** Handoff for colleagues and their AI agents before updating the proposal, software or integration design.

## 1. How to use this context

The project owner has confirmed that the plan recorded below is correct, but may be incomplete or lack implementation detail. Treat it as the agreed direction, not as a complete technical specification or proof that all features are implemented.

- Preserve every agreed scope boundary and workflow when making changes.
- The latest decisions here supersede conflicting assumptions in older reports and action plans.
- Do not invent missing implementation details or describe proposed functions as completed.
- Inspect the actual repository and hardware before claiming that a feature works. This handoff is not an implementation audit.
- Flag objectively unsound ideas, conflicts between subsystems, unsupported claims and substantial integration risks. Explain the problem and suggest alternatives; distinguish errors from reasonable trade-offs.
- Ask targeted questions or label an assumption explicitly when a missing detail materially changes the implementation.
- Do not silently restore older features or requirements that have been removed or whose continued inclusion is unresolved.

## 2. Project purpose and revised objectives

SG GoAssist demonstrates how passenger requests, onboard sensing and an automated central controller work together to provide boarding assistance for autonomous, unmanned buses.

The proposal now focuses on three objectives:

| Objective   | Agreed focus                                                                                                                                    |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Recognition | Interpret explicit passenger requests and use camera ML and ToF distance information to assess relevant environmental conditions and obstacles. |
| Response    | Acknowledge requests, issue appropriate assistance commands, apply decision rules and handle exceptions.                                        |
| Integration | Connect the passenger app, cloud, automated central controller and two simulated buses into a coordinated workflow.                             |

The project does not construct or physically actuate a ramp. It assumes that a real bus would already have a ramp and its actuation equipment. The prototype represents ramp commands and movement states on the UI.

Explicit passenger requests remain authoritative for assistance intent. A camera observation alone does not prove that a person wants to board a particular bus, and camera ML must not be described as diagnosing disabilities. The continued scope of older assistance-cue and boarding-state ML modules still needs confirmation.

## 3. Overall system arrangement

The prototype uses two Raspberry Pis, representing two autonomous buses, and a host computer running the central controller.

| Component                               | Agreed responsibility                                                                                                                                              |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Passenger app                           | Submit boarding assistance requests and display request submission and bus confirmation. Retain existing app functions subject to the boarding-only clarification. |
| Cloud                                   | Receive passenger requests and updates, make them available to the central controller, and relay confirmations or relevant exceptions to the app.                  |
| Central controller on the host computer | Automatically process requests, coordinate buses, issue commands, monitor operational states and expose an interface for exceptional human intervention.           |
| Raspberry Pi #1 / Bus 1                 | Connect to the side-door camera and ToF sensor, assess obstacles locally and provide continue/halt permission for simulated ramp deployment.                       |
| Raspberry Pi #2 / Bus 2                 | Represent a second bus and demonstrate waiting for an occupied boarding bay. Equivalent obstacle-sensing inputs are simulated.                                     |
| Controller dashboard                    | Display bus, request, ramp simulation and fault information; provide live camera access and remote intervention when needed.                                       |

Normal request path: **App → cloud → automated central controller → assigned bus.**

Confirmation path: **Bus → central controller → cloud → app.**

These paths describe logical responsibilities. The communication protocols, cloud product, message schema and deployment details have not been frozen in this discussion.

## 4. Passenger app and assistance requests

### 4.1 Boarding only

The app handles boarding assistance. It does not select or manage an alighting stop as part of this assistance workflow.

A passenger identifies:

- The bus service they want to board.
- The boarding bus stop.
- The requested assistance, such as ramp deployment or extra boarding time.

The app sends the request and subsequent relevant updates through the cloud. The central controller processes the request and forwards an appropriate command packet to the assigned bus.

The existing app's other functions are retained in principle, but were not exhaustively enumerated or revalidated in this discussion. Consult the current app and obtain clarification where necessary. Do not interpret “retain existing functions” as authorisation to reintroduce alighting-stop selection.

### 4.2 Passenger-facing statuses

Keep routine passenger status information simple:

| Status            | Meaning                                                                                                                |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Request submitted | The cloud has successfully received the request. This does not mean that a bus has accepted it.                        |
| Confirmed by bus  | The assigned bus has acknowledged and accepted the assistance request. This does not mean that deployment is complete. |

Confirmation must originate from the bus and return through the controller and cloud. The app must not claim bus confirmation merely because it sent a request or because the cloud received it.

Routine “assistance ready” and “assistance delayed” updates are not required in the agreed app flow. Detailed operational information stays on the controller dashboard.

If an accepted request is subsequently cancelled or cannot be fulfilled, the app should receive an exception update so passengers do not rely on an invalid confirmation.

Physical visibility of assistance is not sufficient for every passenger. Necessary boarding guidance should remain available through bus audio or other accessible feedback; the exact prototype implementation of that guidance remains unspecified.

## 5. Automated central controller

### 5.1 Normal operation

The central controller is primarily an automated system, not a human dispatcher manually approving every action. It runs on a host computer at a depot or another suitable control location.

It automatically:

- Reads relevant requests and updates from the cloud.
- Processes assistance requests and sends command packets to the appropriate bus.
- Communicates with the Raspberry Pis representing the buses.
- Monitors bus movement, pending requests, sensor information and simulated ramp states.
- Coordinates access to the boarding bay.
- Handles routine decisions and flags faults or unusually long deployment times.
- Returns bus confirmations and relevant updates to the cloud.

### 5.2 Exceptional manual intervention

A remote operator can intervene if necessary, for example after a timeout, fault or unresolved situation. The controller interface allows the operator to inspect status and access a live camera view.

The system can reject or cancel a request and halt a deployment action. A request from the app is a request to act, not unconditional authority to deploy.

Host or operator permission to proceed remains subject to valid local safety conditions. It must not override an obstruction or unavailable required sensor information. This preserves the distinction between remote coordination and local movement permission.

Cancelling during deployment must not automatically mean immediate retraction. Recovery depends on the current state and relevant conditions. The precise recovery sequence remains to be specified.

### 5.3 Assignment and scaling

For the prototype, assume that one central controller manages both buses.

Future division between depots, operating groups or control centres is a scaling consideration, not a settled design. An earlier suggestion was assignment according to nearby stops or depots, but geographical proximity alone was not adopted as the final rule. The future ownership and allocation scheme remains open.

The mapping from a passenger's selected bus service to a particular bus instance also remains to be specified.

## 6. Raspberry Pi #1 and side-door sensing

Pi #1 represents Bus 1. Its side-door sensing consists of:

- A camera providing images for ML obstacle detection.
- A laser Time-of-Flight sensor providing supporting distance information.

Both are to connect to Pi #1. Whether the ToF connects directly or through an ESP32 bridge is not yet settled.

The Pi combines camera detections with distance information to assess the monitored ramp area. It reports whether the simulated deployment may continue or must halt. It provides sensing and decision logic; in a future full installation, the existing bus equipment would perform physical movement.

The central controller's assistance command does not bypass the local obstacle check. An obstruction or required sensor fault can block the simulated action. Missing, invalid or stale required safety information must not be treated as proof of a clear area.

One ToF sensor reading must not be represented as whole-area protection. The actual sensor, mounting, coverage and fusion logic need to be reconciled before stronger claims are made.

### Camera access and retention

The central controller can access a live camera view for monitoring or intervention. Camera footage is not recorded or retained.

This updates the older design description that allowed only locally processed metadata and no remote camera access. Do not copy that older restriction into the revised report as though it still describes the agreed architecture.

Access controls and the technical streaming method have not been specified.

## 7. Raspberry Pi #2 and two-bus coordination

Pi #2 represents Bus 2. It does not serve as the second camera-processing Pi for Bus 1 under this revised plan.

The team does not have equivalent additional ToF/laser sensing hardware for Bus 2. Its primary role is to demonstrate coordination while Bus 1 occupies the boarding space. Its equivalent obstacle-clearance inputs must be explicitly labelled simulated.

For this demonstration, assume **one usable boarding bay**. This is a scenario assumption, not a claim that every real bus stop has one bay.

### Agreed sequence

1. Bus 1 occupies the boarding bay.
2. Bus 2 arrives and reports that it is waiting for the bay.
3. Bus 2 retains any acknowledged assistance request but cannot deploy its simulated ramp while waiting.
4. Bus 1 leaves and releases the bay.
5. Bus 2 enters the bay and confirms that it is stopped at the boarding position.
6. Bus 2 can then proceed with its simulated assistance sequence, subject to the required conditions.

**Bus 1 leaving does not itself trigger Bus 2's ramp deployment.** Bus 2 must first reach the boarding position and satisfy the relevant conditions.

The controller must receive or be able to access status information such as “at stop,” “waiting for the bus ahead,” and “travelling to the next stop.” Bus movement is represented within the demonstration; a physical autonomous driving platform has not been committed to in this plan.

## 8. Ramp simulation, timeouts and help requests

There is no ramp construction, physical deployment or physical retraction in the project deliverables. Existing real-bus ramps are the future integration target. Commands and progression are shown on the prototype UI.

The UI can represent states including stowed, deployment requested, deploying, deployed and halted. Any completion shown by this prototype is simulated completion, not physical position verification.

If simulated deployment takes suspiciously long, the bus reports **help required** to the central controller, including its current state and reason. A remote operator can intervene when necessary.

The timeout value has not been selected. Do not invent a numerical threshold or claim that a real actuator has been monitored or tested. A deployment timeout can be demonstrated as a simulated fault.

## 9. Controller dashboard and operational state

Keep categories separate so concurrent facts can be represented accurately:

| Category           | Example states or information                                                |
| ------------------ | ---------------------------------------------------------------------------- |
| Bus movement       | Travelling to stop; waiting for bay; positioned at stop; departing.          |
| Assistance request | Received; accepted; pending; completed; cancelled.                           |
| Ramp simulation    | Stowed; deployment requested; deploying; deployed; halted.                   |
| Sensors and faults | Obstruction detected; sensor unavailable; deployment timeout; help required. |

For example, Bus 2 can be **waiting for the bay with an accepted ramp request**. Request confirmation must not be confused with deployment, and bus movement must not be collapsed into assistance status.

These categories and examples express the agreed information needs. They are not yet an exhaustive enum list or a frozen state-transition specification.

## 10. Deliverables and evidence boundaries

The revised deliverable focus is:

- Passenger boarding-request submission and bus-originated confirmation.
- App/cloud/controller/bus communication and coordination.
- Pi #1 camera ML and ToF obstacle assessment.
- UI representation of assistance commands, ramp states and faults.
- Pi #2 simulation of a second bus waiting for and entering an occupied boarding bay.
- An automated controller with operational visibility, live camera access and exceptional remote intervention.

These are agreed design directions, not a statement that every item is already implemented or integrated.

The following are **not commitments for this submission**:

- Building or physically actuating a ramp.
- Physical ramp deployment/retraction verification, actuator integration or ramp-cycle tests.
- Real-world field testing.
- Participant studies or collection of passenger feedback.
- Collection of measured performance results or a measured manual-assistance baseline comparison.

Do not convert simulated statuses into claims of verified physical safety, measured recognition accuracy, real-world reliability or demonstrated passenger satisfaction.

## 11. Expected benefits and future evaluation

The owner wants the proposal to translate the deliverables into **how they could lead to measurable improvements**, rather than promising measurements that the team will not perform.

Use an **Expected Benefits and Future Evaluation** section instead of unfinished measured-results sections. Distinguish intended benefits and possible future metrics from achieved results.

| Deliverable                    | Expected route to improvement                                                    | Possible future metric, not a current result                              |
| ------------------------------ | -------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| Passenger request interface    | Communicates boarding assistance needs directly to the system.                   | Request success rate; acknowledgement time.                               |
| Bus confirmation               | Gives the passenger confirmation that the assigned bus has accepted the request. | Confirmation delivery rate; confirmation latency.                         |
| Camera and ToF obstacle checks | Supply information for blocking deployment when an obstruction is detected.      | Missed-obstruction rate; false-blocking rate.                             |
| Integrated assistance workflow | Coordinates requests, bus state and assistance decisions.                        | Task completion rate; unnecessary waiting; manual intervention frequency. |
| Passenger information          | Reduces uncertainty about whether a request has been accepted.                   | Passenger satisfaction in a future study.                                 |

An assistance-cue detector could be assessed using precision and recall if that older module is retained; its continued scope is not yet confirmed.

### Proposed ML improvement feedback loop

More training data does not automatically guarantee better accuracy. A proposed improvement process is:

1. Review missed detections and false alarms.
2. Collect relevant, varied examples of those failure situations.
3. Label and review the examples correctly.
4. Retrain the model.
5. Evaluate it on separate data before deploying the update.

Describe this as a future improvement process unless implementation evidence shows otherwise. Because operational camera footage is not retained, do not imply that this loop automatically stores live passenger video. How future training examples would be collected remains unspecified and must respect the agreed retention boundary.

The competition brief asks for measurable improvements. Explaining the path to those improvements is the team's chosen proposal approach; it is not equivalent to having measured the benefits, and does not by itself prove fulfilment of that criterion.

## 12. Report revision instructions already agreed

The final report will be rewritten after the content discussion is complete. It should read as a conventional engineering project design proposal with clear numbered headings, coherent explanations, useful diagrams/tables and appropriate references, rather than a repetitive readiness audit.

Use the requested **Design Report** artifact template. Its template package is `openai-templates:artifact-template-design-report`; the referenced version was `0.1.1`. If unavailable in another agent's environment, identify that limitation rather than claiming to have used it.

Specific edits agreed so far:

- Remove from the abstract: “CAD records document a discrete motion-clearance study. These are separate forms of progress and do not yet establish a completed physical system.”
- Remove the paragraph promising physical integration, measured ramp actuation/coverage/model/user-experience results and unfinished results/feedback sections.
- Remove “Provide a verified mechanical response” and its model-ramp deployment/boarding hold/confirmed retraction evidence requirement.
- Remove “Measure accessibility outcomes” and its manual-baseline/consented-feedback commitment.
- Replace those objectives with recognition, response and integration as described here.
- Remove ramp construction, actuation and physical verification commitments throughout objectives, deliverables, integration tasks, schedule and conclusion.
- Replace pending measured-results commitments with expected benefits and possible future evaluation.
- Retain accurate distinctions between proposed functions, software, CAD, simulation and physical evidence without repeating unnecessary disclaimers throughout the prose.
- Treat any surviving ramp/CAD illustration as context for possible integration with existing bus equipment, not a committed ramp-build deliverable.

For plain language, “interlocks” means checks that block an action unless required conditions are met. “Audit logging” means timestamped records of events and decisions. A logged command is not proof of physical movement. Event logging is distinct from recording camera footage; the exact current logging implementation still requires repository verification.

## 13. Open details and conflicts to resolve

The following items are intentionally unresolved. Do not silently select an answer:

1. **Actual ToF sensor and wiring.** Earlier discussion considered SEN0378/VL53L3CX. The current report draft describes an ESP32-S3 bench setup identified as VL53L0X, while other integrated firmware reportedly expects VL53L5CX 8 × 8 sensing. Confirm the real hardware and align code, mounting and coverage. Earlier conditional ESP32-WROOM wiring advice is not a confirmed wiring plan for ESP32-S3.
2. **ToF-to-Pi path.** Direct connection versus an ESP32 bridge is not finalised.
3. **Service-to-bus assignment.** Define how a request for a service and stop reaches a particular bus instance.
4. **Timeouts.** Deployment and other timeout values are not selected.
5. **State and message contracts.** Define packets, identifiers, status transitions, cancellation and recovery semantics; the categories above are conceptual.
6. **Bay occupancy signalling.** Specify how occupancy, departure/release and Bus 2 positioning are represented and communicated in the simulation.
7. **Network and controller failure behaviour.** Required safety information cannot be assumed clear when missing or stale; full communication/recovery behaviour remains to be designed.
8. **Original stop-button unit.** Its inclusion and placement in the revised plan remain unconfirmed.
9. **Other ML modules.** The older assistance-cue detector and adaptive boarding/dwell classifier must not automatically be treated as retained. Side-door obstacle detection is the clearly agreed current ML role.
10. **Accessible bus feedback.** Necessary audio or other accessible guidance was recognised, but its exact prototype implementation remains unspecified.
11. **Future fleet management.** Division of responsibility among depots or controllers is open; one controller handles both prototype buses for now.
12. **Cloud, streaming and access.** Infrastructure, protocols and permissions are not frozen. Remote viewing must preserve the no-recording/no-retention decision.
13. **Implementation readiness.** Verify the repository before claiming what already works; this document captures agreed context, not completed work.

## 14. Background documents and precedence

The discussion referred to:

- `NUS - SmaRHt Buses - Project Report Draft.pdf` — older draft being revised.
- `SG GoAssist Action Plan.pdf` — earlier architecture, roles and deliverables; contains superseded assumptions.
- `SGBTGC 2026 - Info Pack for IHL (incl Problem Statement) Final.pdf` — competition background and requirements.
- `Singapore BusTech Grand Challenge 2026 - EOI.pdf` — initial concept, not current scope.
- Original action-plan link: https://claude.ai/code/artifact/c25bc304-f516-4150-9cfc-55a932f15301

The draft also cites an 18 August competition update and repository evidence that were not supplied with this handoff. Obtain them before claiming verification of their contents or current submission requirements.

For **project scope and architecture**, use the latest owner-confirmed decisions in this handoff over conflicting older planning documents. For **competition rules**, use the actual latest organiser requirements; project decisions do not alter those rules. Later explicit owner decisions may update this handoff.

## 15. Short instruction for a receiving AI agent

Read this entire handoff before revising the proposal or implementation. Preserve the boarding-only app flow, bus-originated acceptance confirmation, automated central controller with exceptional manual intervention, Pi #1 local camera/ToF assessment, Pi #2 second-bus simulation, single-bay coordination, UI-only ramp simulation and no camera recording. Do not reintroduce physical ramp actuation or measured-results commitments. Explain intended benefits without claiming unperformed tests. Check the actual code and hardware, flag conflicts, and keep unresolved details explicitly unresolved until the team decides them.
