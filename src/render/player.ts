// Play / pause / step / scrub over ticks 0..count-1, with a speed button. Space and the arrow
// keys work too. The speed is remembered between graphs and pages.
const SPEEDS = [0.5, 1, 2, 4];
let speed = readSpeed();

function readSpeed(): number {
  try {
    const saved = Number(localStorage.getItem("dmdp-viz-speed"));
    return SPEEDS.includes(saved) ? saved : 1;
  } catch {
    return 1;
  }
}

function saveSpeed() {
  try {
    localStorage.setItem("dmdp-viz-speed", String(speed));
  } catch {
    // private browsing: the speed just isn't remembered
  }
}

export const speedLabel = (s: number = speed) => (s === 0.5 ? "½×" : `${s}×`);

export const playbackSpeed = () => speed;

// Next speed round the list, remembered for next time.
export function cycleSpeed(): number {
  speed = SPEEDS[(SPEEDS.indexOf(speed) + 1) % SPEEDS.length];
  saveSpeed();
  return speed;
}

export class Player {
  private tick = 0;
  private timer: number | null = null;
  private button: HTMLButtonElement;
  private speedButton: HTMLButtonElement;
  private range: HTMLInputElement;
  private readout: HTMLElement;

  constructor(
    root: HTMLElement,
    private count: number,
    private onTick: (tick: number) => string, // returns the readout text
    private delay = 1500, // ms per tick at 1×: slow enough to read the caption
  ) {
    root.classList.add("controls");
    root.innerHTML = `
      <button type="button" data-act="back" aria-label="Step back">‹</button>
      <button type="button" data-act="play" aria-label="Play">Play</button>
      <button type="button" data-act="next" aria-label="Step forward">›</button>
      <input type="range" min="0" step="1" aria-label="Position">
      <button type="button" data-act="speed" class="speed" aria-label="Playback speed"></button>
      <span class="readout" aria-live="polite"></span>`;
    this.button = root.querySelector('[data-act="play"]')!;
    this.speedButton = root.querySelector('[data-act="speed"]')!;
    this.range = root.querySelector("input")!;
    this.readout = root.querySelector(".readout")!;
    this.range.max = String(count - 1);
    this.speedButton.textContent = speedLabel();

    root.querySelector('[data-act="back"]')!.addEventListener("click", () => {
      this.pause();
      this.step(-1);
    });
    root.querySelector('[data-act="next"]')!.addEventListener("click", () => {
      this.pause();
      this.step(1);
    });
    this.button.addEventListener("click", () => (this.timer === null ? this.play() : this.pause()));
    this.speedButton.addEventListener("click", () => {
      speed = SPEEDS[(SPEEDS.indexOf(speed) + 1) % SPEEDS.length];
      saveSpeed();
      this.speedButton.textContent = speedLabel();
      if (this.timer !== null) this.schedule(); // pick up the new speed straight away
    });
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
    this.schedule();
  }

  private schedule(): void {
    if (this.timer !== null) window.clearInterval(this.timer);
    this.timer = window.setInterval(() => {
      if (this.tick >= this.count - 1) this.pause();
      else this.step(1);
    }, this.delay / speed);
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
