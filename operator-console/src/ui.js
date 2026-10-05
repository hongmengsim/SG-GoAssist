// Layout helpers shared by the page modules.

import { esc } from "./html.js";

// Times are shown in the viewer's own zone, like the clock in the header, so a decision time and the
// clock beside it can be compared. (They used to be UTC, eight hours off in Singapore.) A test can
// pin the zone.
let zone;
export function useTimeZone(timeZone) {
  zone = timeZone;
}

export const time = (iso) => {
  const parsed = new Date(iso);
  return Number.isNaN(parsed.getTime())
    ? "--:--:--"
    : parsed.toLocaleTimeString("en-GB", { hour12: false, timeZone: zone });
};

export const kv = (rows) =>
  `<dl class="kv">${rows.map(([key, value]) => `<dt>${esc(key)}</dt><dd>${value}</dd>`).join("")}</dl>`;

export const section = (width, title, right, body) =>
  `<section class="${width}"><h2><span>${title}</span>${right ?? ""}</h2><div class="body">${body}</div></section>`;
