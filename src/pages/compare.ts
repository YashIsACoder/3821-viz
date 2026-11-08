// The race: one graph, every method in the bundle, one clock measured in relaxations.
//
// Works on the curated graphs in public/data, and on any run you open yourself:
//   dmdp viz cascade my_graph.txt > cascade.json     then drop the file(s) on the page,
//   or link to compare.html?src=<url of a viz or bundle JSON>.
import "katex/dist/katex.min.css";
import "../style.css";
import "./compare.css";
import { nameOf, shortNameOf } from "../lib/methods";
import { frameAtWork, frames, type Frame } from "../lib/timeline";
import { loadBundle, loadIndex, methodsOf, METHODS, toBundle, type Bundle, type IndexEntry, type Method } from "../lib/types";
import { rich } from "../render/caption";
import { ProgressChart, scoreboard, workMatrix, type MethodInfo } from "../render/charts";
import { GraphView } from "../render/graphView";
import { legend } from "../render/legend";
import { boundChart, karpTable } from "../render/panels";
import { Player } from "../render/player";

const ABOUT: Record<string, string> = {
  scc_karp: "The standard pipeline: split into SCCs, run Karp's algorithm on every one, combine sinks first.",
  cascade: "Our idea: the same, but first try cheap bounds that can prove an SCC isn't worth solving, and skip it.",
  hybrid: "Our cascade's cheapest bound first; SCCs it can't skip go to Howard, with Karp taking over if Howard runs long.",
  howard: "Policy iteration (Howard, 1960): pick actions, see what they earn, switch to better ones, repeat.",
};
const info: MethodInfo = {
  name: nameOf,
  short: shortNameOf,
  colour: (m) => (METHODS.includes(m) ? `var(--${m})` : "var(--ink-2)"),
};

const $ = <T extends HTMLElement>(sel: string) => document.querySelector<T>(sel)!;
const narrow = () => window.matchMedia("(max-width: 699px)").matches;

let player: Player | null = null;
let focus: Method = "cascade";
let graphs: IndexEntry[] = [];
let currentId = "";

function drawScoreboard() {
  const methods = METHODS.filter((m) => graphs.every((g) => g.work[m] !== undefined));
  const board = $("#scoreboard");
  board.innerHTML = scoreboard(graphs, methods, info, currentId);
  // In the swipeable row on a phone, bring the current graph into view without moving the page.
  const card = board.querySelector<HTMLElement>(".card.current");
  if (card && board.scrollWidth > board.clientWidth) {
    const pad = parseFloat(getComputedStyle(board).paddingLeft);
    board.scrollLeft = card.parentElement!.offsetLeft - board.offsetLeft - pad;
  }
}

function showGraph(bundle: Bundle) {
  const methods = methodsOf(bundle);
  if (!methods.length) throw new Error("this file has no runs in it");
  if (!methods.includes(focus)) focus = methods.includes("cascade") ? "cascade" : methods[0];

  $("#graph-eyebrow").textContent = `${bundle.graph.n} states · ${bundle.graph.edges.length} actions · ${bundle.sccs.comps.length} SCCs`;
  $("#graph-title").textContent = bundle.title;
  $("#graph-blurb").innerHTML = rich(bundle.blurb);
  document.title = `${bundle.title} · Race the Solvers`;

  // Leave room under the graph for the caption, and the dock below that.
  const view = new GraphView($("#graph"), bundle, () => window.innerHeight * (narrow() ? 0.55 : 0.62));
  $("#legend").replaceChildren(legend(view.gains, !narrow()));

  const lanes = methods.map((method) => ({ method, frames: frames(bundle, method) }));
  const totals = new Map(lanes.map((l) => [l.method, l.frames[l.frames.length - 1].work]));
  const ticks = [...new Set(lanes.flatMap((l) => l.frames.map((f) => f.work)))].sort((a, b) => a - b);
  const most = Math.max(1, ...totals.values());

  // Tabs pick whose run the big graph shows; the clock is shared.
  const tabs = $(".tabs");
  tabs.innerHTML = methods
    .map((m) => `<button type="button" role="tab" data-method="${m}" style="--c:${info.colour(m)}"><span class="swatch"></span>${info.name(m)}</button>`)
    .join("");
  tabs.hidden = methods.length < 2;

  const chips = $("#chips");
  chips.innerHTML = methods
    .map((m) => `<button type="button" class="chip-m" data-method="${m}" style="--c:${info.colour(m)}"><span class="swatch"></span><span class="who">${info.name(m)}</span><span class="w"></span></button>`)
    .join("");

  $("#matrix").innerHTML = workMatrix(bundle, methods, info);

  const verdict = $("#verdict");
  const agreement = verdictFor(bundle, methods);
  let tick = 0;
  const shown = new Map<Method, Frame>();

  const progress = new ProgressChart($("#progress"), lanes, bundle.graph.n, info, (work) => {
    player?.pause();
    let i = 0;
    while (i + 1 < ticks.length && ticks[i + 1] <= work) i++;
    player?.go(i);
  });

  const paintStage = () => {
    const frame = shown.get(focus)!;
    const index = lanes.find((l) => l.method === focus)!.frames.indexOf(frame);
    view.show(frame);
    $("#caption").innerHTML = index === 0 ? `<span class="small">${ABOUT[focus] ?? ""}</span>` : rich(frame.caption);
    $("#detail").replaceChildren(...[karpTable(frame, bundle), boundChart(frame)].filter((x): x is HTMLElement => x !== null));
    document.querySelectorAll<HTMLElement>("[data-method]").forEach((b) => b.setAttribute("aria-selected", String(b.dataset.method === focus)));
  };

  const draw = (t: number): string => {
    tick = t;
    const work = ticks[t];
    for (const lane of lanes) shown.set(lane.method, lane.frames[frameAtWork(lane.frames, work)]);
    paintStage();
    progress.update(work, shown);
    for (const lane of lanes) {
      const frame = shown.get(lane.method)!;
      const done = frame === lane.frames[lane.frames.length - 1];
      const chip = chips.querySelector<HTMLElement>(`[data-method="${lane.method}"]`)!;
      chip.querySelector(".w")!.textContent = done ? `${totals.get(lane.method)} ✓` : `${frame.work}`;
      chip.classList.toggle("done", done);
    }
    verdict.textContent = t === ticks.length - 1 ? agreement : "";
    return `${work} / ${most}`;
  };

  const pick = (event: Event) => {
    const button = (event.target as HTMLElement).closest<HTMLElement>("[data-method]");
    if (!button?.dataset.method) return;
    focus = button.dataset.method;
    draw(tick);
  };
  tabs.onclick = pick;
  chips.onclick = pick;

  player?.pause();
  // About 1.5 s a step at 1×, so each caption can be read; long races get a little quicker.
  const delay = Math.max(700, Math.min(1500, 60000 / ticks.length));
  player = new Player($("#player"), ticks.length, draw, delay);
}

