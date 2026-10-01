"use client";

// Tiny WebAudio bleeps — no audio files needed.
let ctx: AudioContext | null = null;

function ac(): AudioContext | null {
  try {
    if (!ctx) ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    return ctx;
  } catch {
    return null;
  }
}

export function blip(freq = 660, ms = 90, type: OscillatorType = "sine") {
  const c = ac();
  if (!c) return;
  try {
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type;
    o.frequency.value = freq;
    g.gain.setValueAtTime(0.08, c.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + ms / 1000);
    o.connect(g).connect(c.destination);
    o.start();
    o.stop(c.currentTime + ms / 1000);
  } catch {
    /* ignore */
  }
}

export function celebrate() {
  [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => blip(f, 140, "triangle"), i * 110));
}
