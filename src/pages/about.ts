// The about page is static apart from its maths, which is typeset here from $...$ in the text.
import "katex/dist/katex.min.css";
import "../style.css";
import "./about.css";
import { math } from "../render/caption";

for (const el of document.querySelectorAll<HTMLElement>("#proofs p")) {
  if (!el.innerHTML.includes("$")) continue;
  el.innerHTML = el.innerHTML
    .split("$")
    .map((piece, i) => (i % 2 ? math(piece.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")) : piece))
    .join("");
}
