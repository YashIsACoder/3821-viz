// Turns one method's trace into frames: what the picture should show after each event.
// Frame 0 is the graph before the method starts; the last frame is the finished result.
// Folding the whole trace up front makes scrubbing backwards free.
import { isNegInf, leq, parse, tex } from "./rational";
import type { Bundle, KnownEvent, Method, TraceEvent } from "./types";

export type SccStatus = "waiting" | "working" | "solved" | "skipped" | "trivial";

export interface SccState {
  status: SccStatus;
  gain?: string;
}

export interface BoundPoint {
  rule: "max_edge" | "delta";
  k: number;
  bound: string;
}

export interface Frame {
  work: number; // relaxations so far
  caption: string; // text with $tex$ pieces, see render/caption.ts
  sccs: SccState[];
  active: number | null; // SCC being worked on
  karp: { id: number; rows: (number | null)[][] } | null; // rows 1..k of the active SCC
  bounds: { id: number; D: string; points: BoundPoint[] } | null;
  gains: (string | null)[]; // per state, null while unknown
  policy: number[] | null; // edge ids to highlight
}

const texOf = (value: string) => tex(parse(value));
const math = (s: string) => `$${s}$`;
const q = (s: string) => math(texOf(s));

function describe(event: TraceEvent): string {
  const e = event as KnownEvent;
  switch (e.type) {
    case "karp_row":
      return `Karp's table for SCC ${e.id}: row ${math(`D_{${e.k}}`)}, the best walk of ${e.k} step${e.k === 1 ? "" : "s"} into each state.`;
    case "bound": {
      const name = e.rule === "max_edge" ? "the largest edge weight" : math(`\\delta_{${e.k}}`);
      const skip = leq(parse(e.bound), parse(e.D));
      return `SCC ${e.id}: ${name} gives ${math(`U = ${texOf(e.bound)}`)} against the exit value ${math(`D = ${texOf(e.D)}`)}. ` +
        (skip ? `${math("U \\le D")}, so no cycle here can beat leaving.` : `${math("U > D")}, not enough to skip yet.`);
    }
    case "prune":
      return `SCC ${e.id} skipped: ${math(`U = ${texOf(e.bound)} \\le D = ${texOf(e.D)}`)}, so ${math("g^* = D")} without finishing Karp.`;
    case "trivial":
      return `SCC ${e.id} has no cycle, so its gain is the exit value: ${math(`g^* = D =`)} ${q(e.gain)}.`;
    case "scc":
      if (isNegInf(parse(e.lambda))) {
        return `SCC ${e.id} has no cycle, so its gain is the exit value: ${math("g^* = D =")} ${q(e.gain)}.`;
      }
      if (isNegInf(parse(e.D))) {
        return `SCC ${e.id} is a sink: its gain is its best cycle mean, ${math(`\\lambda = ${texOf(e.lambda)}`)}.`;
      }
      return `SCC ${e.id}: best cycle ${math(`\\lambda = ${texOf(e.lambda)}`)}, exit value ${math(`D = ${texOf(e.D)}`)}, ` +
        `so ${math(`g^* = \\max(\\lambda, D) = ${texOf(e.gain)}`)}.`;
    case "howard_iter":
      return e.iteration === 1
        ? "Howard starts from the best-looking action in every state and works out what that policy earns."
        : `Round ${e.iteration}: some states switched to a better action. Evaluate the new policy.`;
    default: {
      // An event this page doesn't know: say what it was, so a new solver still replays.
      const id = (event as { id?: number }).id;
      return `${event.type.replace(/_/g, " ")}${id === undefined ? "" : ` (SCC ${id})`}`;
    }
  }
}

export function frames(bundle: Bundle, method: Method): Frame[] {
  const { graph, sccs, methods } = bundle;
  const { result, trace } = methods[method];

  let frame: Frame = {
    work: 0,
    caption: "",
    sccs: sccs.comps.map(() => ({ status: "waiting" })),
    active: null,
    karp: null,
    bounds: null,
    gains: new Array(graph.n).fill(null),
    policy: null,
  };
  const out: Frame[] = [frame];

  const settle = (id: number, status: SccStatus, gain: string) => {
    frame.sccs[id] = { status, gain };
    for (const v of sccs.comps[id]) frame.gains[v] = gain;
    frame.active = id;
  };

  for (const event of trace) {
    // Copy what this event can change; everything else is shared with the previous frame.
    frame = { ...frame, sccs: [...frame.sccs], gains: [...frame.gains], work: event.relaxations, caption: describe(event) };
    const e = event as KnownEvent;
    switch (e.type) {
      case "karp_row": {
        const rows = frame.karp?.id === e.id ? [...frame.karp.rows, e.row] : [e.row];
        frame.karp = { id: e.id, rows };
        if (frame.bounds?.id !== e.id) frame.bounds = null;
        frame.sccs[e.id] = { status: "working" };
        frame.active = e.id;
        break;
      }
      case "bound": {
        const points = frame.bounds?.id === e.id ? [...frame.bounds.points] : [];
        points.push({ rule: e.rule, k: e.k, bound: e.bound });
        frame.bounds = { id: e.id, D: e.D, points };
        if (frame.karp?.id !== e.id) frame.karp = null;
        frame.sccs[e.id] = { status: "working" };
        frame.active = e.id;
        break;
      }
      case "prune":
        settle(e.id, "skipped", e.D);
        break;
      case "trivial":
        settle(e.id, "trivial", e.gain);
        break;
      case "scc":
        settle(e.id, isNegInf(parse(e.lambda)) ? "trivial" : "solved", e.gain);
        if (frame.karp?.id !== e.id) frame.karp = null;
        if (frame.bounds?.id !== e.id) frame.bounds = null;
        break;
      case "howard_iter":
        frame.gains = [...e.gain];
        frame.policy = e.policy;
        break;
    }
    out.push(frame);
  }

  const skipped = result.stats.sccs_skipped;
  out.push({
    ...frame,
    work: result.stats.relaxations,
    active: null,
    karp: null,
    bounds: null,
    gains: [...result.gain],
    policy: result.policy,
    caption:
      `Done after ${result.stats.relaxations} relaxations` +
      (method === "howard" ? ` and ${result.stats.iterations} rounds. ` : skipped ? `, with ${skipped} SCC${skipped === 1 ? "" : "s"} skipped. ` : ". ") +
      "Highlighted: an optimal action in every state.",
  });
  return out;
}

// The last frame whose work is at most `work`: how far a method has got on a shared clock.
export function frameAtWork(list: Frame[], work: number): number {
  let lo = 0;
  let hi = list.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (list[mid].work <= work) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}
