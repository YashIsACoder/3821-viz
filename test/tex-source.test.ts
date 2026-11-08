// TeX inside a JS/TS string needs a doubled backslash: in "$\lambda$" the string already turns \l into "l"
// (and \frac, \times, \neq into control characters) before KaTeX runs, so the maths renders as plain italic words.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { rich } from "../src/render/caption";

const files = (dir: string): string[] =>
  readdirSync(dir).flatMap((f) => (statSync(join(dir, f)).isDirectory() ? files(join(dir, f)) : /\.ts$/.test(f) ? [join(dir, f)] : []));

describe("TeX in source strings", () => {
  it("has no single-backslash TeX commands outside comments", () => {
    const bad: string[] = [];
    for (const f of files("src")) {
      readFileSync(f, "utf8").split("\n").forEach((line, i) => {
        const code = line.replace(/^\s*\/\/.*$/, "").replace(/\s\/\/\s.*$/, "");
        if (/(?<!\\)\\[A-Za-z]{2,}/.test(code)) bad.push(`${f}:${i + 1}: ${line.trim().slice(0, 90)}`);
      });
    }
    expect(bad).toEqual([]);
  });

  it("renders the story's SCC formula as maths", () => {
    const html = rich("worth $g^* = \\max(\\lambda(K), D(K))$");
    expect(html).toContain("λ");
    expect(html).toContain("max");
    expect(html).not.toMatch(/katex-error/);
  });
});
