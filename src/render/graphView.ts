// Draws a bundle's graph as SVG and updates it frame by frame.
// The picture never moves; a frame only changes classes (CSS animates them) and labels.
import { layout, type Layout, type Point } from "../lib/layout";
import { parse, tex } from "../lib/rational";
import type { Frame } from "../lib/timeline";
import type { Bundle } from "../lib/types";
import { math } from "./caption";

const SVG = "http://www.w3.org/2000/svg";
const STATE_R = 12;
const HULL_PAD = 22;

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

let markerId = 0;

export class GraphView {
  readonly layout: Layout;
  private hulls: SVGCircleElement[] = [];
  private edges: SVGPathElement[] = [];
  private states: SVGGElement[] = [];
  private gainLabels: HTMLElement[] = [];
  private tagLabels: HTMLElement[] = [];
  private arrow: string;
  private arrowPolicy: string;

  constructor(
    root: HTMLElement,
    private bundle: Bundle,
    vertical = false,
  ) {
    const { graph, sccs } = bundle;
    this.layout = layout(graph, sccs, vertical);
    const { width, height, pos, clusters } = this.layout;

    root.classList.add("graph");
    root.replaceChildren();
    root.style.aspectRatio = `${width} / ${height}`;

    const svg = el("svg", { viewBox: `0 0 ${width} ${height}`, role: "img" });
    svg.setAttribute("aria-label", `${graph.n} states and ${graph.edges.length} actions in ${sccs.comps.length} SCCs`);
    const id = ++markerId;
    this.arrow = `arrow-${id}`;
    this.arrowPolicy = `arrow-policy-${id}`;
    const defs = el("defs");
    for (const [name, colour] of [[this.arrow, "var(--muted)"], [this.arrowPolicy, "var(--focus)"]]) {
      const marker = el("marker", { id: name, viewBox: "0 0 10 10", refX: 8, refY: 5, markerWidth: 7, markerHeight: 7, orient: "auto-start-reverse" });
      marker.append(el("path", { d: "M 0 1 L 9 5 L 0 9 z", fill: colour }));
      defs.append(marker);
    }
    svg.append(defs);

    const hullLayer = el("g");
    const edgeLayer = el("g");
    const weightLayer = el("g");
    const stateLayer = el("g");
    svg.append(hullLayer, edgeLayer, weightLayer, stateLayer);

    for (const c of clusters) {
      const hull = el("circle", { cx: c.center.x, cy: c.center.y, r: c.radius + HULL_PAD, class: "hull" });
      hullLayer.append(hull);
      this.hulls.push(hull);
    }

    this.drawEdges(edgeLayer, weightLayer);

    pos.forEach((p, v) => {
      const g = el("g", { class: "state", transform: `translate(${fmt(p)})` });
      g.append(el("circle", { r: STATE_R }));
      const label = el("text");
      label.textContent = String(v);
      g.append(label);
      stateLayer.append(g);
      this.states.push(g);
    });

    // HTML labels on top of the SVG, so the maths can be typeset by KaTeX.
    const labels = document.createElement("div");
    labels.className = "labels";
    for (const c of clusters) {
      const below = c.center.y + c.radius + HULL_PAD;
      this.gainLabels.push(this.label(labels, { x: c.center.x, y: below + 14 }, "label"));
      this.tagLabels.push(this.label(labels, { x: c.center.x, y: below + 33 }, "label tag"));
    }
    root.append(svg, labels);

    // Keep label text in proportion to the drawing as the page resizes.
    const fit = () => {
      const px = (14 * root.clientWidth) / width;
      labels.style.fontSize = `${Math.max(9, Math.min(17, px))}px`;
    };
    new ResizeObserver(fit).observe(root);
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

  private drawEdges(edgeLayer: SVGGElement, weightLayer: SVGGElement) {
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
        const reach = 38 + 14 * index;
        const spread = 0.55;
        const a = add(p, scale(add(scale(out, Math.cos(spread)), scale(side, Math.sin(spread))), STATE_R));
        const b = add(p, scale(add(scale(out, Math.cos(spread)), scale(side, -Math.sin(spread))), STATE_R + 2));
        const c1 = add(p, add(scale(out, reach), scale(side, reach * 0.6)));
        const c2 = add(p, add(scale(out, reach), scale(side, -reach * 0.6)));
        d = `M ${fmt(a)} C ${fmt(c1)} ${fmt(c2)} ${fmt(b)}`;
        labelAt = add(p, scale(out, reach * 0.78 + 6));
      } else {
        const p = pos[e.from];
        const q = pos[e.to];
        // Measure the bend against the lower-numbered state, so the two directions of a
        // 2-cycle bend to opposite sides. A lone edge stays straight.
        const [lo, hi] = e.from < e.to ? [p, q] : [q, p];
        const normal = unit({ x: lo.y - hi.y, y: hi.x - lo.x });
        const offset = (index - (group.length - 1) / 2) * 26;
        const control = add(scale(add(p, q), 0.5), scale(normal, offset));
        const start = add(p, scale(unit(sub(control, p)), STATE_R));
        const end = add(q, scale(unit(sub(control, q)), STATE_R + 2));
        d = `M ${fmt(start)} Q ${fmt(control)} ${fmt(end)}`;
        // the curve's midpoint
        labelAt = add(scale(add(start, end), 0.25), scale(control, 0.5));
      }

      const path = el("path", { d, class: "edge", "marker-end": `url(#${this.arrow})` });
      path.append(Object.assign(el("title"), { textContent: `action ${e.id}: ${e.from} → ${e.to}, reward ${e.weight}` }));
      edgeLayer.append(path);
      this.edges.push(path);

      const weight = el("text", { x: labelAt.x.toFixed(1), y: labelAt.y.toFixed(1), class: "weight" });
      weight.textContent = String(e.weight);
      weightLayer.append(weight);
    }
  }

  show(frame: Frame): void {
    const { sccs } = this.bundle;
    frame.sccs.forEach((state, c) => {
      const working = frame.active === c && state.status === "working";
      this.hulls[c].setAttribute("class", `hull ${state.status}`);
      for (const v of sccs.comps[c]) this.states[v].classList.toggle("dim", state.status === "skipped");

      const gains = [...new Set(sccs.comps[c].map((v) => frame.gains[v]).filter((g): g is string => g !== null))];
      const gainLabel = this.gainLabels[c];
      const html = gains.length ? math(`g^* = ${gains.map((g) => tex(parse(g))).join(",\\ ")}`) : "";
      if (gainLabel.dataset.html !== html) {
        gainLabel.innerHTML = html;
        gainLabel.dataset.html = html;
      }
      gainLabel.style.opacity = html ? "1" : "0";

      const tag = this.tagLabels[c];
      const text = working ? "working" : state.status === "skipped" ? "skipped" : state.status === "trivial" ? "no cycle" : "";
      tag.textContent = text;
      tag.classList.toggle("working", working);
      tag.style.opacity = text ? "1" : "0";
    });

    const policy = new Set(frame.policy ?? []);
    this.edges.forEach((path, i) => {
      const on = policy.has(i);
      path.classList.toggle("policy", on);
      path.setAttribute("marker-end", `url(#${on ? this.arrowPolicy : this.arrow})`);
    });
  }
}
