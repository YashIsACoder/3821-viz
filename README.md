# 3821-viz

A small web page that shows the solvers from our COMP3821 research project at work on
deterministic MDPs: how they find the best long-run average reward in every state, and how
much work each one does.

**Live site:** https://yashisacoder.github.io/3821-viz/

<img src="public/qr.svg" alt="QR code for the live site" width="140">

- **The idea** (`index.html`): a short scroll-through story. A DMDP as a graph, SCCs, Karp's
  table, our pruning cascade, and Howard's policy iteration for contrast.
- **Race the methods** (`compare.html`): pick a graph and watch every method on it side by side:
  SCC + Karp, our cascade, our hybrid (cascade bounds, then Howard with a Karp fallback) and Howard.
  The clock counts relaxations, so the method that finishes first did the least work.

## How it connects to the research repo

The algorithms live in the research repo, [3821-Research](https://github.com/YashIsACoder/3821-Research)
(the `dmdp` C++ library). This page never re-implements them. It replays what the library
recorded:

```
3821-Research/dmdp                       3821-viz
  dmdp viz <method> graph.txt   ──JSON──▶  scripts/build-data.mjs  ──▶  public/data/<graph>.json  ──▶  the page
  (graph, SCCs, result, trace)             runs every method, checks they agree,
                                           pins the backend commit in backend.ref
```

The JSON layout and every trace event are documented in the research repo's
`dmdp/README.md`, under "Visualising a run". Its `format` field is checked here: a newer
backend format is refused instead of being drawn wrong.

The research repo is private, so the generated data is committed here and the site builds
without any C++.

## Updating the data

With the research repo checked out next to this one (or set `DMDP_REPO`):

```bash
make -C ../COMP3821-Research/dmdp        # build the dmdp CLI
npm run data                             # rebuild from the commit in backend.ref
npm run data -- --update                 # or: rebuild from the backend as it is now, and pin that
```

The script fails if the methods ever disagree on a gain, if brute force disagrees (on graphs
small enough for it), or if a cascade trace doesn't report every SCC exactly once.

To add a graph, add an entry to `graphs.json`: either `"case"`, a file in the backend's
`dmdp/tests/cases/`, or `"gen"`, the arguments to `dmdp gen`.

## Viewing your own runs

The race page opens any output of `dmdp viz`, not just the graphs above:

```bash
dmdp viz cascade my_graph.txt > cascade.json
dmdp viz howard  my_graph.txt > howard.json
```

Drop one or more of the files on the page, use **Open a run…**, or link to
`compare.html?src=<url of the JSON>`. A method or trace event this page doesn't know yet is
still shown, with a plain caption, so new solvers work without changing the page.

## Working on the page

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # unit tests and a render test of every graph
npm run build      # static site in dist/
npm run qr         # regenerate public/qr.svg (SITE_URL=... for another address)
```

TypeScript and plain DOM/SVG, with KaTeX for the maths and no UI framework. The pieces:

| File | What it does |
| --- | --- |
| `src/lib/types.ts` | the bundle and `dmdp viz` formats, loading, opening user files |
| `src/lib/rational.ts` | exact fractions (`"7/3"`, `"-inf"`) with BigInt |
| `src/lib/layout.ts` | positions: condensation levels left to right, each SCC on a ring |
| `src/lib/timeline.ts` | folds a trace into frames, one per event, with captions |
| `src/render/` | the graph, Karp's table, the bound chart, the play controls |
| `src/pages/` | the story and the race |

Pushing to `main` runs the tests and publishes to GitHub Pages
(Settings → Pages → Source: GitHub Actions).
