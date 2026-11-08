// "What we found": the experiment headlines, read from public/data/results.json, which the
// data script pulls out of the research repo's experiment summaries.

export interface Results {
  backend: { commit: string; dirty: boolean };
  agreement: { graphs: number; bruteforce: number; disagreements: number; source: string };
  pruning: { families: { family: string; graphs: number; saved: number; skipped: number }[]; source: string };
  soundness: { graphs: number; violations: number; skips: number; source: string };
  headToHead?: {
    circuits: number;
    hybridBeatsCascade: number;
    hybridVsCascadeIscas: number;
    howardBeatsHybrid: number;
    howardVsHybridIscas: number;
    asadi: { n: number; seconds: { howard: number; hybrid: number; cascade: number } };
    scaling?: { n: number; ms: { howard: number; hybrid: number; cascade: number } }[];
    source: string;
  };
  bounds?: { families: { family: string; couldSkip: number; maxEdge: number; all: number }[]; source: string };
  stall?: { sccs: number; deltaReaches: number; windowReaches: number; source: string };
}

export async function loadResults(): Promise<Results> {
  const response = await fetch("./data/results.json");
  if (!response.ok) throw new Error(`results.json: ${response.status}`);
  return response.json();
}

// What each generated family looks like, in words.
const FAMILIES: Record<string, string> = {
  rising: "chains where each SCC is worse than the next",
  small: "many small SCCs",
  periodic: "SCCs whose best cycle is long",
  giant: "one giant SCC, the rest single states",
  falling: "chains where each SCC is better than the next",
};

const num = (x: number) => x.toLocaleString("en");
const secs = (x: number) => `${x >= 100 ? num(Math.round(x)) : x} s`;

function tile(big: string, label: string): string {
  return `<div class="tile"><span class="big">${big}</span><span class="what">${label}</span></div>`;
}

export function tiles(r: Results): string {
  const best = [...r.pruning.families].sort((a, b) => b.saved - a.saved)[0];
  return (
    tile(String(r.agreement.disagreements), `disagreements. All methods gave exactly the same gains on ${num(r.agreement.graphs)} graphs, and ${num(r.agreement.bruteforce)} were also checked by trying every policy.`) +
    tile(String(r.soundness.violations), `wrong skips. The cascade skipped ${num(r.soundness.skips)} SCCs over ${num(r.soundness.graphs)} graphs, and for every one, Karp's exact answer confirms no cycle inside beat leaving.`) +
    tile(`${Math.round(best.saved)}%`, `less work on ${FAMILIES[best.family] ?? best.family}${best.skipped === 100 ? ": every SCC but the last is skipped" : ""}.`)
  );
}

// One bar per family, best first. One series, so one colour and no legend; every bar is labelled.
export function familyBars(r: Results): string {
  return [...r.pruning.families]
    .sort((a, b) => b.saved - a.saved)
    .map((f) => {
      const tip = `${f.family}: ${f.saved}% of Karp's work saved, ${f.skipped}% of SCCs skipped, over ${f.graphs} graphs`;
      return (
        `<div class="family" title="${tip}">` +
        `<span class="family-name">${FAMILIES[f.family] ?? f.family}</span>` +
        `<span class="family-track"><span class="family-bar" style="width:${f.saved ? Math.max(1, f.saved) : 0}%"></span></span>` +
        `<span class="family-n">${f.saved === 0 ? "none" : `${Math.round(f.saved)}%`}</span>` +
        `</div>`
      );
    })
    .join("");
}

export function circuits(r: Results): string {
  const h = r.headToHead;
  if (!h) return "";
  const s = h.asadi.seconds;
  return `
    <p>On ${h.circuits} real circuits, the hybrid beat our cascade on ${h.hybridBeatsCascade}
      (typically ${h.hybridVsCascadeIscas}× faster). But Howard was faster still on ${h.howardBeatsHybrid}, by about
      ${h.howardVsHybridIscas}×: in circuits most SCCs have no cycle at all, so there is little to skip.</p>
    <p>The hybrid earns its place on graphs built to be hard for Howard. With ${num(h.asadi.n)} states:</p>
    <div class="times">
      <div><b>${secs(s.howard)}</b><span>Howard</span></div>
      <div><b>${secs(s.hybrid)}</b><span>Hybrid</span></div>
      <div><b>${secs(s.cascade)}</b><span>Cascade</span></div>
    </div>`;
}

