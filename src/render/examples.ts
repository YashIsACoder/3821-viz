// "Why it matters": small real-world problems that are deterministic MDPs (or, for chips, the
// same best-loop question). Tap one to see it as a graph, with its best loop lit up and walked.
// The best loop is computed here from the drawing, not written in by hand.

const SVG = "http://www.w3.org/2000/svg";
const R = 24;

interface Example {
  id: string;
  title: string;
  states: [string, number, number][]; // name, x, y
  moves: ([number, number, number] | [number, number, number, string])[]; // from, to, reward, and a name if it helps
  map: [string, string][]; // MDP part -> what it is here
  unit: string;
  best: string; // what the best loop means here
}

export const EXAMPLES: Example[] = [
  {
    id: "robot",
    title: "A robot on patrol",
    states: [
      ["Dock", 60, 60],
      ["Hall", 220, 60],
      ["Lab", 380, 60],
      ["Yard", 300, 190],
    ],
    moves: [
      [0, 1, 0],
      [1, 0, 1],
      [1, 2, 2],
      [2, 1, 2],
      [2, 3, 1],
      [3, 1, 4],
      [3, 0, 3],
    ],
    map: [
      ["state", "a room"],
      ["action", "a corridor"],
      ["reward", "jobs done on the way"],
    ],
    unit: "jobs per move",
    best: "the patrol route to repeat forever",
  },
  {
    id: "machine",
    title: "Keeping a machine running",
    states: [
      ["New", 60, 70],
      ["Worn", 320, 70],
      ["Old", 190, 210],
    ],
    moves: [
      [0, 1, 5, "run"],
      [1, 2, 3, "run"],
      [2, 2, 1, "run"],
      [1, 0, -1, "repair"],
      [2, 0, -3, "repair"],
    ],
    map: [
      ["state", "how worn it is"],
      ["action", "run it, or repair it"],
      ["reward", "output, minus repair cost"],
    ],
    unit: "per day",
    best: "when to repair: as soon as it's worn",
  },
  {
    id: "game",
    title: "A farming route in a game",
    states: [
      ["Town", 60, 130],
      ["Forest", 200, 50],
      ["Mine", 360, 50],
      ["Cave", 360, 200],
      ["River", 200, 200],
    ],
    moves: [
      [0, 1, 1],
      [0, 4, 2],
      [1, 2, 3],
      [2, 3, 6],
      [3, 4, 0],
      [3, 2, 2],
      [4, 0, 1],
      [4, 1, 2],
    ],
    map: [
      ["state", "a place on the map"],
      ["action", "a path"],
      ["reward", "gold picked up"],
    ],
    unit: "gold per move",
    best: "the farming loop players look for",
  },
  {
    id: "chip",
    title: "How fast a chip can tick",
    states: [
      ["R1", 70, 70],
      ["R2", 250, 70],
      ["R3", 250, 200],
      ["R4", 410, 135],
    ],
    moves: [
      [0, 1, 3],
      [1, 2, 5],
      [2, 0, 4],
      [1, 3, 2],
      [3, 2, 1],
      [2, 2, 2],
    ],
    map: [
      ["state", "a register"],
      ["action", "a logic path"],
      ["reward", "its delay, in ns"],
    ],
    unit: "ns per stage",
    best: "the same question with delays: the slowest loop sets the shortest safe clock tick",
  },
];

// The simple cycle with the largest mean. These graphs are tiny, so try every one.
export function bestLoop(ex: Example): { moves: number[]; mean: number } {
  const out = ex.states.map((_, s) => ex.moves.map((m, i) => [m, i] as const).filter(([m]) => m[0] === s));
  let best = { moves: [] as number[], mean: -Infinity };
  const walk = (start: number, at: number, path: number[], seen: Set<number>) => {
    for (const [[, to, ], i] of out[at]) {
      if (to === start) {
        const loop = [...path, i];
        const mean = loop.reduce((t, k) => t + ex.moves[k][2], 0) / loop.length;
        if (mean > best.mean + 1e-9) best = { moves: loop, mean };
      } else if (to > start && !seen.has(to)) {
        seen.add(to);
        walk(start, to, [...path, i], seen);
        seen.delete(to);
      }
    }
  };
  ex.states.forEach((_, s) => walk(s, s, [], new Set([s])));
  return best;
}

