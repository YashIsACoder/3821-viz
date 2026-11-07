// Positions for drawing a graph: one column per level of the SCC condensation (sources on
// the left, sinks on the right), and each SCC's states on a small circle.
//
// Small on purpose. It runs in the browser in a few microseconds for the graphs we show,
// and gives the same picture every time for the same input.
import type { Graph, Sccs } from "./types";

export interface Point {
  x: number;
  y: number;
}

export interface Cluster {
  id: number; // SCC id
  center: Point;
  radius: number; // 0 for a single state
}

export interface Layout {
  pos: Point[]; // by state
  clusters: Cluster[]; // by SCC id
  width: number;
  height: number;
}

const STATE_GAP = 46; // distance between neighbouring states on a ring
const COLUMN_GAP = 76;
const ROW_GAP = 64; // room for the gain and status labels under each SCC
const PAD = 36;
const LABEL_ROOM = 44; // the same, under the last SCC

function ringRadius(size: number): number {
  if (size <= 1) return 0;
  if (size === 2) return STATE_GAP / 2;
  return Math.max(30, (STATE_GAP * size) / (2 * Math.PI));
}

export function layout(g: Graph, scc: Sccs, vertical = false): Layout {
  const k = scc.comps.length;
  const succ: Set<number>[] = Array.from({ length: k }, () => new Set());
  const pred: Set<number>[] = Array.from({ length: k }, () => new Set());
  for (const e of g.edges) {
    const a = scc.comp_of[e.from];
    const b = scc.comp_of[e.to];
    if (a !== b) {
      succ[a].add(b);
      pred[b].add(a);
    }
  }

  // depth = longest path to a sink. Ids are sinks first, so successors are already done.
  const depth = new Array<number>(k).fill(0);
  for (let c = 0; c < k; c++) {
    for (const d of succ[c]) depth[c] = Math.max(depth[c], depth[d] + 1);
  }
  const maxDepth = Math.max(0, ...depth);
  const columns: number[][] = Array.from({ length: maxDepth + 1 }, () => []);
  for (let c = k - 1; c >= 0; c--) columns[maxDepth - depth[c]].push(c);

  // A few barycentre sweeps to cut down on crossing edges.
  const rank = new Array<number>(k).fill(0);
  const setRanks = () => columns.forEach((col) => col.forEach((c, i) => (rank[c] = i)));
  setRanks();
  const barycentre = (c: number, side: Set<number>) =>
    side.size ? [...side].reduce((sum, d) => sum + rank[d], 0) / side.size : rank[c];
  for (let sweep = 0; sweep < 4; sweep++) {
    const forward = sweep % 2 === 0;
    const order = forward ? columns.slice(1) : columns.slice(0, -1).reverse();
    for (const col of order) {
      const key = new Map(col.map((c) => [c, barycentre(c, forward ? pred[c] : succ[c])]));
      col.sort((a, b) => key.get(a)! - key.get(b)! || a - b);
      setRanks();
    }
  }

  // Place the columns, centring each one on the tallest.
  const radius = scc.comps.map((comp) => ringRadius(comp.length));
  const extent = (col: number[]) => col.reduce((sum, c) => sum + 2 * radius[c], 0) + ROW_GAP * (col.length - 1);
  const tallest = Math.max(...columns.map(extent));
  const clusters: Cluster[] = new Array(k);
  let x = PAD;
  for (const col of columns) {
    const wide = Math.max(...col.map((c) => radius[c]));
    let y = PAD + (tallest - extent(col)) / 2;
    for (const c of col) {
      clusters[c] = { id: c, center: { x: x + wide, y: y + radius[c] }, radius: radius[c] };
      y += 2 * radius[c] + ROW_GAP;
    }
    x += 2 * wide + COLUMN_GAP;
  }

  // States around their ring, starting at the top and going clockwise.
  const pos: Point[] = new Array(g.n);
  for (const cluster of clusters) {
    const comp = scc.comps[cluster.id];
    comp.forEach((v, i) => {
      const angle = -Math.PI / 2 + (2 * Math.PI * i) / comp.length;
      pos[v] = {
        x: cluster.center.x + cluster.radius * Math.cos(angle),
        y: cluster.center.y + cluster.radius * Math.sin(angle),
      };
    });
  }

  const width = x - COLUMN_GAP + PAD;
  const height = tallest + 2 * PAD;
  if (vertical) return transpose({ pos, clusters, width: width + LABEL_ROOM, height });
  return { pos, clusters, width, height: height + LABEL_ROOM };
}

// Same picture, flowing top to bottom instead of left to right (for narrow screens).
function transpose(l: Layout): Layout {
  const flip = (p: Point): Point => ({ x: p.y, y: p.x });
  return {
    pos: l.pos.map(flip),
    clusters: l.clusters.map((c) => ({ ...c, center: flip(c.center) })),
    width: l.height,
    height: l.width,
  };
}
