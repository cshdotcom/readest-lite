import { stubTranslation as _ } from '@/utils/misc';
import { normalizeToShortLang } from '@/utils/lang';
import { getAPIBaseUrl } from '@/services/environment';
import { getAccessToken } from '@/utils/access';
import { isProxyEnabled } from '@/utils/proxy';
import { TranslationProvider } from '../types';

// v8.2.0: Google 翻译代理开关
// proxyEnabled=true → 走 /api/translate/google 服务器代理（绕过 GFW）
// proxyEnabled=false → 客户端直连 translate.googleapis.com（用户需自备网络）
export const googleProvider: TranslationProvider = {
  name: 'google',
  label: _('Google Translate'),
  translate: async (text: string[], sourceLang: string, targetLang: string): Promise<string[]> => {
    if (!text.length) return [];

    const sl = normalizeToShortLang(sourceLang).toLowerCase() || 'auto';
    const tl = normalizeToShortLang(targetLang).toLowerCase();

    if (isProxyEnabled()) {
      // 走服务器代理
      const token = await getAccessToken();
      if (!token) throw new Error('Not authenticated');

      const url = `${getAPIBaseUrl()}/translate/google`;
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ text, sourceLang: sl, targetLang: tl }),
      });

      if (!response.ok) {
        throw new Error(`Google translate proxy failed: ${response.status}`);
      }

      const data = await response.json();
      return data.translations || text;
    }

    // 客户端直连 Google Translate（需客户端能访问 translate.googleapis.com）
    const results: string[] = new Array(text.length);
    await Promise.all(text.map(async (line: string, index: number) => {
      if (!line?.trim().length) {
        results[index] = line;
        return;
      }
      try {
        const url = new URL('https://translate.googleapis.com/translate_a/single');
        url.searchParams.append('client', 'gtx');
        url.searchParams.append('dt', 't');
        url.searchParams.append('sl', sl);
        url.searchParams.append('tl', tl);
        url.searchParams.append('q', line);

        const resp = await fetch(url.toString(), {
          signal: AbortSignal.timeout(10000),
        });
        if (!resp.ok) {
          results[index] = line;
          return;
        }
        const data = await resp.json();
        if (Array.isArray(data) && Array.isArray(data[0])) {
          results[index] = data[0]
            .filter((s: unknown) => Array.isArray(s) && s[0])
            .map((s: unknown[]) => s[0])
            .join('') || line;
        } else {
          results[index] = line;
        }
      } catch {
        results[index] = line;
      }
    }));
    return results;
  },
};
