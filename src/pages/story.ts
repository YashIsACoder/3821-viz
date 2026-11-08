// The guided story: a sticky stage and text steps. Scrolling a step into view sets what
// the stage shows, and some steps play their method's frames like a short animation.
import "katex/dist/katex.min.css";
import "../style.css";
import "./story.css";
import { frames, type Frame } from "../lib/timeline";
import { loadBundle, loadIndex, type Bundle } from "../lib/types";
import { math, rich } from "../render/caption";
import { GraphView } from "../render/graphView";
import { boundChart, karpTable } from "../render/panels";

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
    graph: "asadi",
    method: "howard",
    show: "end",
    html: `<h2>Race them yourself</h2>
      <p>Every method gets the same exact gains. They differ in how much work it takes.
      <a href="./compare.html">Watch all three on ten graphs →</a></p>`,
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

function paint(frame: Frame) {
  if (!view) return;
  view.graph.show(frame);
  $("#stage-caption").innerHTML = rich(frame.caption);
  $("#stage-work").textContent = frame.work ? `${frame.work} relaxations` : "";
  $("#stage-detail").replaceChildren(
    ...[karpTable(frame, view.bundle), boundChart(frame)].filter((x): x is HTMLElement => x !== null),
  );
}

async function enter(index: number) {
  if (index === current) return;
  current = index;
  const step = STEPS[index];
  if (timer !== null) window.clearInterval(timer);
  timer = null;

  const bundle = await getBundle(step.graph);
  if (current !== index) return; // the reader scrolled on while it loaded
  const key = `${step.graph}/${step.method}`;
  if (view?.key !== key) {
    view = { key, graph: new GraphView($("#stage-graph"), bundle), frames: frames(bundle, step.method), bundle };
    $("#stage-title").textContent = `${bundle.title} · ${step.method.replace("_", " + ")}`;
  }
  const list = view.frames;
  if (step.show === "start") {
    paint({ ...list[0], caption: bundle.blurb });
  } else if (step.show === "end") {
    paint(list[list.length - 1]);
  } else {
    let i = 0;
    paint(list[0]);
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) {
      paint(list[list.length - 1]);
      return;
    }
    timer = window.setInterval(() => {
      i += 1;
      paint(list[i]);
      if (i >= list.length - 1 && timer !== null) {
        window.clearInterval(timer);
        timer = null;
      }
    }, 1100);
  }
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

  loadIndex()
    .then((index) => ($("#backend").textContent = `Data from dmdp at ${index.backend.commit}.`))
    .catch(() => {});
}

main();
