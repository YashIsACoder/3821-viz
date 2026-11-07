// Text with $tex$ pieces -> HTML, with KaTeX doing the maths.
import katex from "katex";

const cache = new Map<string, string>();

export function math(tex: string): string {
  let html = cache.get(tex);
  if (html === undefined) {
    html = katex.renderToString(tex, { throwOnError: false, output: "html" });
    cache.set(tex, html);
  }
  return html;
}

const escape = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// "SCC 1: $U = 3$" -> plain text escaped, odd pieces rendered as maths.
export function rich(text: string): string {
  return text
    .split("$")
    .map((piece, i) => (i % 2 ? math(piece) : escape(piece)))
    .join("");
}

// Render every $...$ inside the elements matching `selector` (for hand-written page copy).
export function typeset(root: ParentNode, selector = "[data-math]"): void {
  root.querySelectorAll<HTMLElement>(selector).forEach((el) => {
    el.innerHTML = rich(el.textContent ?? "");
  });
}