function sameGains(a: string[], b: string[]) {
  return a.length === b.length && a.every((x, i) => x === b[i]);
}

function verdictFor(bundle: Bundle, methods: Method[]): string {
  const first = bundle.methods[methods[0]].result.gain;
  const odd = methods.filter((m) => !sameGains(bundle.methods[m].result.gain, first));
  if (odd.length) return `Warning: ${odd.map(info.name).join(", ")} disagree${odd.length === 1 ? "s" : ""} with ${info.name(methods[0])} on some gains.`;
  if (methods.length === 1) return "";
  const all = `✓ All ${methods.length} methods found exactly the same gain in every state`;
  if (!bundle.bruteforce) return `${all}.`;
  return sameGains(bundle.bruteforce, first)
    ? `${all}, and so did brute force over every possible policy.`
    : "Warning: brute force finds different gains.";
}

// ---- choosing a graph, or opening your own run -------------------------------------------

async function select(id: string, scroll: boolean) {
  currentId = id;
  drawScoreboard();
  const url = new URL(window.location.href);
  url.searchParams.delete("src");
  url.searchParams.set("g", id);
  window.history.replaceState(null, "", url);
  showGraph(await loadBundle(id));
  if (scroll) $("#race").scrollIntoView({ behavior: "smooth" });
}

function showError(message: string) {
  $("#verdict").textContent = `Could not open that: ${message}`;
  $("#race").scrollIntoView();
}

async function openFiles(files: FileList | File[]) {
  const list = [...files];
  if (!list.length) return;
  try {
    const data = await Promise.all(list.map(async (f) => JSON.parse(await f.text())));
    const name = list.length === 1 ? list[0].name.replace(/\.json$/i, "") : "Your runs";
    currentId = "";
    drawScoreboard();
    showGraph(toBundle(data.length === 1 ? data[0] : data, name));
    $("#race").scrollIntoView({ behavior: "smooth" });
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
  document.body.append(input);
  $("#open").addEventListener("click", () => input.click());
  window.addEventListener("dragover", (event) => event.preventDefault());
  window.addEventListener("drop", (event) => {
    event.preventDefault();
    if (event.dataTransfer?.files.length) openFiles(event.dataTransfer.files);
  });
}

async function main() {
  Player.bindKeys(() => player);
  setUpOpening();
  const params = new URLSearchParams(window.location.search);
  const index = await loadIndex();
  graphs = index.graphs;
  $("#backend").textContent = `Data from dmdp at ${index.backend.commit}.`;

  $("#scoreboard").addEventListener("click", (event) => {
    const card = (event.target as Element).closest<HTMLElement>(".card");
    if (card?.dataset.id) select(card.dataset.id, true);
  });

  const src = params.get("src");
  if (src) {
    try {
      const response = await fetch(src);
      if (!response.ok) throw new Error(`${response.status} from ${src}`);
      drawScoreboard();
      showGraph(toBundle(await response.json(), new URL(src, window.location.href).pathname.split("/").pop()?.replace(/\.json$/i, "") || "run"));
      return;
    } catch (error) {
      showError((error as Error).message);
    }
  }
  const wanted = params.get("g");
  const first = graphs.find((g) => g.id === wanted) ?? graphs.find((g) => g.id === "chain-rise") ?? graphs[0];
  await select(first.id, Boolean(wanted));
}

main().catch((error) => showError(error.message));
