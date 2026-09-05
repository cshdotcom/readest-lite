/**
 * Lite stub for `@/services/audiobook/absPairing`.
 * Audiobookshelf (ABS) pairing requires a configured ABS server. Lite
 * doesn't ship ABS integration. Stubs return empty/null so TTS narration
 * pairing falls through to the default TTS path.
 */

import type { Book } from '@/types/book';

export const ABS_PAIRED_FILE_ID = 'abs';

export interface AbsPairingSource {
  serverId: string;
  itemId: string;
  title: string;
}

export const listPairableAbsBooks = (_library: Book[]): Book[] => [];

export const buildAbsPairingSource = (
  _item: unknown,
  _serverId: string,
): AbsPairingSource => {
  throw new Error('Audiobookshelf pairing is not supported in Readest Lite');
};

export const loadAbsPairingSource = async (
  _source: AbsPairingSource,
): Promise<AbsPairingSource> => {
  throw new Error('Audiobookshelf pairing is not supported in Readest Lite');
};

export interface PairedAudiobookAbsSource {
  serverId: string;
  itemId: string;
}

export interface NarrationTrack {
  href: string;
  start: number;
  end: number;
  text?: string;
}

export const absNarrationTracks = (
  _source: PairedAudiobookAbsSource,
): NarrationTrack[] | null => null;

/** Resolve tracks for a specific href (MediaOverlayClient shape). */
export const absNarrationTracksForHref = (
  source: PairedAudiobookAbsSource,
  _href: string,
): NarrationTrack[] | null => absNarrationTracks(source);

export interface AbsPreviewClip {
  url: string;
  start: number;
  end: number;
}

export const absPreviewClip = (
  _source: PairedAudiobookAbsSource,
  _href: string,
): AbsPreviewClip | null => null;
