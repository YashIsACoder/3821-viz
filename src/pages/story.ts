// The guided story: a sticky stage and text steps. Scrolling a step into view sets what
// the stage shows, and some steps play their method's frames like a short animation.
import "katex/dist/katex.min.css";
import "../style.css";
import "./story.css";
import { frames, type Frame } from "../lib/timeline";
import { nameOf } from "../lib/methods";
import { loadBundle, loadIndex, type Bundle } from "../lib/types";
import { math, rich } from "../render/caption";
import { loadResults, tiles } from "../render/findings";
import { playground } from "../render/playground";
import { GraphView } from "../render/graphView";
import { legend } from "../render/legend";
import { boundChart, karpTable } from "../render/panels";
import { cycleSpeed, playbackSpeed, speedLabel } from "../render/player";

interface Step {
  graph: string;
  method: string;
  show: "start" | "end" | "play";
  html: string; // $tex$ allowed
}

// Established results are named as such; the cascade is our proposal.
const STEPS: Step[] = [
  {
    graph: "proposal",
    method: "scc_karp",
    show: "start",
    html: `<h2>An MDP is a graph</h2>
      <p>Circles are states, arrows are moves with their rewards. Rings group states that can all reach
      each other: strongly connected components (SCCs). Leave one and you can't come back.</p>`,
  },
  {
    graph: "proposal",
    method: "scc_karp",
    show: "play",
    html: `<h2>Solve SCCs, last ones first</h2>
      <p>Each SCC $K$ is worth $g^* = \\max(\\lambda(K), D(K))$: its best loop $\\lambda$ (Karp's
      algorithm), or the best place you can leave to, $D$.</p>`,
  },
  {
    graph: "proposal",
    method: "cascade",
    show: "play",
    html: `<h2>Our idea: prove it can't win</h2>
      <p>If a cheap upper bound on $\\lambda(K)$ is already $\\le D(K)$, no loop inside beats leaving.
      Skip Karp. Here $\\delta_2 = 3 \\le D = 3$.</p>`,
  },
  {
    graph: "chain-rise",
    method: "cascade",
    show: "play",
    html: `<h2>When it pays off</h2>
      <p>Each SCC worse than the next: all but the last are skipped. <b>12</b> relaxations instead of
      <b>60</b>.</p>`,
  },
  {
    graph: "chain-fall",
    method: "cascade",
    show: "play",
    html: `<h2>When it can't</h2>
      <p>Each SCC better than the next: $\\lambda(K) > D(K)$, so nothing can be skipped. Same work as
      plain Karp.</p>`,
  },
  {
    graph: "asadi",
    method: "howard",
    show: "play",
    html: `<h2>Another way: Howard</h2>
      <p>Pick moves, see what they earn, switch to better ones, repeat. Usually fast, but on this graph
      <b>606</b> relaxations to Karp's <b>144</b>.</p>`,
  },
  {
    graph: "dasdan",
    method: "hybrid",
    show: "play",
    html: `<h2>Our hybrid: skip test, then Howard</h2>
      <p>On a benchmark graph: <b>95</b> relaxations. Karp needs 103, Howard 214.</p>`,
  },
  {
    graph: "dasdan",
    method: "hybrid",
    show: "end",
    html: `<h2>Same answer, different work</h2>
      <p><a class="button" href="./compare.html">Race all four on ten graphs →</a></p>`,
  },
];

const $ = <T extends HTMLElement>(sel: string) => document.querySelector<T>(sel)!;

const bundles = new Map<string, Promise<Bundle>>();
const getBundle = (id: string) => {
  if (!bundles.has(id)) bundles.set(id, loadBundle(id));
  return bundles.get(id)!;
};

let view: { key: string; graph: GraphView; frames: Frame[]; bundle: Bundle } | null = null;
let timer: number | null = null;
let current = -1;
let shown = 0; // index of the frame on the stage

const narrow = () => window.matchMedia("(max-width: 899px)").matches;

function paint(frame: Frame) {
  if (!view) return;
  shown = Math.max(0, view.frames.indexOf(frame));
  view.graph.show(frame);
  $("#stage-caption").innerHTML = rich(frame.caption);
  $("#stage-work").textContent = frame.work ? `${frame.work} relaxation${frame.work === 1 ? "" : "s"}` : "";
  $("#stage-detail").replaceChildren(
    ...[karpTable(frame, view.bundle), boundChart(frame)].filter((x): x is HTMLElement => x !== null),
  );
}

function stop() {
  if (timer !== null) window.clearInterval(timer);
  timer = null;
}

// Play the current view's frames from `from` to the end, at the shared playback speed.
function play(from: number) {
  stop();
  if (!view) return;
  const list = view.frames;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    paint(list[list.length - 1]);
    return;
  }
  let i = from;
  paint(list[i]);
  timer = window.setInterval(() => {
    i += 1;
    paint(list[i]);
    if (i >= list.length - 1) stop();
  }, 1100 / playbackSpeed());
}

async function enter(index: number) {
  if (index === current) return;
  current = index;
  const step = STEPS[index];
  stop();

  const bundle = await getBundle(step.graph);
  if (current !== index) return; // the reader scrolled on while it loaded
  const key = `${step.graph}/${step.method}`;
  if (view?.key !== key) {
    // Keep the drawing small enough on a phone that the step's text still shows under the stage.
    const graph = new GraphView($("#stage-graph"), bundle, () => window.innerHeight * (narrow() ? 0.34 : 0.5));
    view = { key, graph, frames: frames(bundle, step.method), bundle };
    $("#stage-title").textContent = `${bundle.title} · ${nameOf(step.method)}`;
    $("#stage-legend").replaceChildren(legend(graph.gains, false));
  }
  const list = view.frames;
  $<HTMLButtonElement>("#replay").hidden = step.show !== "play";
  if (step.show === "start") paint({ ...list[0], caption: bundle.blurb });
  else if (step.show === "end") paint(list[list.length - 1]);
  else play(0);
}

function main() {
  const steps = $("#steps");
  // Typeset from the source, before the browser turns ">" into "&gt;".
  const typeset = (html: string) => html.split("$").map((piece, i) => (i % 2 ? math(piece) : piece)).join("");
  steps.innerHTML = STEPS.map((s, i) => `<section class="step" data-index="${i}">${typeset(s.html)}</section>`).join("");

  // The step crossing the middle of the screen is the one being read.
  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const el = entry.target as HTMLElement;
        document.querySelectorAll(".step.active").forEach((s) => s.classList.remove("active"));
        el.classList.add("active");
        enter(Number(el.dataset.index));
      }
    },
    { rootMargin: "-45% 0px -45% 0px" },
  );
  steps.querySelectorAll(".step").forEach((s) => observer.observe(s));
  enter(0);

  $("#replay").addEventListener("click", () => play(0));
  const speed = $("#speed");
  speed.textContent = speedLabel();
  speed.addEventListener("click", () => {
    cycleSpeed();
    speed.textContent = speedLabel();
    if (timer !== null) play(shown); // carry on from here at the new speed
  });

  playground($("#playground"));

  loadResults()
    .then((r) => ($("#tiles").innerHTML = tiles(r)))
    .catch(() => ($("#found").hidden = true));

  loadIndex()
    .then((index) => ($("#backend").textContent = `Data from dmdp at ${index.backend.commit}.`))
    .catch(() => {});
}

main();
