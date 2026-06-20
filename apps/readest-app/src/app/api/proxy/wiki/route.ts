// 服务器端 Wikipedia/Wiktionary 代理
// v8.0：强制登录（与翻译代理同策略，词典查询要求登录后使用）
import { NextRequest, NextResponse } from 'next/server';
import { validateUserAndToken } from '@/utils/access';

const ALLOWED_HOSTS = [
  'wikipedia.org', 'wikimedia.org', 'wiktionary.org', 'upload.wikimedia.org',
  'en.wikipedia.org', 'zh.wikipedia.org', 'ja.wikipedia.org',
  'en.wiktionary.org', 'zh.wiktionary.org',
];

const isAllowedHost = (hostname: string): boolean =>
  ALLOWED_HOSTS.some(h => hostname === h || hostname.endsWith('.' + h));

export async function GET(req: NextRequest) {
  // v8.0：强制 auth —— 词典代理必须登录
  const authHeader = req.headers.get('authorization');
  const { user, token } = await validateUserAndToken(authHeader);
  if (!user || !token) {
    return NextResponse.json({
      ok: false,
      error: 'Authentication required',
      hint: 'This proxy requires login. Use the in-app dictionary feature, or test with: curl -H "Authorization: Bearer YOUR_TOKEN" "https://your-host/api/proxy/wiki?url=https://en.wikipedia.org/api/rest_v1/page/summary/Hello"',
    }, { status: 401 });
  }

  const targetUrl = req.nextUrl.searchParams.get('url');
  if (!targetUrl) {
    return NextResponse.json({
      ok: true,
      message: 'Wikipedia/Wiktionary proxy is up',
      user: user.email,
      usage: 'GET with ?url=<target Wikipedia/Wiktionary URL>',
    });
  }

  let parsed: URL;
  try { parsed = new URL(targetUrl); } catch { return NextResponse.json({ error: 'Invalid URL' }, { status: 400 }); }
  if (!isAllowedHost(parsed.hostname)) return NextResponse.json({ error: 'Host not allowed' }, { status: 403 });

  try {
    const resp = await fetch(targetUrl, {
      headers: { 'User-Agent': 'ReadestLite/1.0 (+https://github.com/cshdotcom/readest-lite)' },
      signal: AbortSignal.timeout(15000),
    });
    const contentType = resp.headers.get('content-type') || 'text/html';
    const buffer = await resp.arrayBuffer();
    return new NextResponse(buffer, {
      status: resp.status,
      headers: { 'Content-Type': contentType, 'Cache-Control': 'public, max-age=3600', 'Access-Control-Allow-Origin': '*' },
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Proxy failed' }, { status: 502 });
  }
}
