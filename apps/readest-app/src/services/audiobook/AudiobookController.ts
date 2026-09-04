/**
 * Lite stub for `@/services/audiobook/AudiobookController`.
 * Audiobook pairing (ABS + local audiobook) requires native file system access
 * and an Audiobookshelf server. Lite is web-only and ships neither.
 */

import type { Book } from '@/types/book';

export interface AudiobookSource {
  book: Book;
  serverId?: string;
  itemId?: string;
  mediaUrl?: string;
}

export interface AudiobookProgressHooks {
  onProgress?: (frac: number, time: number) => void;
  onEnd?: () => void;
}

export class AudiobookController extends EventTarget {
  // Stub — never used in Lite
  constructor(_source: AudiobookSource, _hooks: AudiobookProgressHooks) {
    super();
  }
}

export const asAudiobookController = (
  _controller: unknown,
): AudiobookController | null => null;
