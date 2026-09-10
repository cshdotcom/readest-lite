// Notion API Proxy — POST /api/notion/[...path]
// 把所有 Notion API 调用代理到 https://api.notion.com/v1/...
// 避免 Notion API 不发 CORS 头导致浏览器无法直接调用
// 用户在 IntegrationsPanel 里配置 Notion accessToken + databaseId
// 路由会用 settings 中保存的 token 调用 Notion（不允许客户端明文传）
import { NextRequest, NextResponse } from 'next/server';
import { validateUserAndToken } from '@/utils/access';

export const runtime = 'nodejs';

interface RouteParams {
  params: Promise<{ path: string[] }>;
}

const NOTION_API_BASE = 'https://api.notion.com/v1';

export async function POST(req: NextRequest, { params }: RouteParams) {
  const { user, token } = await validateUserAndToken(req.headers.get('authorization'));
  if (!user || !token) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 403 });
  }

  try {
    const { path } = await params;
    const notionPath = path.join('/');

    // Body 包含 { notionToken, body } — notionToken 来自客户端（settings 加密同步的）
    const { notionToken, body } = await req.json();
    if (!notionToken || typeof notionToken !== 'string') {
      return NextResponse.json({ error: 'Notion token required' }, { status: 400 });
    }

    const url = `${NOTION_API_BASE}/${notionPath}`;
    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${notionToken}`,
        'Content-Type': 'application/json',
        'Notion-Version': '2022-06-28',
      },
      body: JSON.stringify(body),
    });

    const data = await resp.json();
    return NextResponse.json(data, { status: resp.status });
  } catch (error) {
    console.error('Notion proxy POST error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Notion proxy failed' },
      { status: 500 },
    );
  }
}

export async function GET(req: NextRequest, { params }: RouteParams) {
  const { user, token } = await validateUserAndToken(req.headers.get('authorization'));
  if (!user || !token) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 403 });
  }

  try {
    const { path } = await params;
    const notionPath = path.join('/');

    const url = new URL(req.url);
    const notionToken = url.searchParams.get('notionToken');
    if (!notionToken) {
      return NextResponse.json({ error: 'Notion token required' }, { status: 400 });
    }
    // 移除我们自己的 notionToken 参数
    url.searchParams.delete('notionToken');

    const targetUrl = `${NOTION_API_BASE}/${notionPath}${url.search || ''}`;
    const resp = await fetch(targetUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${notionToken}`,
        'Notion-Version': '2022-06-28',
      },
    });

    const data = await resp.json();
    return NextResponse.json(data, { status: resp.status });
  } catch (error) {
    console.error('Notion proxy GET error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Notion proxy failed' },
      { status: 500 },
    );
  }
}

export async function PATCH(req: NextRequest, { params }: RouteParams) {
  const { user, token } = await validateUserAndToken(req.headers.get('authorization'));
  if (!user || !token) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 403 });
  }

  try {
    const { path } = await params;
    const notionPath = path.join('/');

    const { notionToken, body } = await req.json();
    if (!notionToken) {
      return NextResponse.json({ error: 'Notion token required' }, { status: 400 });
    }

    const url = `${NOTION_API_BASE}/${notionPath}`;
    const resp = await fetch(url, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${notionToken}`,
        'Content-Type': 'application/json',
        'Notion-Version': '2022-06-28',
      },
      body: JSON.stringify(body),
    });

    const data = await resp.json();
    return NextResponse.json(data, { status: resp.status });
  } catch (error) {
    console.error('Notion proxy PATCH error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Notion proxy failed' },
      { status: 500 },
    );
  }
}

export function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PATCH, OPTIONS',
      'Access-Control-Allow-Headers': '*',
    },
  });
}
