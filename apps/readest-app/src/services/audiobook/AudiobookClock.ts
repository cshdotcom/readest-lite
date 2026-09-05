/**
 * Lite stub for `@/services/audiobook/AudiobookClock`.
 * HtmlAudioClock tracks the currentTime of an HTMLAudioElement for the
 * AudiobookController. Lite doesn't ship audiobook pairing, but MediaOverlayClient
 * references this type for sync — keep the class shell so imports resolve.
 *
 * Implements NarrationTrackPlayer (NarrationClock + load(url, startAt)) so
 * the composite MediaOverlayClient type-checks in Lite even though no
 * audio ever plays.
 */

export interface AudiobookClock {
  currentTime: number;
  duration: number;
  paused: boolean;
  rate: number;
  destroy: () => void;
}

type ClockEvent = 'ended' | 'error' | 'timeupdate';

export class HtmlAudioClock implements AudiobookClock {
  currentTime = 0;
  duration = 0;
  paused = true;
  playbackRate = 1;
  rate = 1;

  #listeners: Record<ClockEvent, Set<() => void>> = {
    ended: new Set(),
    error: new Set(),
    timeupdate: new Set(),
  };

  constructor(_audio?: HTMLAudioElement) {}

  destroy(): void {
    this.#listeners.ended.clear();
    this.#listeners.error.clear();
    this.#listeners.timeupdate.clear();
  }

  async play(): Promise<void> {
    this.paused = false;
  }

  pause(): void {
    this.paused = true;
  }

  async load(_url: string, _startAt: number): Promise<void> {
    // No-op in Lite — no actual audio element playback
  }

  addEventListener(type: ClockEvent, fn: () => void): void {
    this.#listeners[type].add(fn);
  }

  removeEventListener(type: ClockEvent, fn: () => void): void {
    this.#listeners[type].delete(fn);
  }
}
