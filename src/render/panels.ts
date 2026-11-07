// The two small panels beside the graph: Karp's table as it fills in, and the bound U
// closing in on the exit value D.
import { leq, parse, text, toNumber } from "../lib/rational";
import type { Frame } from "../lib/timeline";
import type { Bundle } from "../lib/types";
import { math } from "./caption";

const MAX_ROWS = 8; // show the newest rows of a big table

export function karpTable(frame: Frame, bundle: Bundle): HTMLElement | null {
  if (!frame.karp) return null;
  const { id, rows } = frame.karp;
  const states = bundle.sccs.comps[id];
  const all = [states.map(() => 0 as number | null), ...rows]; // row 0 is all zeros
  const first = Math.max(0, all.length - MAX_ROWS);

  const box = document.createElement("div");
  box.innerHTML = `<div class="panel-title">Karp's table, SCC ${id}</div>`;
  const table = document.createElement("table");
  table.className = "karp";
  const head = states.map((v) => `<th>${v}</th>`).join("");
  table.innerHTML = `<thead><tr><th>${math("k")}</th>${head}</tr></thead>`;
  const body = document.createElement("tbody");
  for (let k = first; k < all.length; k++) {
    const tr = document.createElement("tr");
    if (k === all.length - 1 && k > 0) tr.className = "new";
    const cells = all[k].map((x) => `<td>${x === null ? "−∞" : x}</td>`).join("");
    tr.innerHTML = `<th>${k}</th>${cells}`;
    body.append(tr);
  }
  table.append(body);
  box.append(table);
  if (first > 0) box.insertAdjacentHTML("beforeend", `<div class="small">rows 0–${first - 1} hidden</div>`);
  return box;
}

const SUB = "₀₁₂₃₄₅₆₇₈₉";
const subscript = (k: number) => [...String(k)].map((d) => SUB[Number(d)]).join("");

export function boundChart(frame: Frame): HTMLElement | null {
  if (!frame.bounds) return null;
  const { id, D, points } = frame.bounds;
  const W = 280;
  const H = 150;
  const left = 40;
  const right = 12;
  const top = 14;
  const bottom = 28;

  const d = toNumber(parse(D));
  const values = points.map((p) => toNumber(parse(p.bound)));
  let lo = Math.min(d, ...values);
  let hi = Math.max(d, ...values);
  if (hi - lo < 1e-9) {
    lo -= 1;
    hi += 1;
  }
  const pad = (hi - lo) * 0.12;
  const y = (v: number) => top + ((hi + pad - v) / (hi - lo + 2 * pad)) * (H - top - bottom);
  const step = (W - left - right) / Math.max(points.length, 3);
  const x = (i: number) => left + step * (i + 0.5);

  const dots = points
    .map((p, i) => {
      const passes = leq(parse(p.bound), parse(D));
      const name = p.rule === "max_edge" ? "max w" : `δ${subscript(p.k)}`;
      return (
        `<circle class="u-dot${passes ? " passes" : ""}" cx="${x(i)}" cy="${y(values[i])}" r="5">` +
        `<title>${name} = ${text(parse(p.bound))}${passes ? " ≤ D: skip" : " > D"}</title></circle>` +
        `<text x="${x(i)}" y="${H - 8}" text-anchor="middle">${name}</text>`
      );
    })
    .join("");
  const line = points.map((_, i) => `${i ? "L" : "M"} ${x(i)} ${y(values[i])}`).join(" ");

  const box = document.createElement("div");
  box.innerHTML =
    `<div class="panel-title">Bound U against D, SCC ${id}</div>` +
    `<svg class="bound-chart" viewBox="0 0 ${W} ${H}" width="100%" role="img" ` +
    `aria-label="Bounds ${points.map((p) => text(parse(p.bound))).join(", ")} against D = ${text(parse(D))}">` +
    `<line class="axis" x1="${left}" x2="${W - right}" y1="${H - bottom}" y2="${H - bottom}"/>` +
    `<line class="exit" x1="${left}" x2="${W - right}" y1="${y(d)}" y2="${y(d)}"/>` +
    `<text x="${left - 6}" y="${y(d) + 4}" text-anchor="end">D = ${text(parse(D))}</text>` +
    `<path class="u-line" d="${line}"/>` +
    dots +
    `</svg>`;
  return box;
}
