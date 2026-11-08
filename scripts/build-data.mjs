// Builds public/data/*.json from the dmdp backend.
//
//   npm run data                     rebuild from the backend commit pinned in backend.ref
//   npm run data -- --update         rebuild from whatever the backend checkout is at, and pin that
//   DMDP_REPO=/path/to/3821-Research npm run data
//
// The backend is the research repo (YashIsACoder/3821-Research), checked out next to this one
// by default. For every graph in graphs.json this runs `dmdp viz` for each method, checks the
// runs agree, and writes one bundle the site can load. The backend repo is private, so the
// bundles are committed here and the site itself never needs the C++ code.
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const REPO = resolve(process.env.DMDP_REPO ?? join(ROOT, "..", "COMP3821-Research"));
const CLI = process.env.DMDP_CLI ?? join(REPO, "dmdp", "build", "dmdp");
const CASES = join(REPO, "dmdp", "tests", "cases");
const OUT = join(ROOT, "public", "data");

const REF_FILE = join(ROOT, "backend.ref");
const FORMAT = 1; // the `dmdp viz` format this site reads (src/lib/types.ts)
const METHODS = ["scc_karp", "cascade", "howard"];
const MAX_STATES = 40; // bigger graphs are unreadable as a drawing
const MAX_EVENTS = 2000; // keeps each bundle small enough for a phone

if (!existsSync(CLI)) {
  console.error(`dmdp CLI not found at ${CLI}. Build it with: make -C ${join(REPO, "dmdp")}`);
  process.exit(1);
}

const dmdp = (...args) => execFileSync(CLI, args.map(String), { encoding: "utf8" });
const git = (...args) => execFileSync("git", ["-C", REPO, ...args], { encoding: "utf8" }).trim();

function graphFile(entry, scratch) {
  if (entry.case) return join(CASES, `${entry.case}.txt`);
  const path = join(scratch, `${entry.id}.txt`);
  writeFileSync(path, dmdp("gen", ...entry.gen));
  return path;
}

function check(cond, entry, message) {
  if (!cond) throw new Error(`${entry.id}: ${message}`);
}

function build(entry, scratch) {
  const file = graphFile(entry, scratch);
  const methods = {};
  let graph, sccs;
  for (const method of METHODS) {
    const run = JSON.parse(dmdp("viz", method, file, ...(method === "howard" ? [] : ["--trace-rows"])));
    check((run.format ?? 1) === FORMAT, entry, `dmdp viz wrote format ${run.format}, this site reads ${FORMAT}`);
    graph = run.graph;
    sccs = run.sccs;
    methods[method] = { result: run.result, trace: run.trace };
  }

  check(graph.n <= MAX_STATES, entry, `${graph.n} states, the limit is ${MAX_STATES}`);
  const gains = JSON.stringify(methods.scc_karp.result.gain);
  for (const method of METHODS) {
    const { result, trace } = methods[method];
    check(JSON.stringify(result.gain) === gains, entry, `${method} gains differ from scc_karp`);
    check(trace.length <= MAX_EVENTS, entry, `${method} trace has ${trace.length} events`);
    check(trace.every((e) => typeof e.relaxations === "number"), entry, `${method} trace has no relaxations (old backend?)`);
  }
  const outcomes = methods.cascade.trace.filter((e) => ["scc", "prune", "trivial"].includes(e.type));
  check(outcomes.length === sccs.comps.length, entry, "cascade must report one outcome per SCC");

  // Brute force is the ground truth when the graph is small enough for it.
  let bruteforce = null;
  try {
    bruteforce = JSON.parse(dmdp("solve", "bruteforce", file, "--json")).gain;
  } catch {
    // too many policies: fine, the three methods still have to agree
  }
  if (bruteforce) check(JSON.stringify(bruteforce) === gains, entry, "gains differ from brute force");

  return { id: entry.id, title: entry.title, blurb: entry.blurb, graph, sccs, methods, bruteforce };
}

const manifest = JSON.parse(readFileSync(join(ROOT, "graphs.json"), "utf8"));
const backend = {
  commit: git("rev-parse", "--short", "HEAD"),
  dirty: git("status", "--porcelain", "--untracked-files=no") !== "",
};
if (backend.dirty) console.warn(`warning: ${REPO} has uncommitted changes; the data will not be reproducible`);

// The data is pinned to one backend commit, so a rebuild gives the same files unless you ask
// for a newer backend on purpose.
const pinned = existsSync(REF_FILE) ? readFileSync(REF_FILE, "utf8").trim() : null;
const update = process.argv.includes("--update") || !pinned;
if (!update && git("rev-parse", "HEAD") !== git("rev-parse", pinned)) {
  console.error(`The backend checkout is at ${backend.commit} but backend.ref pins ${pinned}.\n` +
    `Check out ${pinned} in ${REPO}, or run with --update to rebuild from ${backend.commit}.`);
  process.exit(1);
}

const scratch = mkdtempSync(join(tmpdir(), "dmdp-viz-"));
mkdirSync(OUT, { recursive: true });
const index = [];
try {
  for (const entry of manifest) {
    const bundle = build(entry, scratch);
    writeFileSync(join(OUT, `${entry.id}.json`), JSON.stringify({ ...bundle, backend }));
    const work = Object.fromEntries(METHODS.map((m) => [m, bundle.methods[m].result.stats.relaxations]));
    index.push({ id: entry.id, title: entry.title, n: bundle.graph.n, sccs: bundle.sccs.comps.length, work });
    console.log(`${entry.id.padEnd(12)} n=${String(bundle.graph.n).padStart(2)}  ` +
      METHODS.map((m) => `${m} ${work[m]}`).join("  "));
  }
} finally {
  rmSync(scratch, { recursive: true, force: true });
}
writeFileSync(join(OUT, "index.json"), JSON.stringify({ backend, graphs: index }, null, 1));
if (update) writeFileSync(REF_FILE, `${backend.commit}\n`); // only once every graph built cleanly
console.log(`wrote ${index.length} graphs from backend ${backend.commit}`);
