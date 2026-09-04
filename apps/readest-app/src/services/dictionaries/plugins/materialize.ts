/**
 * Lite stub for `@/services/dictionaries/plugins/materialize`.
 * Dictionary plugin materialization is not supported in web-only Lite.
 */

import type { AppService } from '@/types/system';

export const materializePluginDictionary = async (
  _appService: AppService,
  _dict: unknown,
  _opts?: unknown,
): Promise<void> => {
  // No-op in Lite — plugin dictionary materialization is not supported
};
