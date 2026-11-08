// The opening example: a four-state DMDP you can play. A token walks your policy, the running
// average settles on the mean of the loop it ends up in, and tapping a state with two moves
// switches which one it takes. The greedy start (take the bigger reward now) is not the best loop.

const SVG = "http://www.w3.org/2000/svg";

interface Move {
  to: number;
  reward: number;
  d: string; // the arrow's path
  at: [number, number]; // where its reward sits
}

const STATES: { name: string; x: number; y: number }[] = [
  { name: "A", x: 70, y: 62 },
  { name: "B", x: 70, y: 178 },
  { name: "C", x: 250, y: 62 },
  { name: "D", x: 250, y: 178 },
];

const MOVES: Move[][] = [
  [
    { to: 1, reward: 1, d: "M58 84 C42 110 42 130 58 156", at: [34, 120] },
    { to: 2, reward: 0, d: "M94 62 L226 62", at: [160, 48] },
  ],
  [{ to: 0, reward: 3, d: "M82 156 C98 130 98 110 82 84", at: [106, 120] }],
  [{ to: 3, reward: 5, d: "M262 84 C278 110 278 130 262 156", at: [286, 120] }],
  [
    { to: 2, reward: 1, d: "M238 156 C222 130 222 110 238 84", at: [214, 120] },
    { to: 0, reward: 0, d: "M230 164 L92 76", at: [160, 119] },
  ],
];

const BEST = 3; // the loop C → D → C

const node = <K extends keyof SVGElementTagNameMap>(name: K, attrs: Record<string, string | number> = {}) => {
  const n = document.createElementNS(SVG, name);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, String(v));
  return n;
};

