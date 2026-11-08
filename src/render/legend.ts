// "What am I looking at?": every mark on the graph, in words. Collapsed on phones until asked for.
import { GOLD, type GainScale } from "../lib/gainScale";
import { math } from "./caption";

export function legend(gains: GainScale, open: boolean): HTMLElement {
  const box = document.createElement("details");
  box.className = "legend";
  box.open = open;
  const ramp = GOLD.map((c) => `<i style="background:${c}"></i>`).join("");
  const range = gains.values.length > 1 ? `${math(gains.lowTex)} <span class="ramp">${ramp}</span> ${math(gains.highTex)}` : `<span class="ramp">${ramp}</span>`;
  box.innerHTML = `
    <summary>What am I looking at?</summary>
    <ul>
      <li><span class="key state-key">3</span><span>A <b>state</b>. Once its long-run average reward (its <em>gain</em>) is known, it fills with gold:
        <span class="nowrap">${range}</span></span></li>
      <li><span class="key edge-key"><svg viewBox="0 0 40 14"><path d="M2 7 H30"/><path class="head" d="M30 2 L38 7 L30 12 z"/></svg><b class="pill">4</b></span>
        <span>An <b>action</b> and the reward it earns.</span></li>
      <li><span class="key ring-key"></span><span>A ring is a <b>strongly connected component</b> (SCC): its states can all reach each other.
        Leave it and you never come back.</span></li>
      <li><span class="key ring-key working"></span><span>The SCC being <b>worked on</b> right now.</span></li>
      <li><span class="key ring-key skipped"></span><span><b>Skipped</b>: a bound proved no cycle here beats leaving, so no work was needed.</span></li>
      <li><span class="key edge-key exit"><svg viewBox="0 0 40 14"><path d="M2 7 H30"/><path class="head" d="M30 2 L38 7 L30 12 z"/></svg></span>
        <span>The <b>exit value</b> ${math("D")}: the best gain you can get by leaving the SCC.</span></li>
      <li><span class="key edge-key policy"><svg viewBox="0 0 40 14"><path d="M2 7 H30"/><path class="head" d="M30 2 L38 7 L30 12 z"/></svg></span>
        <span>The <b>policy</b>: the action taken in each state.</span></li>
    </ul>`;
  return box;
}
