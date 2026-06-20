// 服务器端 Google 翻译代理
// v8.0：强制登录（与词典代理同策略，所有翻译/词典代理均要求登录后使用）
// v8.2.0：加 GET health check，让用户能在浏览器直接访问验证代理状态
import { NextRequest, NextResponse } from 'next/server';
import { validateUserAndToken } from '@/utils/access';

// GET /api/translate/google
// 浏览器直接访问会带 cookie/localStorage token？不会。
// 浏览器地址栏访问 API 不会自动带 Authorization header。
// 所以这个 GET 接口主要用于：
//   1. 检查路由是否在线（200 = 在线，401 = 路由在线但需登录，500 = 出错）
//   2. 用户登录后在 DevTools Console 里用 fetch + Bearer token 测试
// 用户在浏览器地址栏直接访问看到 401 "Authentication required" 是预期行为，不是 bug
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  const { user, token } = await validateUserAndToken(authHeader);

  if (!user || !token) {
    return NextResponse.json({
      ok: false,
      error: 'Authentication required',
      hint: 'This is a POST API. Use the in-app translate feature, or test with: curl -H "Authorization: Bearer YOUR_TOKEN" -X POST -H "Content-Type: application/json" -d \'{"text":["hello"],"targetLang":"zh"}\' https://your-host/api/translate/google',
    }, { status: 401 });
  }

  return NextResponse.json({
    ok: true,
    message: 'Google translate proxy is up',
    user: user.email,
    usage: 'POST with { text: string[], sourceLang?: string, targetLang: string }',
  });
}

export async function POST(req: NextRequest) {
  // v8.0：强制 auth —— 翻译代理必须登录
  const authHeader = req.headers.get('authorization');
  const { user, token } = await validateUserAndToken(authHeader);
  if (!user || !token) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  try {
    const { text, sourceLang, targetLang } = await req.json();
    if (!text || !Array.isArray(text)) {
      return NextResponse.json({ error: 'text must be an array' }, { status: 400 });
    }

    const sl = sourceLang?.toLowerCase() || 'auto';
    const tl = targetLang?.toLowerCase();

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
          headers: { 'User-Agent': 'Mozilla/5.0' },
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

    return NextResponse.json({ translations: results });
  } catch (error) {
    console.error('Google translate proxy error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Translation failed' },
      { status: 500 },
    );
  }
}
