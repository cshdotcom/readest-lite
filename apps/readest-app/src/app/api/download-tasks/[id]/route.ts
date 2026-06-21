// v8.7: 单个下载任务操作
// DELETE /api/download-tasks/[id] — 删除任务
// POST   /api/download-tasks/[id] — 重试/暂停/恢复 (body: { action: "retry" | "pause" | "resume" })
import { NextRequest, NextResponse } from 'next/server';
import { validateUserAndToken } from '@/utils/access';
import { prismaClient } from '@/utils/db';
import { putObject, isSafeObjectKeyName } from '@/utils/object';
import { createHash } from 'crypto';

const MAX_FILE_SIZE = 200 * 1024 * 1024;

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function DELETE(req: NextRequest, { params }: RouteParams) {
  const { user, token } = await validateUserAndToken(req.headers.get('authorization'));
  if (!user || !token) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });

  const { id } = await params;
  const task = await prismaClient.downloadTask.findUnique({ where: { id } });
  if (!task || task.userId !== user.id) {
    return NextResponse.json({ error: 'Task not found' }, { status: 404 });
  }

  await prismaClient.downloadTask.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}

export async function POST(req: NextRequest, { params }: RouteParams) {
  const { user, token } = await validateUserAndToken(req.headers.get('authorization'));
  if (!user || !token) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });

  const { id } = await params;
  const body = await req.json();
  const action = body.action as string;

  const task = await prismaClient.downloadTask.findUnique({ where: { id } });
  if (!task || task.userId !== user.id) {
    return NextResponse.json({ error: 'Task not found' }, { status: 404 });
  }

  if (action === 'pause') {
    if (task.status !== 'in_progress' && task.status !== 'pending') {
      return NextResponse.json({ error: 'Can only pause pending/in_progress tasks' }, { status: 400 });
    }
    await prismaClient.downloadTask.update({ where: { id }, data: { status: 'paused' } });
    return NextResponse.json({ ok: true, status: 'paused' });
  }

  if (action === 'resume' || action === 'retry') {
    await prismaClient.downloadTask.update({
      where: { id },
      data: { status: 'pending', error: null, startedAt: null, completedAt: null },
    });

    // 后台重新执行下载
    void (async () => {
      try {
        await prismaClient.downloadTask.update({
          where: { id }, data: { status: 'in_progress', startedAt: new Date() },
        });

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 120000);
        const response = await fetch(task.url, {
          signal: controller.signal,
          headers: { 'User-Agent': 'ReadestLite/1.0' },
          redirect: 'follow',
        });
        clearTimeout(timeout);

        if (!response.ok) throw new Error(`Remote returned ${response.status}`);

        const buffer = await response.arrayBuffer();
        if (buffer.byteLength > MAX_FILE_SIZE) throw new Error('File too large');
        if (buffer.byteLength === 0) throw new Error('Empty file');

        const hash = createHash('md5').update(Buffer.from(buffer)).digest('hex');
        const fileKey = `${user.id}/Readest/Books/${hash}/${task.filename}`;
        if (!isSafeObjectKeyName(fileKey)) throw new Error('Invalid filename');

        await putObject(fileKey, buffer, response.headers.get('content-type') || 'application/octet-stream');

        const existing = await prismaClient.file.findUnique({ where: { fileKey } });
        if (!existing) {
          await prismaClient.file.create({
            data: { userId: user.id, bookHash: hash, fileKey, fileSize: BigInt(buffer.byteLength) },
          });
        }

        const ext = task.filename.split('.').pop()?.toUpperCase() || '';
        const title = task.filename.replace(/\.[^.]+$/, '');
        await prismaClient.book.upsert({
          where: { userId_bookHash: { userId: user.id, bookHash: hash } },
          create: {
            userId: user.id, bookHash: hash, title, format: ext,
            uploadedAt: new Date(), updatedAt: new Date(), createdAt: new Date(),
          },
          update: { deletedAt: null, uploadedAt: new Date(), updatedAt: new Date() },
        });

        await prismaClient.downloadTask.update({
          where: { id },
          data: { status: 'completed', completedAt: new Date(), bookHash: hash, fileSize: BigInt(buffer.byteLength) },
        });
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : 'Unknown error';
        await prismaClient.downloadTask.update({
          where: { id }, data: { status: 'failed', error: errMsg, completedAt: new Date() },
        }).catch(() => {});
      }
    })();

    return NextResponse.json({ ok: true, status: 'pending' });
  }

  return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
}
