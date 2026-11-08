// Draws a bundle's graph as SVG and updates it frame by frame.
//
// What the marks mean (render/legend.ts says the same to the reader):
//   state fill      its gain, on the gold ramp; brighter = more reward per step
//   SCC ring        waiting (faint), working (bright, glowing), solved, skipped (green hatch), no cycle (dotted)
//   bright arrows   the optimal action in each state (or Howard's current policy)
//   gold dashes     where the exit value D comes from: the best SCC you can step into
//
// The picture never moves; a frame only changes classes and fills (CSS animates them) and labels.
import { GainScale } from "../lib/gainScale";
import { layout, type Layout, type Point } from "../lib/layout";
import { parse, tex } from "../lib/rational";
import type { Frame } from "../lib/timeline";
import type { Bundle } from "../lib/types";
import { math } from "./caption";

const SVG = "http://www.w3.org/2000/svg";
const STATE_R = 17;
const HULL_PAD = 26;
const MAX_WEIGHT_LABELS = 48; // past this many edges the numbers become noise; hover still shows them
const MIN_SCALE = 0.85; // smaller than this and the numbers can't be read on a phone

function el<K extends keyof SVGElementTagNameMap>(name: K, attrs: Record<string, string | number> = {}) {
  const node = document.createElementNS(SVG, name);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, String(value));
  return node;
}

const sub = (a: Point, b: Point): Point => ({ x: a.x - b.x, y: a.y - b.y });
const add = (a: Point, b: Point): Point => ({ x: a.x + b.x, y: a.y + b.y });
const scale = (a: Point, s: number): Point => ({ x: a.x * s, y: a.y * s });
const unit = (a: Point): Point => {
  const len = Math.hypot(a.x, a.y) || 1;
  return { x: a.x / len, y: a.y / len };
};
const pairKey = (u: number, v: number) => (u < v ? `${u}-${v}` : `${v}-${u}`);
const fmt = (p: Point) => `${p.x.toFixed(1)} ${p.y.toFixed(1)}`;

let nextId = 0;

// One resize listener for every graph on the page; a root's entry is replaced when it gets a new view.
const fitters = new Map<HTMLElement, () => void>();
window.addEventListener("resize", () => fitters.forEach((fit) => fit()));

export class GraphView {
  readonly layout: Layout;
  readonly gains: GainScale;
  private hulls: SVGCircleElement[] = [];
  private edges: SVGPathElement[] = [];
  private weights: SVGGElement[] = [];
  private states: SVGGElement[] = [];
  private gainLabels: HTMLElement[] = [];
  private tagLabels: HTMLElement[] = [];
  private markers: Record<"plain" | "policy" | "exit", string>;
  private scale = 1;

