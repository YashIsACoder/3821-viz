// What each method is called on the page. A method the page doesn't know keeps its id.
export const NAMES: Record<string, string> = {
  scc_karp: "SCC + Karp",
  cascade: "Cascade (ours)",
  hybrid: "Hybrid (ours)",
  howard: "Howard",
};

export const nameOf = (m: string) => NAMES[m] ?? m;
