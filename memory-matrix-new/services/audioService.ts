import { Color } from "../types";

// Frequencies loosely based on the classic game
const FREQUENCIES: Record<Color, number> = {
  [Color.GREEN]: 329.63, // E4
  [Color.RED]: 261.63, // C4
  [Color.YELLOW]: 220.0, // A3
  [Color.BLUE]: 164.81, // E3
};

// Error frequency
const ERROR_FREQ = 110; // A2

let audioCtx: AudioContext | null = null;

const getAudioContext = () => {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
  }
  return audioCtx;
};

export const initAudio = () => {
  const ctx = getAudioContext();
  if (ctx.state === "suspended") {
    ctx.resume();
  }
};

export const playTone = (color: Color | "error", duration: number = 0.5) => {
  const ctx = getAudioContext();
  const oscillator = ctx.createOscillator();
  const gainNode = ctx.createGain();

  const freq = color === "error" ? ERROR_FREQ : FREQUENCIES[color];
  const type = color === "error" ? "sawtooth" : "sine";

  oscillator.type = type;
  oscillator.frequency.setValueAtTime(freq, ctx.currentTime);

  // Envelope to avoid clicking
  gainNode.gain.setValueAtTime(0, ctx.currentTime);
  gainNode.gain.linearRampToValueAtTime(0.1, ctx.currentTime + 0.05);
  gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);

  oscillator.connect(gainNode);
  gainNode.connect(ctx.destination);

  oscillator.start(ctx.currentTime);
  oscillator.stop(ctx.currentTime + duration);
};
