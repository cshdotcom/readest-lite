/**
 * Lite stub for `@/services/dictionaries/plugins/provider`.
 * Dictionary plugin system (Yomitan host) is not supported in web-only Lite.
 */

import type { DictionaryProvider } from '@/services/dictionaries/types';

export interface CreatePluginDictionaryProviderArgs {
  dict: unknown;
  host?: unknown;
  plugin?: unknown;
  controlStore?: unknown;
}

export const createPluginDictionaryProvider = (
  _args: CreatePluginDictionaryProviderArgs,
): DictionaryProvider => {
  throw new Error('Dictionary plugin system is not supported in Readest Lite');
};