// E4 as a table: the cheapest test against all of them, out of the SCCs that could be skipped.
export function boundsTable(r: Results): string {
  if (!r.bounds) return "";
  const rows = r.bounds.families
    .map(
      (f) =>
        `<tr><th scope="row">${FAMILIES[f.family] ?? f.family}</th><td>${num(f.couldSkip)}</td>` +
        `<td>${num(f.maxEdge)}</td><td>${num(f.all)}</td></tr>`,
    )
    .join("");
  return (
    `<div class="table-scroll"><table class="numbers">` +
    `<thead><tr><th scope="col">Kind of graph</th><th scope="col">SCCs that could go</th>` +
    `<th scope="col">largest edge alone</th><th scope="col">with δ<sub>k</sub> too</th></tr></thead>` +
    `<tbody>${rows}</tbody></table></div>`
  );
}

export function stallTiles(r: Results): string {
  if (!r.stall) return "";
  const s = r.stall;
  return (
    tile(`${s.deltaReaches} of ${s.sccs}`, `SCCs with long best cycles where δ<sub>k</sub> came down to λ, even with twice as many rows as the SCC has states.`) +
    tile(`${s.windowReaches} of ${s.sccs}`, `where a “window” bound reached λ within as many rows as states. It measures the rise over the last p rows, not just the last one.`)
  );
}

const SERIES = ["howard", "hybrid", "cascade"] as const;
const LABEL = { howard: "Howard", hybrid: "Hybrid", cascade: "Cascade" };

// Two significant figures, in seconds from a tenth of a second up, so it matches the boxes above.
function time(ms: number): string {
  if (ms >= 100) return `${num(+(ms / 1000).toPrecision(2))} s`;
  return `${+ms.toPrecision(2)} ms`;
}

// Time against size on Asadi's family, both on log scales, one line per method, drawn at the
// width it is shown at so its text stays page-sized. Lines are named at their right-hand end.
export function scalingChart(r: Results, width: number): string {
  const data = r.headToHead?.scaling;
  if (!data?.length) return "";
  const W = Math.max(300, Math.round(width));
  const H = 280;
  const left = 58;
  const right = 112;
  const top = 12;
  const bottom = 40;
  const ns = data.map((d) => d.n);
  const all = data.flatMap((d) => SERIES.map((m) => d.ms[m])).filter((v) => v > 0);
  const lo = Math.pow(10, Math.floor(Math.log10(Math.min(...all))));
  const hi = Math.pow(10, Math.ceil(Math.log10(Math.max(...all))));
  const x = (n: number) => left + (Math.log2(n / ns[0]) / Math.log2(ns[ns.length - 1] / ns[0])) * (W - left - right);
  const y = (ms: number) => top + (1 - (Math.log10(Math.max(ms, lo)) - Math.log10(lo)) / (Math.log10(hi) - Math.log10(lo))) * (H - top - bottom);

  const decades: number[] = [];
  for (let t = lo; t <= hi; t *= 10) decades.push(t);
  const every = W < 480 && decades.length > 6 ? 2 : 1;
  const yAxis = decades
    .map((t, i) => `<line class="grid" x1="${left}" x2="${W - right}" y1="${y(t)}" y2="${y(t)}"/>` + (i % every ? "" : `<text class="tick" x="${left - 8}" y="${y(t) + 4}" text-anchor="end">${time(t)}</text>`))
    .join("");
  const xAxis =
    ns.map((n) => `<text class="tick" x="${x(n)}" y="${H - bottom + 18}" text-anchor="middle">${num(n)}</text>`).join("") +
    `<text class="tick" x="${(left + W - right) / 2}" y="${H - 4}" text-anchor="middle">states (each step doubles the size)</text>`;
  const lines = SERIES.map((m) => {
    const pts = data.map((d) => `${x(d.n)},${y(d.ms[m])}`).join(" ");
    const dots = data
      .map((d) => `<circle cx="${x(d.n)}" cy="${y(d.ms[m])}" r="4" fill="var(--${m})"><title>${LABEL[m]}, ${num(d.n)} states: ${time(d.ms[m])}</title></circle>`)
      .join("");
    const last = data[data.length - 1];
    return (
      `<polyline points="${pts}" stroke="var(--${m})"/>${dots}` +
      `<text class="end" x="${x(last.n) + 10}" y="${y(last.ms[m]) + 4}">${LABEL[m]} <tspan class="v">${time(last.ms[m])}</tspan></text>`
    );
  }).join("");
  return `<svg class="scaling" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="Running time against number of states on Asadi's family, for Howard, the hybrid and the cascade">${yAxis}${xAxis}${lines}</svg>`;
}

export function sources(r: Results): string {
  const files = [r.agreement.source, r.pruning.source, r.soundness.source, r.bounds?.source, r.stall?.source, r.headToHead?.source].filter(Boolean);
  return `From the research repo: ${files.map((f) => `<code>${f}</code>`).join(", ")}.`;
}
