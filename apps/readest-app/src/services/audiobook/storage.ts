/**
 * Lite stub for `@/services/audiobook/storage`.
 * Audiobook pairing (ABS + local audiobook) is not supported in web-only Lite.
 */

export type AudiobookStorage = Pick<
  import('@/types/book').Book,
  'hash' | 'title' | 'coverAspectRatio'
>;

export interface AudiobookImportFile {
  file: File;
  filename: string;
  size: number;
}

export const getAudiobookDirectory = (bookHash: string): string =>
  `${bookHash}/audiobook`;

export const isAudiobookFilePath = (
  _bookHash: string,
  _path: string,
): boolean => false;

export const importPairedAudiobook = async (
  _book: AudiobookStorage,
  _file: AudiobookImportFile,
): Promise<void> => {
  throw new Error('Audiobook pairing is not supported in Readest Lite');
};

export const replacePairedAudiobook = async (
  _book: AudiobookStorage,
  _file: AudiobookImportFile,
): Promise<void> => {
  throw new Error('Audiobook pairing is not supported in Readest Lite');
};

export const persistStreamedPairedAudiobook = async (
  _book: AudiobookStorage,
  _blob: Blob,
  _filename: string,
): Promise<void> => {
  throw new Error('Audiobook pairing is not supported in Readest Lite');
};

export const removePairedAudiobook = async (_book: AudiobookStorage): Promise<void> => {
  // No-op in Lite
};