  // `root` becomes a viewport onto the drawing. `maxHeight` is the most screen height the drawing
  // may take. The graph flows left to right or top to bottom, whichever shows it bigger. If even
  // that would be too small to read (a long chain on a phone), it stays readable and the viewport
  // pans sideways instead, following the SCC being worked on.
  constructor(
    private root: HTMLElement,
    private bundle: Bundle,
    maxHeight: () => number = () => window.innerHeight * 0.6,
  ) {
    const { graph, sccs } = bundle;
    const room = () => root.clientWidth || root.parentElement?.clientWidth || 360;
    const wide = layout(graph, sccs, false);
    const tall = layout(graph, sccs, true);
    const fitScale = (l: Layout) => Math.min(room() / l.width, maxHeight() / l.height);
    const best = fitScale(tall) > fitScale(wide) * 1.15 ? tall : wide;
    this.layout = fitScale(best) >= MIN_SCALE ? best : wide;
    const first = Object.values(bundle.methods)[0];
    this.gains = new GainScale(first ? first.result.gain : []);
    const { width, height, pos, clusters } = this.layout;

    root.classList.add("graph-view");
    const canvas = document.createElement("div");
    canvas.className = "graph";
    canvas.style.aspectRatio = `${width} / ${height}`;
    root.replaceChildren(canvas);

    const svg = el("svg", { viewBox: `0 0 ${width} ${height}`, role: "img" });
    svg.setAttribute("aria-label", `${graph.n} states and ${graph.edges.length} actions in ${sccs.comps.length} SCCs`);
    const id = ++nextId;
    this.markers = { plain: `arrow-${id}`, policy: `arrow-policy-${id}`, exit: `arrow-exit-${id}` };
    const defs = el("defs");
    const arrows: [string, string][] = [
      [this.markers.plain, "var(--edge)"],
      [this.markers.policy, "var(--ink)"],
      [this.markers.exit, "var(--gold)"],
    ];
    for (const [name, colour] of arrows) {
      const marker = el("marker", { id: name, viewBox: "0 0 10 10", refX: 8.5, refY: 5, markerWidth: 6, markerHeight: 6, orient: "auto-start-reverse" });
      marker.append(el("path", { d: "M 0 0.5 L 10 5 L 0 9.5 z", fill: colour }));
      defs.append(marker);
    }
    // Hatching for skipped SCCs: the work we didn't have to do.
    const hatch = el("pattern", { id: `hatch-${id}`, width: 8, height: 8, patternUnits: "userSpaceOnUse", patternTransform: "rotate(45)" });
    hatch.append(el("rect", { width: 8, height: 8, fill: "var(--good-bg)" }), el("line", { x1: 0, y1: 0, x2: 0, y2: 8, stroke: "var(--good)", "stroke-width": 2, opacity: 0.45 }));
    defs.append(hatch);
    canvas.style.setProperty("--hatch", `url(#hatch-${id})`);
    svg.append(defs);

    const hullLayer = el("g");
    const edgeLayer = el("g");
    const weightLayer = el("g");
    const stateLayer = el("g");
    svg.append(hullLayer, edgeLayer, weightLayer, stateLayer);

    for (const c of clusters) {
      const hull = el("circle", { cx: c.center.x, cy: c.center.y, r: c.radius + HULL_PAD, class: "hull waiting" });
      hullLayer.append(hull);
      this.hulls.push(hull);
    }

    this.drawEdges(edgeLayer, weightLayer, graph.edges.length <= MAX_WEIGHT_LABELS);

    pos.forEach((p, v) => {
      const g = el("g", { class: "state", transform: `translate(${fmt(p)})` });
      const circle = el("circle", { r: STATE_R });
      const label = el("text");
      label.textContent = String(v);
      const title = el("title");
      g.append(circle, label, title);
      stateLayer.append(g);
      this.states.push(g);
    });

    // HTML labels on top of the SVG, so the maths is typeset by KaTeX.
    const labels = document.createElement("div");
    labels.className = "labels";
    for (const c of clusters) {
      // Under the ring, and under any self-loop that hangs below it.
      let below = c.center.y + c.radius + HULL_PAD;
      for (const v of sccs.comps[c.id]) {
        if (!graph.edges.some((e) => e.from === v && e.to === v)) continue;
        const out = c.radius > 0 ? unit(sub(pos[v], c.center)) : { x: 0, y: -1 };
        below = Math.max(below, pos[v].y + out.y * 62 + 12);
      }
      this.gainLabels.push(this.label(labels, { x: c.center.x, y: below + 16 }, "label gain"));
      this.tagLabels.push(this.label(labels, { x: c.center.x, y: below + 40 }, "label tag"));
    }
    canvas.append(svg, labels);

    // As big as fits, never blown up past its natural size, and never shrunk past readable
    // (then it pans). Labels stay in proportion.
    const fit = () => {
      let s = Math.min(1.1, room() / width, maxHeight() / height);
      if (s < MIN_SCALE) s = Math.min(MIN_SCALE, maxHeight() / height);
      this.scale = s;
      canvas.style.width = `${width * s}px`;
      root.classList.toggle("pans", width * s > room() + 1);
      labels.style.fontSize = `${Math.max(11, Math.min(17, 15 * s))}px`;
    };
    fitters.set(root, fit);
    if (root.parentElement) new ResizeObserver(fit).observe(root.parentElement);
    fit();
  }

  private label(parent: HTMLElement, at: Point, className: string): HTMLElement {
    const span = document.createElement("span");
    span.className = className;
    span.style.left = `${(100 * at.x) / this.layout.width}%`;
    span.style.top = `${(100 * at.y) / this.layout.height}%`;
    span.style.opacity = "0";
    parent.append(span);
    return span;
  }

