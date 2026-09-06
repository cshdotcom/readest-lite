/**
 * Lite stub for `@/services/audiobook/absPairing`.
 * Audiobookshelf (ABS) pairing requires a configured ABS server. Lite
 * doesn't ship ABS integration. Stubs return empty/null so TTS narration
 * pairing falls through to the default TTS path.
 *
 * v8.19.4: Stubs are non-blocking. Earlier versions threw Error on
 * `buildAbsPairingSource` / `loadAbsPairingSource`, which made the TTS
 * controller crash if the user clicked the (hidden) pairing UI. Stubs
 * now return empty objects / the input source unchanged so any caller
 * that mistakenly reaches them gets a no-op instead of an exception.
 *
 * Uses the canonical NarrationTrack from MultiTrackNarrationClock (not a
 * local definition) so consumers in TTSController type-check against the
 * same shape MediaOverlayClient expects.
 */

import type { NarrationTrack } from '@/services/tts/mediaOverlay/MultiTrackNarrationClock';
import type { Book } from '@/types/book';

export const ABS_PAIRED_FILE_ID = 'abs';

export interface AbsPairingSource {
  serverId: string;
  itemId: string;
  title: string;
}

export const listPairableAbsBooks = (_library: Book[]): Book[] => [];

// v8.19.4: no-op — return an empty source shape. Callers should never
// reach this in Lite (no ABS server is ever configured), but if they do
// (e.g. stale book config from a restored backup), returning empty
// keeps the chain alive instead of throwing.
export const buildAbsPairingSource = (
  _item: unknown,
  _serverId: string,
): AbsPairingSource => ({
  serverId: '',
  itemId: '',
  title: '',
});

// v8.19.4: no-op — pass the source through unchanged.
export const loadAbsPairingSource = async (
  source: AbsPairingSource,
): Promise<AbsPairingSource> => source;

export interface PairedAudiobookAbsSource {
  serverId: string;
  itemId: string;
}

export const absNarrationTracks = (
  _source: PairedAudiobookAbsSource,
  _href?: string,
): NarrationTrack[] | null => null;

export interface AbsPreviewClip {
  url: string;
  start: number;
  end: number;
}

export const absPreviewClip = (
  _source: PairedAudiobookAbsSource,
  _href: string,
): AbsPreviewClip | null => null;
