// v8.7: 远程下载任务 API
// GET  /api/download-tasks — 列出当前用户所有任务
// POST /api/download-tasks — 创建任务（异步下载）
import { NextRequest, NextResponse } from 'next/server';
import { validateUserAndToken } from '@/utils/access';
import { prismaClient } from '@/utils/db';
import { putObject, isSafeObjectKeyName } from '@/utils/object';
import { createHash } from 'crypto';

const MAX_FILE_SIZE = 200 * 1024 * 1024;
const ALLOWED_EXTENSIONS = ['epub', 'pdf', 'mobi', 'azw', 'azw3', 'fb2', 'txt', 'zip', 'cbz'];
const FETCH_TIMEOUT = 120000;

// GET — 列出所有任务
export async function GET(req: NextRequest) {
  const { user, token } = await validateUserAndToken(req.headers.get('authorization'));
  if (!user || !token) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  const tasks = await prismaClient.downloadTask.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: 'desc' },
  });

  return NextResponse.json({
    tasks: tasks.map((t) => ({
      id: t.id,
      url: t.url,
      filename: t.filename,
      status: t.status,
      error: t.error,
      bookHash: t.bookHash,
      fileSize: t.fileSize ? Number(t.fileSize) : null,
      createdAt: t.createdAt.toISOString(),
      startedAt: t.startedAt?.toISOString() ?? null,
      completedAt: t.completedAt?.toISOString() ?? null,
    })),
  });
}

// POST — 创建下载任务
export async function POST(req: NextRequest) {
  const { user, token } = await validateUserAndToken(req.headers.get('authorization'));
  if (!user || !token) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  try {
    const { url, filename } = await req.json();
    if (!url || typeof url !== 'string') {
      return NextResponse.json({ error: 'URL is required' }, { status: 400 });
    }

    let parsed: URL;
    try { parsed = new URL(url); } catch {
      return NextResponse.json({ error: 'Invalid URL' }, { status: 400 });
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return NextResponse.json({ error: 'Only http(s) URLs' }, { status: 400 });
    }

    let bookFilename = filename || parsed.pathname.split('/').pop() || 'download.epub';
    const ext = bookFilename.split('.').pop()?.toLowerCase() || '';
    if (!ALLOWED_EXTENSIONS.includes(ext)) {
      return NextResponse.json({ error: `Unsupported: .${ext}` }, { status: 400 });
    }

    // 创建任务记录
    const task = await prismaClient.downloadTask.create({
      data: {
        userId: user.id,
        url,
        filename: bookFilename,
        status: 'pending',
      },
    });

    // 后台异步执行下载（不阻塞响应）
    void (async () => {
      try {
        await prismaClient.downloadTask.update({
          where: { id: task.id },
          data: { status: 'in_progress', startedAt: new Date() },
        });

        // 检查是否被暂停
        const current = await prismaClient.downloadTask.findUnique({ where: { id: task.id } });
        if (current?.status === 'paused') return;

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT);
        const response = await fetch(url, {
          signal: controller.signal,
          headers: { 'User-Agent': 'ReadestLite/1.0 (+https://github.com/cshdotcom/readest-lite)' },
          redirect: 'follow',
        });
        clearTimeout(timeout);

        if (!response.ok) {
          throw new Error(`Remote returned ${response.status}`);
        }

        const buffer = await response.arrayBuffer();
        if (buffer.byteLength > MAX_FILE_SIZE) {
          throw new Error(`File too large: ${buffer.byteLength}`);
        }
        if (buffer.byteLength === 0) {
          throw new Error('Empty file');
        }

        const hash = createHash('md5').update(Buffer.from(buffer)).digest('hex');
        const fileKey = `${user.id}/Readest/Books/${hash}/${bookFilename}`;
        if (!isSafeObjectKeyName(fileKey)) throw new Error('Invalid filename');

        await putObject(fileKey, buffer, response.headers.get('content-type') || 'application/octet-stream');

        // 写 File 表
        const existing = await prismaClient.file.findUnique({ where: { fileKey } });
        if (!existing) {
          await prismaClient.file.create({
            data: { userId: user.id, bookHash: hash, fileKey, fileSize: BigInt(buffer.byteLength) },
          });
        }

        // 写 Book 表
        const titleFromFile = bookFilename.replace(/\.[^.]+$/, '');
        await prismaClient.book.upsert({
          where: { userId_bookHash: { userId: user.id, bookHash: hash } },
          create: {
            userId: user.id, bookHash: hash, title: titleFromFile,
            format: ext.toUpperCase(), uploadedAt: new Date(),
            updatedAt: new Date(), createdAt: new Date(),
          },
          update: { deletedAt: null, uploadedAt: new Date(), updatedAt: new Date() },
        });

        await prismaClient.downloadTask.update({
          where: { id: task.id },
          data: {
            status: 'completed',
            completedAt: new Date(),
            bookHash: hash,
            fileSize: BigInt(buffer.byteLength),
          },
        });
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : 'Unknown error';
        await prismaClient.downloadTask.update({
          where: { id: task.id },
          data: { status: 'failed', error: errMsg, completedAt: new Date() },
        }).catch(() => {});
      }
    })();

    return NextResponse.json({ taskId: task.id, status: 'pending' });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal error' },
      { status: 500 },
    );
  }
}