  private drawEdges(edgeLayer: SVGGElement, weightLayer: SVGGElement, showWeights: boolean) {
    const { graph, sccs } = this.bundle;
    const { pos, clusters } = this.layout;

    // Edges between the same two states (either direction) fan out so none overlap.
    const pairs = new Map<string, number[]>();
    for (const e of graph.edges) {
      const key = pairKey(e.from, e.to);
      pairs.set(key, [...(pairs.get(key) ?? []), e.id]);
    }

    for (const e of graph.edges) {
      const group = pairs.get(pairKey(e.from, e.to))!;
      const index = group.indexOf(e.id);
      let d: string;
      let labelAt: Point;

      if (e.from === e.to) {
        // A loop pointing away from the middle of its SCC (straight up for a lone state).
        const c = clusters[sccs.comp_of[e.from]];
        const p = pos[e.from];
        const out = c.radius > 0 ? unit(sub(p, c.center)) : { x: 0, y: -1 };
        const side = { x: -out.y, y: out.x };
        const reach = 44 + 16 * index;
        const spread = 0.6;
        const a = add(p, scale(add(scale(out, Math.cos(spread)), scale(side, Math.sin(spread))), STATE_R));
        const b = add(p, scale(add(scale(out, Math.cos(spread)), scale(side, -Math.sin(spread))), STATE_R + 2));
        const c1 = add(p, add(scale(out, reach), scale(side, reach * 0.62)));
        const c2 = add(p, add(scale(out, reach), scale(side, -reach * 0.62)));
        d = `M ${fmt(a)} C ${fmt(c1)} ${fmt(c2)} ${fmt(b)}`;
        labelAt = add(p, scale(out, reach * 0.75 + 4));
      } else {
        const p = pos[e.from];
        const q = pos[e.to];
        // Measure the bend against the lower-numbered state, so the two directions of a
        // 2-cycle bend to opposite sides. A lone edge still bends a little, which keeps
        // straight edges from running through the states between them.
        const [lo, hi] = e.from < e.to ? [p, q] : [q, p];
        const normal = unit({ x: lo.y - hi.y, y: hi.x - lo.x });
        const offset = group.length === 1 ? 10 : (index - (group.length - 1) / 2) * 34;
        const control = add(scale(add(p, q), 0.5), scale(normal, offset));
        const start = add(p, scale(unit(sub(control, p)), STATE_R + 1));
        const end = add(q, scale(unit(sub(control, q)), STATE_R + 3));
        d = `M ${fmt(start)} Q ${fmt(control)} ${fmt(end)}`;
        labelAt = add(scale(add(start, end), 0.25), scale(control, 0.5)); // the curve's midpoint
      }

      const path = el("path", { d, class: "edge", "marker-end": `url(#${this.markers.plain})` });
      path.append(Object.assign(el("title"), { textContent: `action ${e.id}: ${e.from} → ${e.to}, reward ${e.weight}` }));
      edgeLayer.append(path);
      this.edges.push(path);

      // The reward as a small pill, so it stays readable where edges cross.
      const pill = el("g", { class: "weight", transform: `translate(${fmt(labelAt)})` });
      if (showWeights) {
        const text = String(e.weight);
        const w = 9 + 7.4 * text.length;
        pill.append(el("rect", { x: -w / 2, y: -10, width: w, height: 20, rx: 10 }));
        pill.append(Object.assign(el("text"), { textContent: text }));
      }
      weightLayer.append(pill);
      this.weights.push(pill);
    }
  }

  show(frame: Frame): void {
    const { sccs, graph } = this.bundle;

    // Camera: when the drawing is wider than the screen, glide to the SCC being worked on.
    if (frame.active !== null && this.root.classList.contains("pans")) {
      const c = this.layout.clusters[frame.active];
      const left = c.center.x * this.scale - this.root.clientWidth / 2;
      const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      this.root.scrollTo({ left, behavior: reduced ? "auto" : "smooth" });
    }

    frame.sccs.forEach((state, c) => {
      const working = frame.active === c && state.status === "working";
      this.hulls[c].setAttribute("class", `hull ${state.status}${frame.active === c ? " active" : ""}`);

      // "SCC 3", and its gain once known, so captions that say "SCC 3" can be found on the picture.
      const gains = [...new Set(sccs.comps[c].map((v) => frame.gains[v]).filter((g): g is string => g !== null))];
      const gainLabel = this.gainLabels[c];
      const value = gains.length ? ` ${math(`g^* = ${gains.map((g) => tex(parse(g))).join(",\\ ")}`)}` : "";
      const html = `<span class="scc-name">SCC ${c}</span>${value}`;
      if (gainLabel.dataset.html !== html) {
        gainLabel.innerHTML = html;
        gainLabel.dataset.html = html;
      }
      gainLabel.style.opacity = "1";

      const tag = this.tagLabels[c];
      const text = working
        ? "working"
        : state.status === "skipped"
          ? "skipped ✓"
          : state.status === "trivial"
            ? "no cycle"
            : "";
      tag.textContent = text;
      tag.dataset.status = working ? "working" : state.status;
      tag.style.opacity = text ? "1" : "0";
    });

    // States take the colour of the gain they show.
    this.states.forEach((g, v) => {
      const gain = frame.gains[v];
      const colour = this.gains.colour(gain);
      const circle = g.firstChild as SVGCircleElement;
      circle.style.fill = colour ?? "";
      (g.children[1] as SVGTextElement).style.fill = colour ? this.gains.ink(gain) : "";
      g.classList.toggle("known", colour !== null);
      g.classList.toggle("in-active", frame.active !== null && sccs.comp_of[v] === frame.active);
      g.lastElementChild!.textContent = `state ${v}${gain ? ` · gain ${gain}` : ""}`;
    });

    // The exit value: edges from the SCC being decided into the SCCs that achieve D.
    const exits = new Set<number>();
    if (frame.exit) {
      const { from, D } = frame.exit;
      for (const v of sccs.comps[from]) {
        for (const e of graph.edges) {
          if (e.from !== v) continue;
          const to = sccs.comp_of[e.to];
          if (to !== from && frame.sccs[to].gain === D) exits.add(e.id);
        }
      }
    }

    const policy = new Set(frame.policy ?? []);
    this.edges.forEach((path, i) => {
      const kind = policy.has(i) ? "policy" : exits.has(i) ? "exit" : "plain";
      path.setAttribute("class", `edge ${kind}`);
      path.setAttribute("marker-end", `url(#${this.markers[kind]})`);
      this.weights[i].setAttribute("class", `weight ${kind}`);
    });
  }
}
