/**
 * Lite stub for `@/services/dictionaries/plugins/integrity`.
 * Dictionary plugin file integrity hashing — not supported in web-only Lite.
 * Signature matches upstream (Blob argument) so callers type-check.
 */

export const sha256File = async (
  _file: Blob,
  _chunkSize: number = 1024 * 1024,
): Promise<string> => '';
