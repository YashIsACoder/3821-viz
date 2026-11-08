// What each method is called on the page. A method the page doesn't know keeps its id.
export const NAMES: Record<string, string> = {
  scc_karp: "SCC + Karp",
  cascade: "Cascade (ours)",
  hybrid: "Hybrid (ours)",
  howard: "Howard",
};

// For tight spots: "Karp" rather than "SCC + Karp".
export const SHORT: Record<string, string> = {
  scc_karp: "Karp",
  cascade: "Cascade",
  hybrid: "Hybrid",
  howard: "Howard",
};

export const nameOf = (m: string) => NAMES[m] ?? m;
export const shortNameOf = (m: string) => SHORT[m] ?? m;
