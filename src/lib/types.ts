// The shape of public/data/<id>.json, written by scripts/build-data.mjs from `dmdp viz`.
// Field meanings are documented in the backend's dmdp/README.md ("Visualising a run").

// Any solver name the backend knows. These three are drawn first, in this order;
// anything else in a bundle (a new solver, say) is still shown, after them.
export type Method = string;
export const METHODS: Method[] = ["scc_karp", "cascade", "hybrid", "howard"];

// The `format` that `dmdp viz` writes. Older backends wrote none, which means 1.
export const FORMAT = 1;

export interface Edge {
  id: number;
  from: number;
  to: number;
  weight: number;
}

export interface Graph {
  n: number;
  edges: Edge[];
}

// Component ids are sinks first: every edge between components goes from a higher id to a lower one.
export interface Sccs {
  comp_of: number[];
  comps: number[][];
}

export interface Stats {
  relaxations: number;
  karp_rows: number;
  sccs: number;
  sccs_skipped: number;
  iterations: number;
  howard_fallbacks?: number; // hybrid only
  seconds: number;
}

export interface Result {
  method: string;
  n: number;
  gain: string[]; // exact, e.g. "7/2"
  policy: number[] | null; // edge ids
  stats: Stats;
}

interface Base {
  step: number;
  relaxations: number; // running total when the event happened
}

export type KnownEvent =
  | (Base & { type: "scc"; id: number; size: number; lambda: string; D: string; gain: string; reason?: string; solver?: string })
  | (Base & { type: "trivial"; id: number; size: number; D: string; gain: string })
  | (Base & { type: "bound"; id: number; rule: "max_edge" | "delta"; k: number; bound: string; D: string })
  | (Base & { type: "prune"; id: number; size: number; rule: "max_edge" | "delta"; k: number; bound: string; D: string })
  | (Base & { type: "karp_row"; id: number; k: number; row: (number | null)[] })
  | (Base & { type: "howard_iter"; iteration: number; policy: number[]; gain: string[] });

// An event type this page doesn't know yet still replays, with a generic caption.
export type TraceEvent = KnownEvent | (Base & { type: string; id?: number });

export interface Run {
  result: Result;
  trace: TraceEvent[];
}

// Which backend commit made the data (null for a file opened by the user).
export interface Backend {
  commit: string;
  dirty: boolean;
}

export interface Bundle {
  id: string;
  title: string;
  blurb: string;
  graph: Graph;
  sccs: Sccs;
  methods: Record<Method, Run>;
  bruteforce: string[] | null;
  backend: Backend | null;
}

// What `dmdp viz <method> graph.txt` prints.
export interface VizOutput {
  format?: number;
  graph: Graph;
  sccs: Sccs;
  result: Result;
  trace: TraceEvent[];
}

// The methods in a bundle, known ones first.
export function methodsOf(bundle: Bundle): Method[] {
  const present = Object.keys(bundle.methods);
  return [...METHODS.filter((m) => present.includes(m)), ...present.filter((m) => !METHODS.includes(m)).sort()];
}

// Turns any JSON a user opens into a bundle: either a site bundle, or one or more `dmdp viz`
// outputs for the same graph.
export function toBundle(data: unknown, name: string): Bundle {
  const runs = (Array.isArray(data) ? data : [data]) as Partial<Bundle & VizOutput>[];
  if (runs.length === 1 && runs[0].methods) return runs[0] as Bundle;
  const methods: Record<Method, Run> = {};
  for (const run of runs) {
    if (!run.graph || !run.sccs || !run.result || !run.trace) {
      throw new Error("not a dmdp viz file (expected graph, sccs, result and trace)");
    }
    if ((run.format ?? 1) > FORMAT) {
      throw new Error(`made by a newer dmdp (format ${run.format}); this page reads format ${FORMAT}`);
    }
    if (JSON.stringify(run.graph) !== JSON.stringify(runs[0].graph)) {
      throw new Error("these runs are on different graphs");
    }
    methods[run.result.method] = { result: run.result, trace: run.trace };
  }
  const { graph, sccs } = runs[0] as VizOutput;
  return {
    id: name,
    title: name,
    blurb: `${graph.n} states, ${graph.edges.length} actions, ${sccs.comps.length} SCCs.`,
    graph,
    sccs,
    methods,
    bruteforce: null,
    backend: null,
  };
}

export interface IndexEntry {
  id: string;
  title: string;
  n: number;
  sccs: number;
  work: Record<Method, number>;
}

export async function loadBundle(id: string): Promise<Bundle> {
  const response = await fetch(`./data/${id}.json`);
  if (!response.ok) throw new Error(`could not load graph '${id}'`);
  return response.json();
}

export async function loadIndex(): Promise<{ backend: Backend; graphs: IndexEntry[] }> {
  const response = await fetch("./data/index.json");
  if (!response.ok) throw new Error("could not load the graph list");
  return response.json();
}
