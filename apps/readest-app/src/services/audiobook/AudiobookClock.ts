/**
 * Lite stub for `@/services/audiobook/AudiobookClock`.
 * HtmlAudioClock tracks the currentTime of an HTMLAudioElement for the
 * AudiobookController. Lite doesn't ship audiobook pairing, but MediaOverlayClient
 * references this type for sync — keep the class shell so imports resolve.
 */

export interface AudiobookClock {
  currentTime: number;
  duration: number;
  paused: boolean;
  rate: number;
  destroy: () => void;
}

export class HtmlAudioClock implements AudiobookClock {
  currentTime = 0;
  duration = 0;
  paused = true;
  rate = 1;

  constructor(_audio: HTMLAudioElement) {}

  destroy(): void {
    // No-op in Lite
  }

  async load(_url: string, _startAt: number): Promise<void> {
    // No-op in Lite — no actual audio element playback
  }
}
