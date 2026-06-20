// 服务器端通用资源代理
// v8.0：强制登录（与翻译/词典代理同策略，防止匿名滥用代理出口带宽）
// v8.0：白名单扩展，允许主流搜索引擎域名通过（用于 WebSearchPopup）
import { NextRequest, NextResponse } from 'next/server';
import { validateUserAndToken } from '@/utils/access';

// 内置搜索引擎域名 + 字体/CDN + Wiki + Google 翻译端点
// 用户自添加的搜索引擎不走本代理（WebSearchPopup 直接 window.open）
const ALLOWED_HOSTS = [
  // Wiki
  'wikipedia.org', 'wikimedia.org', 'wiktionary.org', 'upload.wikimedia.org',
  // 字体 / CDN
  'fonts.googleapis.com', 'fonts.gstatic.com', 'cdn.jsdelivr.net',
  'cdnjs.cloudflare.com', 'db.onlinewebfonts.com',
  // 翻译
  'translate.googleapis.com',
  // 内置搜索引擎（v8.0：让 WebSearchPopup 内置引擎可用）
  'google.com', 'www.google.com',
  'bing.com', 'www.bing.com',
  'baidu.com', 'www.baidu.com', 'm.baidu.com',
];

const isAllowedHost = (hostname: string): boolean =>
  ALLOWED_HOSTS.some(h => hostname === h || hostname.endsWith('.' + h));

export async function GET(req: NextRequest) {
  // v8.0：强制 auth —— 翻译/词典/内置搜索引擎代理均要求登录
  const authHeader = req.headers.get('authorization');
  const { user, token } = await validateUserAndToken(authHeader);
  if (!user || !token) {
    return NextResponse.json({
      ok: false,
      error: 'Authentication required',
      hint: 'This proxy requires login. Use the in-app feature, or test with: curl -H "Authorization: Bearer YOUR_TOKEN" "https://your-host/api/proxy/resource?url=https://example.com/"',
    }, { status: 401 });
  }

  const targetUrl = req.nextUrl.searchParams.get('url');
  if (!targetUrl) {
    return NextResponse.json({
      ok: true,
      message: 'Resource proxy is up',
      user: user.email,
      usage: 'GET with ?url=<target URL> (host must be in ALLOWED_HOSTS whitelist)',
    });
  }

  let parsed: URL;
  try { parsed = new URL(targetUrl); } catch { return NextResponse.json({ error: 'Invalid URL' }, { status: 400 }); }
  if (!isAllowedHost(parsed.hostname)) return NextResponse.json({ error: 'Host not allowed' }, { status: 403 });

  try {
    const resp = await fetch(targetUrl, {
      headers: { 'User-Agent': 'ReadestLite/1.0' },
      signal: AbortSignal.timeout(15000),
    });
    const contentType = resp.headers.get('content-type') || 'application/octet-stream';
    const buffer = await resp.arrayBuffer();
    return new NextResponse(buffer, {
      status: resp.status,
      headers: { 'Content-Type': contentType, 'Cache-Control': 'public, max-age=86400', 'Access-Control-Allow-Origin': '*' },
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Proxy failed' }, { status: 502 });
  }
}
