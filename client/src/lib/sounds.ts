// ─────────────────────────────────────────────────────────────────────────────
// Sound Manager
//
// DROP your audio files into:  client/public/sounds/
//
// Expected files:
//   victory.mp3      — celebration jingle (played when focus session ends)
//   break-start.mp3  — short chime for break start
//   session-start.mp3 — short chime for focus start
//   click.mp3        — UI click feedback
//
// Files are loaded on first play and cached. Missing files are silently ignored.
// ─────────────────────────────────────────────────────────────────────────────

type SoundName = 'victory' | 'break-start' | 'session-start' | 'click';

const cache: Partial<Record<SoundName, HTMLAudioElement>> = {};

export function playSound(name: SoundName, volume = 0.8): void {
  try {
    if (!cache[name]) {
      cache[name] = new Audio(`/sounds/${name}.mp3`);
    }
    const audio = cache[name]!;
    audio.currentTime = 0;
    audio.volume = volume;
    audio.play().catch(() => {
      // File missing or autoplay blocked — silently skip
    });
  } catch {
    // DOM not available (SSR) or other error — silently skip
  }
}
