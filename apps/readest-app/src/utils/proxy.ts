// v8.2.0: 代理开关工具
// 所有翻译/词典调用前判断 proxyEnabled
// proxyEnabled=true → 走服务器代理（绕过 GFW）
// proxyEnabled=false → 客户端直连目标 URL（用户需自己解决网络问题）
import { useSettingsStore } from '@/store/settingsStore';
import { getAPIBaseUrl } from '@/services/environment';
import { getAccessToken } from '@/utils/access';

/** 是否启用服务器代理（默认 true） */
export const isProxyEnabled = (): boolean => {
  try {
    const settings = useSettingsStore.getState().settings;
    return settings.proxyEnabled ?? true;
  } catch {
    // settings store 未初始化时默认开启代理
    return true;
  }
};

/**
 * 通用代理 fetch：proxyEnabled=true 走 /api/proxy/resource + Bearer token
 * proxyEnabled=false 直接 fetch 目标 URL
 */
export const fetchViaProxy = async (
  url: string,
  signal?: AbortSignal,
  proxyPath: string = '/proxy/resource',
): Promise<Response> => {
  if (isProxyEnabled()) {
    const token = await getAccessToken();
    const proxyUrl = `${getAPIBaseUrl()}${proxyPath}?url=${encodeURIComponent(url)}`;
    return fetch(proxyUrl, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      signal,
    });
  }
  // 关闭代理：客户端直连
  return fetch(url, { signal });
};

/**
 * Wiki 专用代理 fetch（走 /api/proxy/wiki）
 */
export const fetchViaWikiProxy = async (url: string, signal?: AbortSignal): Promise<Response> => {
  return fetchViaProxy(url, signal, '/proxy/wiki');
};
