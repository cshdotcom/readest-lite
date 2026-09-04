/**
 * Lite stub for `@/services/dictionaries/plugins/record`.
 * Dictionary plugin metadata parsing — not supported in web-only Lite.
 */

export interface PluginDictionaryMetadata {
  id: string;
  title: string;
  version?: string;
}

export const parsePluginDictionaryMetadata = (
  _raw: string | undefined,
): PluginDictionaryMetadata | undefined => undefined;
