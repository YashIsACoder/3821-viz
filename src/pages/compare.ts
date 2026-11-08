// The race: one graph, every method in the bundle, one clock measured in relaxations.
//
// Works on the curated graphs in public/data, and on any run you open yourself:
//   dmdp viz cascade my_graph.txt > cascade.json     then drop the file(s) on the page,
//   or link to compare.html?src=<url of a viz or bundle JSON>.
import "katex/dist/katex.min.css";
import "../style.css";
import "./compare.css";
import { frameAtWork, frames, type Frame } from "../lib/timeline";
import { loadBundle, loadIndex, methodsOf, METHODS, toBundle, type Bundle, type Method } from "../lib/types";
import { rich } from "../render/caption";
import { GraphView } from "../render/graphView";
import { boundChart, karpTable } from "../render/panels";
import { Player } from "../render/player";

const NAMES: Record<string, string> = {
  scc_karp: "SCC + Karp",
  cascade: "Cascade (ours)",
  howard: "Howard",
};
const ABOUT: Record<string, string> = {
  scc_karp: "Split into SCCs, run Karp's algorithm on every one, combine sinks first.",
  cascade: "The same, but skip Karp on an SCC when a cheap bound proves it can't beat leaving.",
  howard: "Policy iteration: evaluate a policy, switch to better actions, repeat.",
};
const nameOf = (m: Method) => NAMES[m] ?? m;
const colourOf = (m: Method) => (METHODS.includes(m) ? `var(--${m})` : "var(--ink-2)");

const $ = <T extends HTMLElement>(sel: string) => document.querySelector<T>(sel)!;

interface Lane {
  method: Method;
  frames: Frame[];
  view: GraphView;
  panel: HTMLElement;
  caption: HTMLElement;
  detail: HTMLElement;
  work: HTMLElement;
  shown: number;
}

let player: Player | null = null;
let focus: Method = "cascade";

function setFocus(method: Method) {
  focus = method;
  document.querySelectorAll<HTMLElement>(".panel").forEach((p) => p.classList.toggle("focused", p.dataset.method === method));
  document.querySelectorAll<HTMLButtonElement>(".tabs button").forEach((b) => {
    b.setAttribute("aria-selected", String(b.dataset.method === method));
  });
}

function sameGains(a: string[], b: string[]) {
  return a.length === b.length && a.every((x, i) => x === b[i]);
}

function verdictFor(bundle: Bundle, methods: Method[]): string {
  const first = bundle.methods[methods[0]].result.gain;
  const odd = methods.filter((m) => !sameGains(bundle.methods[m].result.gain, first));
  if (odd.length) return `Warning: ${odd.map(nameOf).join(", ")} disagree${odd.length === 1 ? "s" : ""} with ${nameOf(methods[0])} on some gains.`;
  const all = methods.length === 1 ? nameOf(methods[0]) : `All ${methods.length} methods agree on every state's gain`;
  if (!bundle.bruteforce) return methods.length === 1 ? "" : `${all}.`;
  return sameGains(bundle.bruteforce, first)
    ? `${all}, and so does brute force over every policy.`
    : "Warning: brute force finds different gains.";
}

function showGraph(bundle: Bundle) {
  const methods = methodsOf(bundle);
  if (!methods.length) throw new Error("this file has no runs in it");
  if (!methods.includes(focus)) focus = methods.includes("cascade") ? "cascade" : methods[0];

  $("#graph-title").textContent = bundle.title;
  $("#graph-blurb").innerHTML = rich(bundle.blurb);
  document.title = `${bundle.title} · Race the Solvers`;

  const tabs = $(".tabs");
  tabs.innerHTML = methods
    .map((m) => `<button type="button" role="tab" data-method="${m}" style="--c: ${colourOf(m)}">${nameOf(m)}</button>`)
    .join("");
  tabs.hidden = methods.length < 2;

  const panels = $("#panels");
  panels.replaceChildren();
  panels.style.setProperty("--lanes", String(Math.min(methods.length, 3)));
  const narrow = window.matchMedia("(max-width: 899px)").matches;

  const lanes: Lane[] = methods.map((method) => {
    const panel = document.createElement("section");
    panel.className = "panel";
    panel.dataset.method = method;
    panel.style.setProperty("--c", colourOf(method));
    panel.innerHTML = `
      <div class="panel-head">
        <span class="swatch"></span><strong></strong>
        <span class="work small"></span>
      </div>
      <p class="small about"></p>
      <div class="graph-slot"></div>
      <p class="caption"></p>
      <div class="detail"></div>`;
    panel.querySelector("strong")!.textContent = nameOf(method);
    panel.querySelector(".about")!.textContent = ABOUT[method] ?? "";
    panels.append(panel);
    // A long chain reads better top to bottom on a phone.
    const vertical = narrow && bundle.graph.n > 4 && bundle.sccs.comps.length > 2;
    return {
      method,
      frames: frames(bundle, method),
      view: new GraphView(panel.querySelector(".graph-slot")!, bundle, vertical),
      panel,
      caption: panel.querySelector(".caption")!,
      detail: panel.querySelector(".detail")!,
      work: panel.querySelector(".work")!,
      shown: -1,
    };
  });
  setFocus(focus);

  // Ticks: every amount of work at which some method's picture changes.
  const totals = lanes.map((l) => l.frames[l.frames.length - 1].work);
  const ticks = [...new Set(lanes.flatMap((l) => l.frames.map((f) => f.work)))].sort((a, b) => a - b);
  const most = Math.max(1, ...totals);

  const bars = $("#bars");
  bars.innerHTML = lanes
    .map(
      (l) => `<div class="bar" style="--c: ${colourOf(l.method)}">
        <span class="bar-name"></span>
        <span class="bar-track"><span class="bar-fill"></span></span>
        <span class="bar-value"></span></div>`,
    )
    .join("");
  lanes.forEach((l, i) => (bars.children[i].querySelector(".bar-name")!.textContent = nameOf(l.method)));

  const verdict = $("#verdict");
  const agreement = verdictFor(bundle, methods);

  const draw = (tick: number): string => {
    const work = ticks[tick];
    lanes.forEach((lane, i) => {
      const index = frameAtWork(lane.frames, work);
      const frame = lane.frames[index];
      const done = index === lane.frames.length - 1;
      if (index !== lane.shown) {
        lane.shown = index;
        lane.view.show(frame);
        lane.caption.innerHTML = index === 0 ? "Not started." : rich(frame.caption);
        lane.detail.replaceChildren(...[karpTable(frame, bundle), boundChart(frame)].filter((x): x is HTMLElement => x !== null));
      }
      lane.work.textContent = done ? `done · ${totals[i]} relaxations` : `${frame.work} relaxations`;
      const bar = bars.children[i] as HTMLElement;
      (bar.querySelector(".bar-fill") as HTMLElement).style.width = `${(100 * Math.min(work, totals[i])) / most}%`;
      bar.querySelector(".bar-value")!.textContent = `${Math.min(work, totals[i])}${done ? " ✓" : ""}`;
      bar.classList.toggle("done", done);
    });
    verdict.textContent = tick === ticks.length - 1 ? agreement : "";
    return `work ${work} / ${most}`;
  };

  player?.pause();
  const delay = Math.max(350, Math.min(1100, 24000 / ticks.length));
  player = new Player($("#player"), ticks.length, draw, delay);
}

