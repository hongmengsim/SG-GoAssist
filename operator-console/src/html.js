// Small HTML helpers. Everything user-visible goes through esc().

export function esc(value) {
  return String(value ?? "").replace(
    /[&<>"']/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        char
      ],
  );
}

// Each status kind has its own shape mark AND its own border style, so it can be told apart
// without seeing colour: a solid dot, a hollow dot, a triangle, a square, a diamond, a dashed
// diamond for simulated. The word is always shown next to it.
export const MARKS = {
  ok: { glyph: "●", border: "solid", meaning: "normal" },
  idle: { glyph: "○", border: "dotted", meaning: "idle or none" },
  warn: { glyph: "▲", border: "double", meaning: "attention" },
  stop: { glyph: "■", border: "solid", meaning: "halted or fault" },
  info: { glyph: "◆", border: "solid", meaning: "in progress" },
  sim: { glyph: "◇", border: "dashed", meaning: "simulated" },
};

export function tag(kind, text) {
  const mark = MARKS[kind];
  if (!mark) throw new Error(`Unknown tag kind: ${kind}`);
  return `<span class="tag ${kind}"><span aria-hidden="true">${mark.glyph}</span> ${esc(text)}</span>`;
}

export function simulatedTag(text = "Simulated") {
  return tag("sim", text);
}
