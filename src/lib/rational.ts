// Exact fractions as the backend writes them: "7/2", "-3", "0", "-inf".
// BigInt keeps comparisons exact; doubles are only used for plotting positions.

export interface Rational {
  num: bigint;
  den: bigint; // > 0; 0 means minus infinity
}

export const NEG_INF: Rational = { num: -1n, den: 0n };

export function parse(text: string): Rational {
  if (text === "-inf") return NEG_INF;
  const [num, den = "1"] = text.split("/");
  const r = { num: BigInt(num), den: BigInt(den) };
  if (r.den <= 0n) throw new Error(`bad fraction '${text}'`);
  return r;
}

export const isNegInf = (r: Rational) => r.den === 0n;

export function compare(a: Rational, b: Rational): number {
  if (isNegInf(a) || isNegInf(b)) return Number(isNegInf(b)) - Number(isNegInf(a));
  const left = a.num * b.den;
  const right = b.num * a.den;
  return left < right ? -1 : left > right ? 1 : 0;
}

export const leq = (a: Rational, b: Rational) => compare(a, b) <= 0;

export function toNumber(r: Rational): number {
  return isNegInf(r) ? -Infinity : Number(r.num) / Number(r.den);
}

// TeX for KaTeX: \frac{7}{2}, -\frac{1}{3}, 5, -\infty
export function tex(r: Rational): string {
  if (isNegInf(r)) return "-\\infty";
  if (r.den === 1n) return r.num.toString();
  const sign = r.num < 0n ? "-" : "";
  const num = r.num < 0n ? -r.num : r.num;
  return `${sign}\\tfrac{${num}}{${r.den}}`;
}

// Plain text for places KaTeX is overkill (tooltips, aria labels).
export function text(r: Rational): string {
  if (isNegInf(r)) return "−∞";
  return r.den === 1n ? r.num.toString() : `${r.num}/${r.den}`;
}
