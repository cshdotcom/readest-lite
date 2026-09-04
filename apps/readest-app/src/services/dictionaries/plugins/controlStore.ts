/**
 * Lite stub for `@/services/dictionaries/plugins/controlStore`.
 * Dictionary plugin system (Yomitan host) is not supported in web-only Lite.
 * The stub interface preserves the shape used by customDictionaryStore so the
 * dynamic-import fallback (which catches the import error) keeps dictionary
 * state consistent.
 */

import type { AppService } from '@/types/system';

export interface DictionaryPluginControlStore {
  getActiveGeneration: (
    dictId: string,
  ) => Promise<{ pluginId: string; indexVersion: number } | undefined>;
  [key: string]: unknown;
}

export const getDictionaryPluginControlStore = (
  _appService: AppService,
): DictionaryPluginControlStore | undefined => undefined;
