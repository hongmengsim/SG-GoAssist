// Layout helpers shared by the page modules.

import { esc } from "./html.js";

export const time = (iso) => {
  const parsed = new Date(iso);
  return Number.isNaN(parsed.getTime())
    ? "--:--:--"
    : parsed.toISOString().slice(11, 19);
};

export const kv = (rows) =>
  `<dl class="kv">${rows.map(([key, value]) => `<dt>${esc(key)}</dt><dd>${value}</dd>`).join("")}</dl>`;

export const section = (width, title, right, body) =>
  `<section class="${width}"><h2><span>${title}</span>${right ?? ""}</h2><div class="body">${body}</div></section>`;
