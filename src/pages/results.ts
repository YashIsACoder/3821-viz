// The results page: every experiment's headline, read from results.json.
import "katex/dist/katex.min.css";
import "../style.css";
import "./findings.css";
import { boundsTable, circuits, familyBars, loadResults, scalingChart, sources, stallTiles, tiles } from "../render/findings";

const $ = (sel: string) => document.querySelector<HTMLElement>(sel)!;

async function main() {
  const r = await loadResults();
  $("#tiles").innerHTML = tiles(r);
  $("#exact-note").textContent =
    `${r.agreement.graphs.toLocaleString("en")} graphs agree, ${r.agreement.bruteforce} of them also checked by brute force, ` +
    `${r.agreement.disagreements} disagreements.`;
  $("#families").innerHTML = familyBars(r);
  $("#bounds-table").innerHTML = boundsTable(r);
  $("#stall-tiles").innerHTML = stallTiles(r);
  $("#circuits").innerHTML = circuits(r);
  $("#sources").innerHTML = sources(r);
  $("#backend").textContent = `Data from dmdp at ${r.backend.commit}.`;

  const box = $("#scaling");
  let drawnAt = 0;
  const draw = () => {
    if (box.clientWidth === drawnAt) return;
    drawnAt = box.clientWidth;
    box.innerHTML = scalingChart(r, Math.min(drawnAt, 720));
  };
  draw();
  window.addEventListener("resize", draw);
}

main().catch((error) => {
  $("#tiles").textContent = `Couldn't load the results: ${(error as Error).message}`;
});
