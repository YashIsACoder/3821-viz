// @vitest-environment happy-dom
import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { frames } from "../src/lib/timeline";
import { methodsOf, toBundle, type Bundle } from "../src/lib/types";
import { scoreboard } from "../src/render/charts";
import { circuits, familyBars, tiles } from "../src/render/findings";
import { GraphView } from "../src/render/graphView";
import { boundChart, karpTable } from "../src/render/panels";

const ids = readdirSync("public/data").filter((f) => f.endsWith(".json") && !["index.json", "results.json"].includes(f));
const load = (file: string): Bundle => JSON.parse(readFileSync(`public/data/${file}`, "utf8"));

describe("rendering every curated graph", () => {
  for (const file of ids) {
    it(file, () => {
      const bundle = load(file);
      for (const method of methodsOf(bundle)) {
        const root = document.createElement("div");
        const view = new GraphView(root, bundle);
        expect(root.querySelectorAll(".state")).toHaveLength(bundle.graph.n);
        expect(root.querySelectorAll(".edge")).toHaveLength(bundle.graph.edges.length);
        for (const frame of frames(bundle, method)) {
          view.show(frame);
          karpTable(frame, bundle);
          boundChart(frame);
        }
        // The finished frame highlights exactly one action per state.
        expect(root.querySelectorAll(".edge.policy")).toHaveLength(bundle.graph.n);
      }
    });
  }
});

describe("opening your own runs", () => {
  const b = load("proposal.json");
  const viz = (m: string) => ({ format: 1, graph: b.graph, sccs: b.sccs, ...b.methods[m] });

  it("accepts one or several dmdp viz outputs", () => {
    expect(methodsOf(toBundle(viz("howard"), "one"))).toEqual(["howard"]);
    expect(methodsOf(toBundle([viz("howard"), viz("scc_karp")], "two"))).toEqual(["scc_karp", "howard"]);
  });

  it("rejects files it can't read", () => {
    expect(() => toBundle({ hello: 1 }, "x")).toThrow(/not a dmdp viz file/);
    expect(() => toBundle({ ...viz("howard"), format: 99 }, "x")).toThrow(/newer dmdp/);
  });

  it("replays an event type it doesn't know", () => {
    const run = viz("cascade");
    run.trace = [...run.trace, { step: 99, type: "new_idea", id: 1, relaxations: 7 } as never];
    const list = frames(toBundle(run, "x"), "cascade");
    expect(list.some((f) => f.caption === "new idea (SCC 1)")).toBe(true);
  });
});

describe("the scoreboard", () => {
  const index = JSON.parse(readFileSync("public/data/index.json", "utf8"));
  const info = { name: (m: string) => m, short: (m: string) => m, colour: () => "red" };

  it("has a card per graph and marks the least work", () => {
    const list = document.createElement("ol");
    list.innerHTML = scoreboard(index.graphs, ["scc_karp", "cascade", "hybrid", "howard"], info, "chain-rise");
    expect(list.querySelectorAll(".card")).toHaveLength(index.graphs.length);
    const rise = list.querySelector<HTMLElement>('[data-id="chain-rise"]')!;
    expect(rise.getAttribute("aria-current")).toBe("true");
    expect([...rise.querySelectorAll(".least")].map((n) => n.textContent)).toEqual(["11"]);
  });
});

describe("what we found", () => {
  const results = JSON.parse(readFileSync("public/data/results.json", "utf8"));

  it("quotes the experiment numbers", () => {
    const box = document.createElement("div");
    box.innerHTML = tiles(results) + familyBars(results) + circuits(results);
    expect(box.querySelectorAll(".tile")).toHaveLength(3);
    expect(box.querySelectorAll(".family")).toHaveLength(results.pruning.families.length);
    expect(box.textContent).toContain(`${results.agreement.graphs} graphs`);
    expect(box.textContent).toContain("350 s");
  });
});
