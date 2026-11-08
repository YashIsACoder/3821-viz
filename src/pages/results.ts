// The results page: every experiment as a picture, read from results.json.
import "katex/dist/katex.min.css";
import "../style.css";
import "./findings.css";
import { asadiTimes, circuitTiles, familyBars, loadResults, scalingChart, skipBars, sources, stallWaffles, tiles, waffle } from "../render/findings";

const $ = (sel: string) => document.querySelector<HTMLElement>(sel)!;

async function main() {
  const r = await loadResults();
  const a = r.agreement;
  $("#tiles").innerHTML = tiles(r);
  $("#agree").innerHTML = waffle(a.graphs, a.graphs, `${a.graphs} graphs agree, ${a.bruteforce} also checked by brute force`, a.bruteforce);
  $("#families").innerHTML = familyBars(r);
  $("#skips").innerHTML = skipBars(r);
  $("#stall-waffles").innerHTML = stallWaffles(r);
  $("#circuit-tiles").innerHTML = circuitTiles(r);
  $("#asadi").innerHTML = asadiTimes(r);
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
