// Colours for gains: one gold hue, dim for little reward, bright for a lot.
// Steps are by rank among the graph's optimal gains, so a graph with gains 1, 2 and 1000
// still shows three clearly different golds. (Checked as an ordinal ramp on the dark page.)
import { compare, parse, tex, type Rational } from "./rational";

export const GOLD = ["#5c4a1c", "#7d6422", "#a08128", "#c49f31", "#e2bd45", "#f7dc86"];

export class GainScale {
  readonly values: string[]; // distinct optimal gains, lowest first
  private parsed: Rational[];

  constructor(gains: string[]) {
    this.values = [...new Set(gains)].filter((g) => g !== "-inf").sort((a, b) => compare(parse(a), parse(b)));
    this.parsed = this.values.map(parse);
  }

  // Step 0 .. 5 for a gain, or null for -inf / unknown. A gain that isn't one of the optimal
  // ones (Howard on the way there) takes the step of the largest optimal gain below it.
  step(gain: string | null): number | null {
    if (gain === null || gain === "-inf" || !this.values.length) return null;
    const x = parse(gain);
    let i = 0;
    while (i + 1 < this.parsed.length && compare(this.parsed[i + 1], x) <= 0) i++;
    if (this.values.length === 1) return GOLD.length - 1;
    return Math.round((i / (this.values.length - 1)) * (GOLD.length - 1));
  }

  colour(gain: string | null): string | null {
    const s = this.step(gain);
    return s === null ? null : GOLD[s];
  }

  // Dark text on the bright steps, light text on the dim ones.
  ink(gain: string | null): string {
    const s = this.step(gain);
    return s !== null && s >= 3 ? "#141414" : "var(--ink)";
  }

  get lowTex(): string {
    return this.values.length ? tex(parse(this.values[0])) : "";
  }

  get highTex(): string {
    return this.values.length ? tex(parse(this.values[this.values.length - 1])) : "";
  }
}
