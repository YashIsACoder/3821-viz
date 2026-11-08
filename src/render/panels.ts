// The two small panels under the graph: Karp's table as it fills in, and the bound U
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
  box.innerHTML =
    `<div class="panel-title">Karp's table · SCC ${id}</div>` +
    `<p class="small">${math("D_k(v)")}: the most reward a walk of ${math("k")} steps can collect on its way into state ${math("v")}.</p>`;
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
  const scroll = document.createElement("div");
  scroll.className = "table-scroll";
  scroll.append(table);
  box.append(scroll);
  if (first > 0) box.insertAdjacentHTML("beforeend", `<div class="small">rows 0–${first - 1} hidden</div>`);
  return box;
}

const SUB = "₀₁₂₃₄₅₆₇₈₉";
const subscript = (k: number) => [...String(k)].map((d) => SUB[Number(d)]).join("");

export function boundChart(frame: Frame): HTMLElement | null {
  if (!frame.bounds) return null;
  const { id, D, points } = frame.bounds;
  const W = 300;
  const H = 160;
  const left = 12;
  const right = 12;
  const top = 26;
  const bottom = 30;

  const d = toNumber(parse(D));
  const values = points.map((p) => toNumber(parse(p.bound)));
  let lo = Math.min(d, ...values);
  let hi = Math.max(d, ...values);
  if (hi - lo < 1e-9) {
    lo -= 1;
    hi += 1;
  }
  const pad = (hi - lo) * 0.15;
  const y = (v: number) => top + ((hi + pad - v) / (hi - lo + 2 * pad)) * (H - top - bottom);
  const step = (W - left - right) / Math.max(points.length, 4);
  const x = (i: number) => left + step * (i + 0.5);

  const dots = points
    .map((p, i) => {
      const passes = leq(parse(p.bound), parse(D));
      const name = p.rule === "max_edge" ? "max w" : `δ${subscript(p.k)}`;
      const value = text(parse(p.bound));
      return (
        `<circle class="u-dot${passes ? " passes" : ""}" cx="${x(i)}" cy="${y(values[i])}" r="6">` +
        `<title>${name} = ${value}${passes ? " ≤ D: skip" : " > D: keep going"}</title></circle>` +
        `<text x="${x(i)}" y="${y(values[i]) - 11}" text-anchor="middle">${value}</text>` +
        `<text x="${x(i)}" y="${H - 9}" text-anchor="middle">${name}</text>`
      );
    })
    .join("");
  const line = points.map((_, i) => `${i ? "L" : "M"} ${x(i)} ${y(values[i])}`).join(" ");

  const box = document.createElement("div");
  box.innerHTML =
    `<div class="panel-title">Bound vs exit value · SCC ${id}</div>` +
    `<p class="small">Each test gives an upper bound ${math("U")} on the best cycle here. ` +
    `Once a dot drops to the gold line (${math("U \\le D")}), the SCC can be skipped.</p>` +
    `<svg class="bound-chart" viewBox="0 0 ${W} ${H}" width="100%" role="img" ` +
    `aria-label="Bounds ${points.map((p) => text(parse(p.bound))).join(", ")} against D = ${text(parse(D))}">` +
    `<line class="axis" x1="${left}" x2="${W - right}" y1="${H - bottom}" y2="${H - bottom}"/>` +
    `<line class="exit" x1="${left}" x2="${W - right}" y1="${y(d)}" y2="${y(d)}"/>` +
    `<text class="exit-label" x="${W - right}" y="${y(d) - 6}" text-anchor="end">D = ${text(parse(D))}</text>` +
    `<path class="u-line" d="${line}"/>` +
    dots +
    `</svg>`;
  return box;
}
