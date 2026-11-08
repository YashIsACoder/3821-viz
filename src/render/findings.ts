// "What we found": the experiment headlines, read from public/data/results.json, which the
// data script pulls out of the research repo's experiment summaries.

export interface Results {
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
    source: string;
  };
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

export function sources(r: Results): string {
  const files = [r.agreement.source, r.pruning.source, r.soundness.source, r.headToHead?.source].filter(Boolean);
  return `From the research repo: ${files.map((f) => `<code>${f}</code>`).join(", ")}.`;
}