export function playground(root: HTMLElement) {
  const policy = [0, 0, 0, 0]; // greedy: A takes +1 to B
  const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  root.innerHTML = `
    <div class="pg-top">
      <span class="pg-badge">▶ Play</span>
      <span class="pg-goal">Find the moves with the best long-run average. Can you beat <b>2</b>?</span>
    </div>
    <div class="pg-stage">
      <svg class="pg" viewBox="14 2 292 208" role="img" aria-label="A small decision process: four states, with arrows for moves and their rewards"></svg>
      <div class="pg-side">
        <div class="pg-label">average reward per move</div>
        <div class="pg-avg" aria-live="polite">–</div>
        <svg class="pg-spark" viewBox="0 0 200 70" preserveAspectRatio="none" aria-hidden="true"></svg>
        <div class="pg-verdict"></div>
      </div>
    </div>
    <p class="pg-hint">The gold rings can switch moves: tap <b>A</b> or <b>D</b>.</p>`;
  const svg = root.querySelector<SVGSVGElement>("svg.pg")!;
  const spark = root.querySelector<SVGSVGElement>(".pg-spark")!;
  const avgOut = root.querySelector<HTMLElement>(".pg-avg")!;
  const verdict = root.querySelector<HTMLElement>(".pg-verdict")!;

  const defs = node("defs");
  for (const [id, cls] of [["pg-head", "head"], ["pg-head-on", "head on"]]) {
    const m = node("marker", { id, viewBox: "0 0 10 10", refX: 8, refY: 5, markerWidth: 7, markerHeight: 7, orient: "auto-start-reverse" });
    m.append(node("path", { d: "M0 0 L10 5 L0 10 z", class: cls }));
    defs.append(m);
  }
  svg.append(defs);

  const arrows: SVGPathElement[][] = [];
  const pills: SVGGElement[][] = [];
  MOVES.forEach((moves, s) => {
    arrows[s] = [];
    pills[s] = [];
    moves.forEach((m) => {
      const path = node("path", { d: m.d, class: "pg-edge" });
      svg.append(path);
      arrows[s].push(path);
      const g = node("g", { class: "pg-reward" });
      const label = `${m.reward > 0 ? "+" : ""}${m.reward}`;
      g.append(node("rect", { x: m.at[0] - 13, y: m.at[1] - 10, width: 26, height: 20, rx: 10 }));
      const t = node("text", { x: m.at[0], y: m.at[1] + 4.5, "text-anchor": "middle" });
      t.textContent = label;
      g.append(t);
      svg.append(g);
      pills[s].push(g);
    });
  });
  const circles = STATES.map((st, s) => {
    const g = node("g", { class: `pg-state${MOVES[s].length > 1 ? " choice" : ""}`, tabindex: MOVES[s].length > 1 ? 0 : -1 });
    g.append(node("circle", { cx: st.x, cy: st.y, r: 22 }));
    const t = node("text", { x: st.x, y: st.y + 6, "text-anchor": "middle" });
    t.textContent = st.name;
    g.append(t);
    svg.append(g);
    return g;
  });
  const token = node("circle", { r: 7, class: "pg-token", cx: STATES[0].x, cy: STATES[0].y });
  svg.append(token);

  // Until the first tap, a pulsing ring and a "tap me" bubble say that A can be changed.
  const callout = node("g", { class: "pg-callout", "aria-hidden": "true" });
  callout.append(node("circle", { cx: STATES[0].x, cy: STATES[0].y, r: 22, class: "pulse" }));
  callout.append(node("rect", { x: STATES[0].x - 30, y: STATES[0].y - 58, width: 60, height: 22, rx: 11 }));
  callout.append(node("path", { d: `M${STATES[0].x - 5} ${STATES[0].y - 37} L${STATES[0].x} ${STATES[0].y - 30} L${STATES[0].x + 5} ${STATES[0].y - 37}z` }));
  const bubble = node("text", { x: STATES[0].x, y: STATES[0].y - 43, "text-anchor": "middle" });
  bubble.textContent = "tap me";
  callout.append(bubble);
  svg.append(callout);

  let at = 0;
  let steps = 0;
  let total = 0;
  let history: number[] = [];
  let timer: number | null = null;

  const loopMean = () => {
    // Follow the policy from A until a state repeats; the gain is that loop's mean.
    const seen = new Map<number, number>();
    const rewards: number[] = [];
    let s = 0;
    while (!seen.has(s)) {
      seen.set(s, rewards.length);
      const m = MOVES[s][policy[s]];
      rewards.push(m.reward);
      s = m.to;
    }
    const loop = rewards.slice(seen.get(s));
    return loop.reduce((a, b) => a + b, 0) / loop.length;
  };

  const drawPolicy = () => {
    arrows.forEach((list, s) =>
      list.forEach((p, i) => {
        const on = policy[s] === i;
        p.classList.toggle("on", on);
        p.setAttribute("marker-end", `url(#${on ? "pg-head-on" : "pg-head"})`);
        pills[s][i].classList.toggle("on", on);
      }),
    );
  };

  const drawSpark = () => {
    const target = loopMean();
    const lo = 0;
    const hi = 4;
    const y = (v: number) => 64 - ((v - lo) / (hi - lo)) * 58;
    const pts = history.map((v, i) => `${(i / Math.max(1, 39)) * 200},${y(v)}`).join(" ");
    spark.innerHTML =
      `<line class="target" x1="0" x2="200" y1="${y(target)}" y2="${y(target)}"/>` + (pts ? `<polyline points="${pts}"/>` : "");
  };

  const settle = () => {
    const mean = loopMean();
    root.classList.toggle("won", mean === BEST);
    verdict.innerHTML =
      mean === BEST
        ? `<span class="good">You found it: C → D → C, ${BEST} per move.</span> Skipping the +1 at A paid off.`
        : `Stuck at ${+mean.toFixed(2)}. Tap <b>A</b> to try its other move.`;
  };

  const restart = () => {
    at = 0;
    steps = 0;
    total = 0;
    history = [];
    token.setAttribute("cx", String(STATES[0].x));
    token.setAttribute("cy", String(STATES[0].y));
    avgOut.textContent = "–";
    verdict.textContent = "";
    root.classList.remove("won");
    drawPolicy();
    drawSpark();
    if (still) {
      avgOut.textContent = String(+loopMean().toFixed(2));
      settle();
    }
  };

  const step = () => {
    const move = MOVES[at][policy[at]];
    const path = arrows[at][policy[at]];
    const length = path.getTotalLength();
    const start = performance.now();
    const glide = (now: number) => {
      const t = Math.min(1, (now - start) / 520);
      const p = path.getPointAtLength(t * length);
      token.setAttribute("cx", String(p.x));
      token.setAttribute("cy", String(p.y));
      if (t < 1) requestAnimationFrame(glide);
    };
    requestAnimationFrame(glide);
    pills[at][policy[at]].classList.remove("flash");
    void pills[at][policy[at]].getBoundingClientRect();
    pills[at][policy[at]].classList.add("flash");
    at = move.to;
    steps += 1;
    total += move.reward;
    history.push(total / steps);
    if (history.length > 40) history.shift();
    avgOut.textContent = (total / steps).toFixed(2);
    drawSpark();
    if (steps === 12) settle();
  };

  const toggle = (s: number) => {
    if (MOVES[s].length < 2) return;
    callout.remove();
    policy[s] = (policy[s] + 1) % MOVES[s].length;
    restart();
  };
  circles.forEach((c, s) => {
    c.addEventListener("click", () => toggle(s));
    c.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        toggle(s);
      }
    });
  });

  restart();
  if (still) return;
  // Only run while it's on screen.
  new IntersectionObserver(([entry]) => {
    if (entry.isIntersecting && timer === null) timer = window.setInterval(step, 700);
    if (!entry.isIntersecting && timer !== null) {
      window.clearInterval(timer);
      timer = null;
    }
  }).observe(root);
}
