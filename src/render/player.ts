// Play / pause / step / scrub over ticks 0..count-1. Space and the arrow keys work too.
export class Player {
  private tick = 0;
  private timer: number | null = null;
  private button: HTMLButtonElement;
  private range: HTMLInputElement;
  private readout: HTMLElement;

  constructor(
    root: HTMLElement,
    private count: number,
    private onTick: (tick: number) => string, // returns the readout text
    private delay = 900, // ms per tick; slow enough to read the caption
  ) {
    root.classList.add("controls");
    root.innerHTML = `
      <button type="button" data-act="back" aria-label="Step back">‹</button>
      <button type="button" data-act="play" aria-label="Play">Play</button>
      <button type="button" data-act="next" aria-label="Step forward">›</button>
      <input type="range" min="0" step="1" aria-label="Position">
      <span class="readout" aria-live="polite"></span>`;
    this.button = root.querySelector('[data-act="play"]')!;
    this.range = root.querySelector("input")!;
    this.readout = root.querySelector(".readout")!;
    this.range.max = String(count - 1);

    root.querySelector('[data-act="back"]')!.addEventListener("click", () => this.step(-1));
    root.querySelector('[data-act="next"]')!.addEventListener("click", () => this.step(1));
    this.button.addEventListener("click", () => (this.timer === null ? this.play() : this.pause()));
    this.range.addEventListener("input", () => {
      this.pause();
      this.go(Number(this.range.value));
    });
    this.go(0);
  }

  // Keyboard control for the whole page, sent to whichever player is current.
  static bindKeys(current: () => Player | null): void {
    window.addEventListener("keydown", (event) => {
      const player = current();
      if (!player || event.target instanceof HTMLInputElement) return;
      if (event.target instanceof HTMLButtonElement && event.key === " ") return; // let the button click
      if (event.key === " ") {
        event.preventDefault();
        player.playing ? player.pause() : player.play();
      } else if (event.key === "ArrowRight") {
        player.pause();
        player.step(1);
      } else if (event.key === "ArrowLeft") {
        player.pause();
        player.step(-1);
      }
    });
  }

  go(tick: number): void {
    this.tick = Math.max(0, Math.min(this.count - 1, tick));
    this.range.value = String(this.tick);
    this.readout.textContent = this.onTick(this.tick);
  }

  step(by: number): void {
    this.go(this.tick + by);
  }

  play(): void {
    if (this.tick >= this.count - 1) this.go(0);
    this.button.textContent = "Pause";
    this.button.setAttribute("aria-label", "Pause");
    this.timer = window.setInterval(() => {
      if (this.tick >= this.count - 1) this.pause();
      else this.step(1);
    }, this.delay);
  }

  pause(): void {
    if (this.timer !== null) window.clearInterval(this.timer);
    this.timer = null;
    this.button.textContent = "Play";
    this.button.setAttribute("aria-label", "Play");
  }

  get playing(): boolean {
    return this.timer !== null;
  }
}