// ---- opening your own runs -----------------------------------------------------------

function showError(message: string) {
  $("#verdict").textContent = `Could not open that: ${message}`;
}

async function openFiles(files: FileList | File[]) {
  const list = [...files];
  if (!list.length) return;
  try {
    const data = await Promise.all(list.map(async (f) => JSON.parse(await f.text())));
    const name = list.length === 1 ? list[0].name.replace(/\.json$/i, "") : "Your runs";
    document.querySelectorAll(".picker button[data-id]").forEach((b) => b.setAttribute("aria-pressed", "false"));
    showGraph(toBundle(data.length === 1 ? data[0] : data, name));
  } catch (error) {
    showError((error as Error).message);
  }
}

function setUpOpening() {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = ".json,application/json";
  input.multiple = true;
  input.hidden = true;
  input.addEventListener("change", () => input.files && openFiles(input.files));
  const button = document.createElement("button");
  button.type = "button";
  button.className = "open";
  button.textContent = "Open a run…";
  button.title = "One or more JSON files from `dmdp viz`, for the same graph";
  button.addEventListener("click", () => input.click());
  $(".picker").append(button, input);

  window.addEventListener("dragover", (event) => event.preventDefault());
  window.addEventListener("drop", (event) => {
    event.preventDefault();
    if (event.dataTransfer?.files.length) openFiles(event.dataTransfer.files);
  });
}

async function main() {
  Player.bindKeys(() => player);
  const params = new URLSearchParams(window.location.search);
  const index = await loadIndex();
  $("#backend").textContent = `Data from dmdp at ${index.backend.commit}.`;

  const picker = $(".picker");
  picker.innerHTML = index.graphs.map((g) => `<button type="button" data-id="${g.id}">${g.title}</button>`).join("");
  setUpOpening();

  $(".tabs").addEventListener("click", (event) => {
    const button = (event.target as HTMLElement).closest("button");
    if (button?.dataset.method) setFocus(button.dataset.method);
  });

  const select = async (id: string) => {
    picker.querySelectorAll("button[data-id]").forEach((b) => b.setAttribute("aria-pressed", String((b as HTMLElement).dataset.id === id)));
    const url = new URL(window.location.href);
    url.searchParams.delete("src");
    url.searchParams.set("g", id);
    window.history.replaceState(null, "", url);
    showGraph(await loadBundle(id));
  };
  picker.addEventListener("click", (event) => {
    const button = (event.target as HTMLElement).closest<HTMLElement>("button[data-id]");
    if (button?.dataset.id) select(button.dataset.id);
  });

  const src = params.get("src");
  if (src) {
    try {
      const response = await fetch(src);
      if (!response.ok) throw new Error(`${response.status} from ${src}`);
      showGraph(toBundle(await response.json(), new URL(src, window.location.href).pathname.split("/").pop()?.replace(/\.json$/i, "") || "run"));
      return;
    } catch (error) {
      showError((error as Error).message);
    }
  }
  const wanted = params.get("g");
  const first = index.graphs.find((g) => g.id === wanted) ?? index.graphs.find((g) => g.id === "chain-rise") ?? index.graphs[0];
  await select(first.id);
}

main().catch((error) => showError(error.message));
