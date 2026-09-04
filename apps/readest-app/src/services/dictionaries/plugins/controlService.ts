/**
 * Lite stub for `@/services/dictionaries/plugins/controlService`.
 * Dictionary plugin system (Yomitan host) is not supported in web-only Lite.
 */

import type { AppService } from '@/types/system';
import type { DictionaryPluginControlStore } from './controlStore';

export const getDictionaryPluginControlStore = (
  _appService: AppService,
): DictionaryPluginControlStore | undefined => undefined;

export const __resetDictionaryPluginControlStoresForTests = (): void => {
  // No-op in Lite
};