const node = <K extends keyof SVGElementTagNameMap>(name: K, attrs: Record<string, string | number> = {}) => {
  const n = document.createElementNS(SVG, name);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, String(v));
  return n;
};

// An arrow from u to v that stops at the circles, bowed if the reverse arrow exists too, or a
// small loop above the state if u = v. Also returns where its reward label goes.
function arrow(ex: Example, i: number): { d: string; at: [number, number] } {
  const [u, v] = ex.moves[i];
  const [, x1, y1] = ex.states[u];
  const [, x2, y2] = ex.states[v];
  if (u === v) {
    // Loop outwards, away from the middle of the drawing, so it never crosses other arrows.
    const mx = ex.states.reduce((t, st) => t + st[1], 0) / ex.states.length;
    const my = ex.states.reduce((t, st) => t + st[2], 0) / ex.states.length;
    const l = Math.hypot(x1 - mx, y1 - my) || 1;
    const [dx, dy] = l > 1 ? [(x1 - mx) / l, (y1 - my) / l] : [0, -1];
    const [px, py] = [-dy, dx];
    const pt = (a: number, b: number) => `${(x1 + dx * a + px * b).toFixed(1)} ${(y1 + dy * a + py * b).toFixed(1)}`;
    return { d: `M${pt(R - 4, -12)} C${pt(R + 44, -32)} ${pt(R + 44, 32)} ${pt(R - 1, 13)}`, at: [x1 + dx * (R + 40), y1 + dy * (R + 40)] };
  }
  const len = Math.hypot(x2 - x1, y2 - y1);
  const ux = (x2 - x1) / len;
  const uy = (y2 - y1) / len;
  const both = ex.moves.some(([a, b]) => a === v && b === u);
  const bend = both ? 18 : 0;
  const nx = -uy * bend;
  const ny = ux * bend;
  const sx = x1 + ux * R + nx * 0.5;
  const sy = y1 + uy * R + ny * 0.5;
  const ex2 = x2 - ux * (R + 4) + nx * 0.5;
  const ey2 = y2 - uy * (R + 4) + ny * 0.5;
  const cx = (x1 + x2) / 2 + nx;
  const cy = (y1 + y2) / 2 + ny;
  // A pair of arrows bows apart, and each label sits on its own side so the two never overlap.
  const off = both ? 1.4 : 0;
  return { d: `M${sx} ${sy} Q${cx} ${cy} ${ex2} ${ey2}`, at: [(x1 + x2) / 2 + nx * off, (y1 + y2) / 2 + ny * off] };
}

const fmt = (x: number) => (Number.isInteger(x) ? String(x) : x.toFixed(2).replace(/0$/, ""));

