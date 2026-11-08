import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { layout } from "../src/lib/layout";
import { compare, NEG_INF, parse, tex, text } from "../src/lib/rational";
import { frameAtWork, frames } from "../src/lib/timeline";
import { METHODS, type Bundle } from "../src/lib/types";

const bundle = (id: string): Bundle => JSON.parse(readFileSync(`public/data/${id}.json`, "utf8"));

describe("rational", () => {
  it("parses and compares exactly", () => {
    expect(compare(parse("7/3"), parse("2"))).toBe(1);
    expect(compare(parse("-1/2"), parse("-1/3"))).toBe(-1);
    expect(compare(parse("4/2"), parse("2"))).toBe(0);
    expect(compare(NEG_INF, parse("-1000000"))).toBe(-1);
    expect(compare(parse("-inf"), NEG_INF)).toBe(0);
  });

  it("formats for KaTeX and plain text", () => {
    expect(tex(parse("7/3"))).toBe("\\tfrac{7}{3}");
    expect(tex(parse("-1/2"))).toBe("-\\tfrac{1}{2}");
    expect(tex(parse("5"))).toBe("5");
    expect(text(parse("-inf"))).toBe("−∞");
  });
});

describe("timeline", () => {
  it("replays cascade on the worked example", () => {
    const list = frames(bundle("proposal"), "cascade");
    const last = list[list.length - 1];
    expect(last.sccs.map((s) => s.status)).toEqual(["solved", "skipped"]);
    expect(last.gains).toEqual(["3", "3", "3"]);
    // delta_1 = 4 and delta_2 = 3 against D = 3 (proposal, section 2)
    const bounds = list.flatMap((f) => f.bounds?.points ?? []);
    expect(bounds.filter((p) => p.rule === "delta").map((p) => p.bound)).toContain("3");
  });

  it("ends on every method's final gains and work", () => {
    for (const id of ["proposal", "chain-rise", "dasdan"]) {
      const b = bundle(id);
      for (const method of METHODS) {
        const list = frames(b, method);
        const last = list[list.length - 1];
        expect(last.gains).toEqual(b.methods[method].result.gain);
        expect(last.work).toBe(b.methods[method].result.stats.relaxations);
        for (let i = 1; i < list.length; i++) expect(list[i].work).toBeGreaterThanOrEqual(list[i - 1].work);
      }
    }
  });

  it("says when the hybrid found a cycle mean with Howard", () => {
    const captions = frames(bundle("dasdan"), "hybrid").map((f) => f.caption);
    expect(captions.some((c) => c.includes("(found by Howard)"))).toBe(true);
  });

  it("finds the frame reached by a given amount of work", () => {
    const list = frames(bundle("chain-rise"), "scc_karp");
    expect(frameAtWork(list, 0)).toBe(0);
    expect(frameAtWork(list, Infinity)).toBe(list.length - 1);
    const mid = frameAtWork(list, 30);
    expect(list[mid].work).toBeLessThanOrEqual(30);
    expect(list[mid + 1].work).toBeGreaterThan(30);
  });
});

describe("layout", () => {
  it("puts sinks to the right of everything that reaches them", () => {
    const b = bundle("dasdan");
    const l = layout(b.graph, b.sccs);
    for (const e of b.graph.edges) {
      const from = b.sccs.comp_of[e.from];
      const to = b.sccs.comp_of[e.to];
      if (from !== to) expect(l.clusters[from].center.x).toBeLessThan(l.clusters[to].center.x);
    }
    expect(l.pos.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y))).toBe(true);
  });
});
