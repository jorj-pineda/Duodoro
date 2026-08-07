// ─────────────────────────────────────────────────────────────────────────────
// Sound Manager
//
// DROP your audio files into:  client/public/sounds/
//
// Expected files (see FILES below for the exact name each key maps to):
//   victory.mp3       — celebration jingle (played when focus session ends)
//   break-start.mp3   — short chime for break start
//   session-start.mp3 — short chime for focus start
//   click.wav         — UI click feedback
//
// Files are loaded on first play and cached. Missing files are silently ignored.
//
// To swap any of these for your own, drop the file in and update FILES —
// the extension is explicit precisely so formats can be mixed.
// ─────────────────────────────────────────────────────────────────────────────

type SoundName = 'victory' | 'break-start' | 'session-start' | 'click';

const FILES: Record<SoundName, string> = {
  victory: 'victory.mp3',
  'break-start': 'break-start.mp3',
  'session-start': 'session-start.mp3',
  click: 'click.wav',
};

// Clicks fire constantly; at full volume the tick gets tiring fast.
const DEFAULT_VOLUME: Partial<Record<SoundName, number>> = { click: 0.25 };

const cache: Partial<Record<SoundName, HTMLAudioElement>> = {};

export function playSound(name: SoundName, volume?: number): void {
  try {
    if (!cache[name]) {
      cache[name] = new Audio(`/sounds/${FILES[name]}`);
    }
    const audio = cache[name]!;
    audio.currentTime = 0;
    audio.volume = volume ?? DEFAULT_VOLUME[name] ?? 0.8;
    audio.play().catch(() => {
      // File missing or autoplay blocked — silently skip
    });
  } catch {
    // DOM not available (SSR) or other error — silently skip
  }
}
