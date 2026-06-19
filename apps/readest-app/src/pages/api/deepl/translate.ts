// 改造自原 src/pages/api/deepl/translate.ts。
// 用量统计改走 SQLite UsageStat 表；plan 校验移除（无限）。
import type { NextApiRequest, NextApiResponse } from 'next';
import { corsAllMethods, runMiddleware } from '@/utils/cors';
import { validateUserAndToken } from '@/utils/access';
import { prismaClient } from '@/utils/db';

const DEFAULT_DEEPL_FREE_API = 'https://api-free.deepl.com/v2/translate';
const DEFAULT_DEEPL_PRO_API = 'https://api.deepl.com/v2/translate';

const getDeepLAPIKey = (keys: string | undefined) => {
  const keyArray = keys?.split(',') ?? [];
  return keyArray.length ? keyArray[Math.floor(Math.random() * keyArray.length)]! : '';
};

const getCurrentUsage = async (userId: string): Promise<number> => {
  const today = new Date().toISOString().split('T')[0]!;
  const rows = await prismaClient.usageStat.findMany({
    where: { userId, usageType: 'translation_chars', usageDate: today },
    select: { increment: true },
  });
  return rows.reduce((s, r) => s + r.increment, 0);
};

const trackUsage = async (userId: string, increment: number) => {
  const today = new Date().toISOString().split('T')[0]!;
  await prismaClient.usageStat.create({
    data: { userId, usageType: 'translation_chars', usageDate: today, increment, metadata: JSON.stringify({ source: 'deepl_api' }) },
  });
  return getCurrentUsage(userId);
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  await runMiddleware(req, res, corsAllMethods);
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { user, token } = await validateUserAndToken(req.headers['authorization']);
  if (!user || !token) return res.status(403).json({ error: 'Not authenticated' });

  // DeepL 默认关闭，需设 DEEPL_ENABLED=true + API key
  const deeplEnabled = process.env['DEEPL_ENABLED'] === 'true';
  if (!deeplEnabled) {
    return res.status(503).json({ error: 'Translation is disabled. Set DEEPL_ENABLED=true and DEEPL_*_API_KEYS to enable.' });
  }

  const { text, source_lang, target_lang } = req.body || {};
  if (!Array.isArray(text)) return res.status(400).json({ error: 'text must be array' });

  const apiKeysFree = process.env['DEEPL_FREE_API_KEYS'];
  const apiKeysPro = process.env['DEEPL_PRO_API_KEYS'];
  const isProKey = (key: string) => key.endsWith(':fx') === false;
  let apiKey = '';
  if (apiKeysPro) apiKey = getDeepLAPIKey(apiKeysPro);
  else if (apiKeysFree) apiKey = getDeepLAPIKey(apiKeysFree);
  if (!apiKey) return res.status(500).json({ error: 'DeepL API keys not configured' });

  const endpoint = isProKey(apiKey) ? DEFAULT_DEEPL_PRO_API : DEFAULT_DEEPL_FREE_API;
  const totalChars = text.reduce((s: number, t: string) => s + (t?.length ?? 0), 0);

  try {
    const resp = await fetch(endpoint, {
      method: 'POST',
      headers: { Authorization: `DeepL-Auth-Key ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text,
        ...(source_lang && source_lang !== 'AUTO' ? { source_lang } : {}),
        target_lang,
      }),
    });
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      return res.status(resp.status).json({ error: err?.message || `DeepL error ${resp.status}` });
    }
    const data = (await resp.json()) as { translations: Array<{ text: string }> };
    await trackUsage(user.id, totalChars);
    return res.status(200).json({ translations: data.translations, usage: await getCurrentUsage(user.id) });
  } catch (err) {
    console.error('DeepL translate failed:', err);
    return res.status(500).json({ error: 'Translation failed' });
  }
}
