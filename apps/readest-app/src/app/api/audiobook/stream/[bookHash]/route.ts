// 有声书流式播放 API — GET /api/audiobook/stream/[bookHash]?fileKey=...[&token=...]
// 流式返回音频文件，支持 HTTP Range 请求（音频播放器拖动进度条时需要）
// 也支持 ?token= query 参数（HTML5 <audio> 无法设置 Authorization header）
import { NextRequest, NextResponse } from 'next/server';
import { validateUserAndToken } from '@/utils/access';
import { prismaClient } from '@/utils/db';
import { getDownloadSignedUrl } from '@/utils/object';

export const runtime = 'nodejs';

interface RouteParams {
  params: Promise<{ bookHash: string }>;
}

export async function GET(req: NextRequest, { params }: RouteParams) {
  const { bookHash } = await params;
  const url = new URL(req.url);
  const fileKey = url.searchParams.get('fileKey');
  const queryToken = url.searchParams.get('token');

  if (!fileKey) {
    return NextResponse.json({ error: 'fileKey query param required' }, { status: 400 });
  }

  // 鉴权：优先 Authorization header，否则回退 ?token= query 参数
  let user: { id: string; userRole?: string } | undefined;
  let token: string | undefined;
  if (queryToken) {
    // query token 优先（<audio> 用）
    const result = await validateUserAndToken(`Bearer ${queryToken}`);
    user = result.user;
    token = result.token;
  } else {
    const result = await validateUserAndToken(req.headers.get('authorization'));
    user = result.user;
    token = result.token;
  }
  if (!user || !token) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 403 });
  }

  try {
    const file = await prismaClient.file.findFirst({
      where: { userId: user.id, bookHash, fileKey, deletedAt: null },
    });
    if (!file) {
      return NextResponse.json({ error: 'Audio file not found' }, { status: 404 });
    }

    // 生成签名 URL — 客户端用 <audio src> 直接拉流，支持 Range
    // TTL 24h（有声书文件可能很大，听一晚上都行）
    const downloadUrl = await getDownloadSignedUrl(fileKey, 24 * 3600);

    // 重定向到签名 URL — <audio> 会跟随 302
    return NextResponse.redirect(downloadUrl, 302);
  } catch (error) {
    console.error('Audiobook stream error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to stream' },
      { status: 500 },
    );
  }
}
