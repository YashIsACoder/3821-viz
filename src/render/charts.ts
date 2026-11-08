// The comparison charts on the race page.
//
//   scoreboard     every graph, every method: total work as bars, one card per graph
//   ProgressChart  for one graph: states settled against work done, one step line per method
//   workMatrix     for one graph: how much work each SCC cost each SCC-based method
//
// Colours follow the method (never its rank), and every mark also has a name next to it.
import type { Frame } from "../lib/timeline";
import type { Bundle, IndexEntry, Method } from "../lib/types";

export interface MethodInfo {
  name: (m: Method) => string;
  short: (m: Method) => string; // for tight spots: "Karp" rather than "SCC + Karp"
  colour: (m: Method) => string;
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");

// ---- scoreboard --------------------------------------------------------------------------

// One card per graph: a bar per method, scaled to the slowest method on that graph, with the
// number beside it. Cards rather than one chart, so a phone can show them a row at a time.
export function scoreboard(graphs: IndexEntry[], methods: Method[], info: MethodInfo, current: string): string {
  return graphs
    .map((g) => {
      const works = methods.map((m) => g.work[m]);
      const best = Math.min(...works);
      const most = Math.max(1, ...works);
      const tie = works.every((w) => w === best);
      const bars = methods
        .map((m) => {
          const w = g.work[m];
          const least = w === best && !tie;
          return (
            `<span class="bar-name">${esc(info.short(m))}</span>` +
            `<span class="bar-track"><span class="bar" style="--c:${info.colour(m)}; width:${Math.max(2, (100 * w) / most)}%"></span></span>` +
            `<span class="bar-n${least ? " least" : ""}">${w}</span>`
          );
        })
        .join("");
      const sccs = `${g.sccs} SCC${g.sccs === 1 ? "" : "s"}`;
      return (
        `<li><button type="button" class="card${g.id === current ? " current" : ""}" data-id="${g.id}"` +
        `${g.id === current ? ' aria-current="true"' : ""}>` +
        `<span class="card-head"><span class="card-title">${esc(g.title)}</span>` +
        `<span class="card-meta">${g.n} states · ${sccs}${tie ? " · all tie" : ""}</span></span>` +
        `<span class="bars">${bars}</span>` +
        `</button></li>`
      );
    })
    .join("");
}

// ---- progress chart ----------------------------------------------------------------------

let clipId = 0;

export class ProgressChart {
  private svg: SVGSVGElement;
  private playhead: SVGLineElement;
  private reveal: SVGRectElement;
  private dots = new Map<Method, SVGCircleElement>();
  private x: (w: number) => number;
  private y: (n: number) => number;
  private W = 340;
  private H = 210;

  constructor(
    root: HTMLElement,
    private lanes: { method: Method; frames: Frame[] }[],
    n: number,
    info: MethodInfo,
    onSeek: (work: number) => void,
  ) {
    const { W, H } = this;
    const left = 34;
    const right = 14;
    const top = 14;
    const bottom = 34;
    const most = Math.max(1, ...lanes.map((l) => l.frames[l.frames.length - 1].work));
    this.x = (w) => left + (w / most) * (W - left - right);
    this.y = (k) => top + (1 - k / n) * (H - top - bottom);

    const paths = lanes
      .map(({ method, frames }) => {
        let d = `M ${this.x(0)} ${this.y(0)}`;
        for (const f of frames) d += ` H ${this.x(f.work)} V ${this.y(f.settled)}`;
        return `<path class="line" d="${d}" stroke="${info.colour(method)}"><title>${esc(info.name(method))}</title></path>`;
      })
      .join("");
    // Each line twice: a faint ghost of the whole run, and the part travelled so far on top.
    const clip = `progress-clip-${++clipId}`;
    const yTicks = [0, Math.ceil(n / 2), n]
      .map((k) => `<line class="grid" x1="${left}" x2="${W - right}" y1="${this.y(k)}" y2="${this.y(k)}"/><text class="tick" x="${left - 6}" y="${this.y(k) + 4}" text-anchor="end">${k}</text>`)
      .join("");

    root.innerHTML =
      `<svg class="progress" viewBox="0 0 ${W} ${H}" role="img" aria-label="States settled against relaxations, per method">` +
      yTicks +
      `<text class="tick" x="${left}" y="${H - 8}">0</text>` +
      `<text class="tick" x="${W - right}" y="${H - 8}" text-anchor="end">${most} relaxations</text>` +
      `<g class="ghost">${paths}</g>` +
      `<clipPath id="${clip}"><rect x="0" y="0" height="${H}" width="0"/></clipPath>` +
      `<g clip-path="url(#${clip})">${paths}</g>` +
      `<line class="playhead" y1="${top}" y2="${H - bottom}"/>` +
      `<rect class="seek" x="${left}" y="${top}" width="${W - left - right}" height="${H - top - bottom}"/>` +
      `</svg>`;
    this.svg = root.querySelector("svg")!;
    this.playhead = this.svg.querySelector(".playhead")!;
    this.reveal = this.svg.querySelector("clipPath rect")!;
    for (const { method } of lanes) {
      const dot = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      dot.setAttribute("r", "6");
      dot.setAttribute("class", "now");
      dot.setAttribute("fill", info.colour(method));
      this.svg.append(dot);
      this.dots.set(method, dot);
    }

    // Tap or drag on the chart to move the clock there.
    const seek = (event: PointerEvent) => {
      const box = this.svg.getBoundingClientRect();
      const px = ((event.clientX - box.left) / box.width) * W;
      onSeek(Math.max(0, Math.min(most, ((px - left) / (W - left - right)) * most)));
    };
    const area = this.svg.querySelector(".seek") as SVGRectElement;
    area.addEventListener("pointerdown", (event) => {
      area.setPointerCapture(event.pointerId);
      seek(event);
    });
    area.addEventListener("pointermove", (event) => {
      if (area.hasPointerCapture(event.pointerId)) seek(event);
    });
  }

