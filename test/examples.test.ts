import { describe, expect, it } from "vitest";
import { EXAMPLES, bestLoop } from "../src/render/examples";

// The best loops worked out by hand, so a change to an example's numbers can't quietly change its story.
describe("why-it-matters examples", () => {
  const best = Object.fromEntries(EXAMPLES.map((ex) => [ex.id, bestLoop(ex)]));
  const names = (id: string) => best[id].moves.map((k) => EXAMPLES.find((e) => e.id === id)!.states[EXAMPLES.find((e) => e.id === id)!.moves[k][0]][0]);

  it("finds the best patrol", () => {
    expect(names("robot")).toEqual(["Hall", "Lab", "Yard"]);
    expect(best.robot.mean).toBeCloseTo(7 / 3);
  });

  it("repairs the machine as soon as it is worn", () => {
    expect(names("machine")).toEqual(["New", "Worn"]);
    expect(best.machine.mean).toBe(2);
  });

  it("farms the mine and the cave", () => {
    expect(names("game")).toEqual(["Mine", "Cave"]);
    expect(best.game.mean).toBe(4);
  });

  it("finds the chip's slowest loop", () => {
    expect(names("chip")).toEqual(["R1", "R2", "R3"]);
    expect(best.chip.mean).toBe(4);
  });
});
