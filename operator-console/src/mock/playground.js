// The mock-mode playground: create events yourself and watch the console react. Nothing here
// is part of the product; it exists so the console can be shown and tried with no backend.

import { esc, simulatedTag } from "../html.js";
import { PASSENGER_SEES, word } from "../labels.js";
import { stopStatus } from "../viewmodel.js";
import { MOCK_BUSES } from "./world.js";

const OPEN = new Set(["SENDING", "ACKNOWLEDGED"]);
const OBJECTS = [
  ["person", "Person"],
  ["box", "Box"],
  ["leaf", "Leaf"],
  ["plastic_bag", "Plastic bag"],
];

const button = (label, data, disabled = false) =>
  `<button ${Object.entries(data)
    .map(([key, value]) => `data-${key}="${esc(value)}"`)
    .join(" ")}${disabled ? " disabled" : ""}>${esc(label)}</button>`;

function requestsHtml(world) {
  const open = Object.values(world.state.requests).filter((request) =>
    OPEN.has(request.status),
  );
  if (!open.length) return '<p class="note">No open requests.</p>';
  return open
    .map(
      (
        request,
      ) => `<div class="pgi"><b>${esc(request.requestId)}</b> · ${esc(request.busId)}<br><small>${esc(word(PASSENGER_SEES, request.status))}</small>
        <div class="row">${request.status === "SENDING" ? button("Bus accepts", { pg: "accept", req: request.requestId }) + button("Bus rejects", { pg: "reject", req: request.requestId }) : ""}
        ${button("Passenger cancels", { pg: "cancel", req: request.requestId })}</div></div>`,
    )
    .join("");
}

function busesHtml(world) {
  return MOCK_BUSES.map((id) => {
    const movement = world.state.buses[id].status.movement;
    const ramp = world.state.buses[id].ramp?.state ?? "STOWED";
    const accepted = world.actionsFor(id).cancel.enabled;
    return `<div class="pgi"><b>${esc(id)}</b> · ${esc(stopStatus(world.state, id).text)}
      <div class="row">${button("Arrive at stop", { pg: "arrive", bus: id }, movement !== "TRAVELLING_TO_STOP")}
      ${button("Depart", { pg: "depart", bus: id }, movement !== "POSITIONED_AT_STOP" || ramp !== "STOWED")}
      ${button("Back on route", { pg: "route", bus: id }, movement !== "DEPARTING")}</div>
      <div class="row">${button("Boarding complete", { pg: "board", bus: id }, !accepted || movement !== "POSITIONED_AT_STOP")}
      ${button("Stow ramp", { pg: "stow", bus: id }, ramp === "STOWED")}</div></div>`;
  }).join("");
}

export function playgroundHtml(world) {
  const options = world.options;
  const [bus1, bus2] = MOCK_BUSES;
  return `<h2><span>Playground ${simulatedTag("Simulation only")}</span><button id="drawerClose" aria-label="Close playground">Close</button></h2>
    <p class="note">Create events yourself and watch the console react. Nothing here is part of the product.</p>
    <fieldset class="pg"><legend>1 · Passenger request</legend>
      <div class="row"><label>Send to <select id="pgBus">${MOCK_BUSES.map((id) => `<option>${esc(id)}</option>`).join("")}</select></label>
      <label>Help <select id="pgHelp"><option value="WHEELCHAIR_RAMP">Ramp</option><option value="EXTRA_BOARDING_TIME">Extra boarding time</option></select></label></div>
      <div class="row">${button("Submit request", { pg: "submit" })}</div>
      ${requestsHtml(world)}
      <label><input type="checkbox" id="oAccept"${options.autoAccept ? " checked" : ""}> Bus accepts new requests automatically</label>
    </fieldset>
    <fieldset class="pg"><legend>2 · Bus movement</legend>${busesHtml(world)}
      <label><input type="checkbox" id="oProceed"${options.autoProceed ? " checked" : ""}> Controller sends the next waiting bus in when the bay frees</label></fieldset>
    <fieldset class="pg"><legend>3 · ${esc(bus1)} ramp zone</legend><div class="row">${OBJECTS.map(([value, label]) => button(label, { pg: "object", object: value })).join("")}${button("Clear zone", { pg: "object", object: "" })}</div></fieldset>
    <fieldset class="pg"><legend>4 · Faults</legend>
      <div class="row"><label><input type="checkbox" data-fault="tof"> ${esc(bus1)} ToF dropout</label></div>
      <div class="row"><label><input type="checkbox" data-fault="cam"> ${esc(bus1)} camera covered</label></div>
      <div class="row"><label><input type="checkbox" data-fault="stall"> ${esc(bus1)} deployment stalls</label></div>
      <div class="row"><label for="stallTimeout">Stall timeout (s)</label> <input id="stallTimeout" type="number" min="1" max="60" value="${options.stallTimeoutSeconds}"></div>
      <p class="note">The timeout is a placeholder so a fault can be shown. The real value has not been decided. ${esc(bus2)} has simulated sensors and no faults to set here.</p></fieldset>
    <div class="row"><button id="btnReset" class="danger">Reset everything</button></div>`;
}

/** Applies one click from the playground. Returns true if something was handled. */
export function handlePlayground(world, dataset) {
  switch (dataset.pg) {
    case "submit":
      return (
        world.submitRequest({ busId: dataset.bus, help: dataset.help }),
        true
      );
    case "accept":
      return (world.busAccept(dataset.req), true);
    case "reject":
      return (world.busReject(dataset.req), true);
    case "cancel":
      return (world.passengerCancel(dataset.req), true);
    case "arrive":
      return (world.arrive(dataset.bus), true);
    case "depart":
      return (world.depart(dataset.bus), true);
    case "route":
      return (world.backOnRoute(dataset.bus), true);
    case "board":
      return (world.boardingComplete(dataset.bus), true);
    case "stow":
      return (world.stowRamp(dataset.bus), true);
    case "object":
      return (world.placeObject(MOCK_BUSES[0], dataset.object || null), true);
    default:
      return false;
  }
}