  update(work: number, shown: Map<Method, Frame>) {
    const px = this.x(work);
    this.playhead.setAttribute("x1", String(px));
    this.playhead.setAttribute("x2", String(px));
    this.reveal.setAttribute("width", String(px + 3));
    for (const { method } of this.lanes) {
      const frame = shown.get(method)!;
      const dot = this.dots.get(method)!;
      dot.setAttribute("cx", String(this.x(frame.work)));
      dot.setAttribute("cy", String(this.y(frame.settled)));
    }
  }
}

// ---- where the work went -----------------------------------------------------------------

// Relaxations each SCC cost: the work between one SCC's outcome event and the previous one.
export function workPerScc(bundle: Bundle, method: Method): Map<number, { work: number; outcome: string }> {
  const out = new Map<number, { work: number; outcome: string }>();
  let before = 0;
  for (const e of bundle.methods[method].trace) {
    if (e.type !== "scc" && e.type !== "prune" && e.type !== "trivial") continue;
    const id = (e as { id: number }).id;
    const lambda = (e as { lambda?: string }).lambda;
    const outcome = e.type === "prune" ? "skipped" : e.type === "trivial" || lambda === "-inf" ? "no cycle" : "solved";
    out.set(id, { work: e.relaxations - before, outcome });
    before = e.relaxations;
  }
  return out;
}

export function workMatrix(bundle: Bundle, methods: Method[], info: MethodInfo): string {
  const sccBased = methods.filter((m) => bundle.methods[m].trace.some((e) => e.type === "scc" || e.type === "prune"));
  if (!sccBased.length) return "";
  const per = new Map(sccBased.map((m) => [m, workPerScc(bundle, m)]));
  const most = Math.max(1, ...sccBased.flatMap((m) => [...per.get(m)!.values()].map((c) => c.work)));
  const comps = bundle.sccs.comps;

  const head = sccBased.map((m) => `<th scope="col"><span class="swatch" style="--c:${info.colour(m)}"></span>${esc(info.short(m))}</th>`).join("");
  const body = comps
    .map((states, c) => {
      const cells = sccBased
        .map((m) => {
          const cell = per.get(m)!.get(c);
          if (!cell) return "<td></td>";
          if (cell.outcome === "skipped") return `<td><span class="chip good">skipped</span> <span class="num">${cell.work || ""}</span></td>`;
          if (cell.outcome === "no cycle") return `<td><span class="chip">no cycle</span></td>`;
          const width = Math.max(3, (100 * cell.work) / most);
          return `<td><span class="mini" style="--c:${info.colour(m)}; width:${width}%"></span><span class="num">${cell.work}</span></td>`;
        })
        .join("");
      return `<tr><th scope="row">SCC ${c}<span class="small">${states.length} state${states.length === 1 ? "" : "s"}</span></th>${cells}</tr>`;
    })
    .join("");

  const others = methods.filter((m) => !sccBased.includes(m));
  const note = others
    .map((m) => {
      const s = bundle.methods[m].result.stats;
      return `${esc(info.name(m))} works on the whole graph at once: ${s.relaxations} relaxations over ${s.iterations} rounds.`;
    })
    .join(" ");

  return (
    `<div class="table-scroll"><table class="work"><thead><tr><th>SCC</th>${head}</tr></thead><tbody>${body}</tbody></table></div>` +
    (note ? `<p class="small">${note}</p>` : "")
  );
}
