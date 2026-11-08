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
    html: `<h2>A deterministic MDP is a graph</h2>
      <p>States are the circles. Each arrow is an action: take it and you move along it and earn its reward.
      Pick one action per state (a <em>policy</em>) and follow it forever, and you end up going round a cycle.
      Your long-run average reward, the <em>gain</em> $g^*$, is that cycle's mean.</p>
      <p>The shaded rings are the strongly connected components (SCCs): groups of states that can all reach
      each other. Once you leave an SCC you can never come back.</p>`,
  },
  {
    graph: "proposal",
    method: "scc_karp",
    show: "play",
    html: `<h2>Solve the SCCs, sinks first</h2>
      <p>The standard pipeline works backwards from the SCCs you can't leave. For each SCC $K$:</p>
      <p>$\\lambda(K)$ is the best cycle mean inside it, found with Karp's algorithm (1978). Its table holds
      $D_k(v)$, the best reward of a $k$-step walk into $v$.</p>
      <p>$D(K)$, the <em>exit value</em>, is the best gain of an SCC you can step into.</p>
      <p>Then $g^*(K) = \\max(\\lambda(K), D(K))$: stay on your best cycle, or leave for something better.</p>`,
  },
  {
    graph: "proposal",
    method: "cascade",
    show: "play",
    html: `<h2>Our idea: prove you can skip it</h2>
      <p>Karp costs $O(n_K m_K)$ per SCC. But if some cheap upper bound $U \\ge \\lambda(K)$ is already
      $\\le D(K)$, no cycle inside $K$ can beat leaving, so $g^*(K) = D(K)$ and Karp can stop.</p>
      <p>The cascade tries the largest edge weight first, then $\\delta_k = \\max_v (D_k(v) - D_{k-1}(v))$ for
      $k = 1, 2, 4, \\dots$, reusing the rows it builds. Here $\\delta_2 = 3 \\le D = 3$.</p>`,
  },
  {
    graph: "chain-rise",
    method: "cascade",
    show: "play",
    html: `<h2>When it pays off</h2>
      <p>Five SCCs in a chain, each worse than the one after it. Every SCC except the sink is skipped by the
      first, cheapest test.</p>
      <p>The cascade does 12 relaxations here; running Karp on every SCC takes 60.</p>`,
  },
  {
    graph: "chain-fall",
    method: "cascade",
    show: "play",
    html: `<h2>When it can't</h2>
      <p>Reverse the chain and every SCC beats everything after it: $\\lambda(K) > D(K)$. A sound bound can
      never be below $\\lambda(K)$, so nothing can be skipped, and the cascade ends up doing exactly the
      same work as plain Karp.</p>
      <p>The bound also stalls on SCCs whose best cycles are long, which we measured separately (experiment E7).</p>`,
  },
  {
    graph: "asadi",
    method: "howard",
    show: "play",
    html: `<h2>A different approach: Howard</h2>
      <p>Policy iteration (Howard, 1960) ignores the SCC structure. It starts from a policy, works out what it
      earns, switches every state to a better action, and repeats. It is often fast in practice, but on this
      graph from Asadi et al. (2025) it needs 606 relaxations to Karp's 144.</p>`,
  },
  {
    graph: "dasdan",
    method: "hybrid",
    show: "play",
    html: `<h2>Our hybrid: test first, then Howard</h2>
      <p>The hybrid puts the two ideas together. Going SCC by SCC, it tries the cascade's cheapest bound
      first. Any SCC that can't be skipped goes to Howard, and Karp takes over if Howard runs too long.</p>
      <p>On this graph from Dasdan's benchmark suite it skips two SCCs and needs 95 relaxations, the fewest
      of the four methods. Karp on every SCC takes 103, and Howard on the whole graph 214.</p>`,
  },
  {
    graph: "dasdan",
    method: "hybrid",
    show: "end",
    html: `<h2>Race them yourself</h2>
      <p>Every method gets the same exact gains. They differ in how much work it takes, and which one
      wins depends on the graph.</p>
      <p><a href="./compare.html">Watch all four on ten graphs →</a></p>`,
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

  // The basics use a little maths too.
  document.querySelectorAll<HTMLElement>("#mdp dd").forEach((dd) => (dd.innerHTML = typeset(dd.innerHTML)));

  loadResults()
    .then((r) => ($("#tiles").innerHTML = tiles(r)))
    .catch(() => ($("#found").hidden = true));

  loadIndex()
    .then((index) => ($("#backend").textContent = `Data from dmdp at ${index.backend.commit}.`))
    .catch(() => {});
}

main();