export function examples(root: HTMLElement) {
  root.innerHTML =
    `<div class="ex-tabs" role="tablist" aria-label="Examples">` +
    EXAMPLES.map(
      (ex, i) =>
        `<button type="button" role="tab" class="ex-tab" data-i="${i}" aria-selected="false">` +
        `<svg viewBox="0 0 48 48" aria-hidden="true">${ICONS[ex.id]}</svg><b>${ex.title}</b><span>Tap to see the graph</span></button>`,
    ).join("") +
    `</div><div class="ex-panel" role="tabpanel" aria-live="polite"></div>`;
  const panel = root.querySelector<HTMLElement>(".ex-panel")!;
  const tabs = [...root.querySelectorAll<HTMLButtonElement>(".ex-tab")];
  let timer: number | null = null;
  const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const show = (i: number) => {
    const ex = EXAMPLES[i];
    tabs.forEach((t, k) => {
      t.setAttribute("aria-selected", String(k === i));
      t.querySelector("span")!.textContent = k === i ? "Showing below ↓" : "Tap to see the graph";
    });
    const loop = bestLoop(ex);
    const names = [...loop.moves.map((k) => ex.states[ex.moves[k][0]][0]), ex.states[ex.moves[loop.moves[0]][0]][0]];

    panel.innerHTML = `
      <svg class="ex-graph" viewBox="-10 -20 480 300" role="img" aria-label="${ex.title} as a graph"></svg>
      <div class="ex-side">
        <ul class="ex-map">${ex.map.map(([k, v]) => `<li><span class="ex-k">${k}</span>${v}</li>`).join("")}</ul>
        <div class="ex-best">
          <span class="ex-k">best loop</span>
          <b>${names.join(" → ")}</b>
          <span class="ex-mean">${fmt(loop.mean)} <small>${ex.unit}</small></span>
          <span class="ex-why">${ex.best}</span>
        </div>
      </div>`;
    const svg = panel.querySelector<SVGSVGElement>("svg")!;
    const defs = node("defs");
    for (const [id, cls] of [["ex-head", "head"], ["ex-head-on", "head on"]]) {
      const m = node("marker", { id, viewBox: "0 0 10 10", refX: 8, refY: 5, markerWidth: 7, markerHeight: 7, orient: "auto-start-reverse" });
      m.append(node("path", { d: "M0 0 L10 5 L0 10 z", class: cls }));
      defs.append(m);
    }
    svg.append(defs);

    const paths = ex.moves.map((m, k) => {
      const on = loop.moves.includes(k);
      const { d, at } = arrow(ex, k);
      const p = node("path", { d, class: `ex-edge${on ? " on" : ""}`, "marker-end": `url(#${on ? "ex-head-on" : "ex-head"})` });
      svg.append(p);
      const g = node("g", { class: `ex-reward${on ? " on" : ""}` });
      const label = `${m[3] ? `${m[3]} ` : ""}${m[2] > 0 && ex.id !== "chip" ? "+" : ""}${m[2]}`.replace("-", "−");
      const w = 14 + label.length * 6.6;
      g.append(node("rect", { x: at[0] - w / 2, y: at[1] - 10, width: w, height: 20, rx: 10 }));
      const t = node("text", { x: at[0], y: at[1] + 4.5, "text-anchor": "middle" });
      t.textContent = label;
      g.append(t);
      svg.append(g);
      return p;
    });
    for (const [name, x, y] of ex.states) {
      const g = node("g", { class: "ex-state" });
      g.append(node("circle", { cx: x, cy: y, r: R }));
      const t = node("text", { x, y: y + 4.5, "text-anchor": "middle" });
      t.textContent = name;
      g.append(t);
      svg.append(g);
    }

    // Fit the view to the drawing, so small graphs aren't lost in empty space.
    const box = svg.getBBox();
    svg.setAttribute("viewBox", `${box.x - 8} ${box.y - 8} ${box.width + 16} ${box.height + 16}`);

    // Walk the best loop with a token, forever.
    if (timer !== null) cancelAnimationFrame(timer);
    if (still) return;
    const token = node("circle", { r: 7, class: "ex-token" });
    svg.append(token);
    const legs = loop.moves.map((k) => paths[k]);
    let leg = 0;
    let start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / 750);
      const p = legs[leg].getPointAtLength(t * legs[leg].getTotalLength());
      token.setAttribute("cx", String(p.x));
      token.setAttribute("cy", String(p.y));
      if (t === 1) {
        leg = (leg + 1) % legs.length;
        start = now;
      }
      timer = requestAnimationFrame(tick);
    };
    timer = requestAnimationFrame(tick);
  };

  tabs.forEach((t, i) => t.addEventListener("click", () => show(i)));
  show(0);
}

const ICONS: Record<string, string> = {
  robot: '<rect x="12" y="14" width="24" height="20" rx="5"/><circle cx="19" cy="24" r="2.5"/><circle cx="29" cy="24" r="2.5"/><path d="M24 14V8M18 40h12M16 34v6M32 34v6"/>',
  machine: '<circle cx="24" cy="24" r="7"/><path d="M24 6v6M24 36v6M6 24h6M36 24h6M11 11l4 4M33 33l4 4M37 11l-4 4M15 33l-4 4"/>',
  game: '<rect x="6" y="14" width="36" height="22" rx="10"/><path d="M15 21v8M11 25h8"/><circle cx="31" cy="23" r="2"/><circle cx="35" cy="28" r="2"/>',
  chip: '<rect x="12" y="12" width="24" height="24" rx="3"/><path d="M18 6v6M24 6v6M30 6v6M18 36v6M24 36v6M30 36v6M6 18h6M6 24h6M6 30h6M36 18h6M36 24h6M36 30h6"/>',
};
