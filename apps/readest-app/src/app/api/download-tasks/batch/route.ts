// v8.9: 批量操作
// POST /api/download-tasks/batch
// body: { action: "retry_failed" | "pause_all" | "resume_all" | "clear_completed" | "clear_failed" | "clear_all" }
//   或 { action: "create", urls: string[], cookies?: string, headers?: Record<string,string> }
import { NextRequest, NextResponse } from 'next/server';
import { validateUserAndToken } from '@/utils/access';
import { prismaClient } from '@/utils/db';
import { runDownloadTask } from '@/utils/downloadRunner';
import { sanitizeOutputFilename } from '@/utils/filenameDetect';

const MAX_BATCH_CREATE = 20;

export async function POST(req: NextRequest) {
  const { user, token } = await validateUserAndToken(req.headers.get('authorization'));
  if (!user || !token) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });

  const body = await req.json();
  const action = body.action as string;

  // ── 批量创建任务 ─────────────────────────────────────────────────────────
  if (action === 'create') {
    const urls: string[] = Array.isArray(body.urls) ? body.urls : [];
    if (urls.length === 0) {
      return NextResponse.json({ error: 'No URLs provided' }, { status: 400 });
    }
    if (urls.length > MAX_BATCH_CREATE) {
      return NextResponse.json(
        { error: `Too many URLs: max ${MAX_BATCH_CREATE}` },
        { status: 400 },
      );
    }

    // 校验
    for (const u of urls) {
      if (typeof u !== 'string') {
        return NextResponse.json({ error: `Invalid URL: ${u}` }, { status: 400 });
      }
      try {
        const parsed = new URL(u.trim());
        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
          return NextResponse.json({ error: `Only http(s) URLs: ${u}` }, { status: 400 });
        }
      } catch {
        return NextResponse.json({ error: `Invalid URL: ${u}` }, { status: 400 });
      }
    }

    const cookies = typeof body.cookies === 'string' && body.cookies.trim() ? body.cookies.trim() : null;
    const headersObj = body.headers && typeof body.headers === 'object' && !Array.isArray(body.headers)
      ? body.headers as Record<string, string>
      : {};
    const customHeadersJson = Object.keys(headersObj).length > 0 ? JSON.stringify(headersObj) : null;

    const created = await Promise.all(urls.map(async (u) => {
      const fallbackName = `pending-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.epub`;
      return prismaClient.downloadTask.create({
        data: {
          userId: user.id,
          url: u.trim(),
          originalUrl: u.trim(),
          filename: sanitizeOutputFilename(fallbackName),
          status: 'pending',
          cookies,
          customHeaders: customHeadersJson,
        },
      });
    }));

    // 后台异步执行
    for (const t of created) {
      void runDownloadTask({ taskId: t.id });
    }

    return NextResponse.json({
      ok: true,
      count: created.length,
      tasks: created.map((t) => ({ id: t.id, url: t.url, status: 'pending' })),
    });
  }

  // ── 批量重试 failed ──────────────────────────────────────────────────────
  if (action === 'retry_failed') {
    const failed = await prismaClient.downloadTask.findMany({
      where: { userId: user.id, status: 'failed' },
    });
    await prismaClient.downloadTask.updateMany({
      where: { userId: user.id, status: 'failed' },
      data: {
        status: 'pending',
        error: null,
        startedAt: null,
        completedAt: null,
        progress: 0,
        downloadedBytes: BigInt(0),
        totalBytes: null,
        speedBps: 0,
        etaSeconds: null,
      },
    });
    // 清旧日志 + 后台重试
    for (const t of failed) {
      await prismaClient.downloadLog.deleteMany({ where: { taskId: t.id } }).catch(() => {});
      void runDownloadTask({ taskId: t.id });
    }
    return NextResponse.json({ ok: true, count: failed.length });
  }

  // ── 批量暂停 ─────────────────────────────────────────────────────────────
  if (action === 'pause_all') {
    const result = await prismaClient.downloadTask.updateMany({
      where: { userId: user.id, status: { in: ['pending', 'in_progress'] } },
      data: { status: 'paused', speedBps: 0, etaSeconds: null },
    });
    return NextResponse.json({ ok: true, count: result.count });
  }

  // ── 批量恢复 ─────────────────────────────────────────────────────────────
  if (action === 'resume_all') {
    const paused = await prismaClient.downloadTask.findMany({
      where: { userId: user.id, status: 'paused' },
    });
    await prismaClient.downloadTask.updateMany({
      where: { userId: user.id, status: 'paused' },
      data: {
        status: 'pending',
        startedAt: null,
        completedAt: null,
        progress: 0,
        downloadedBytes: BigInt(0),
        speedBps: 0,
        etaSeconds: null,
      },
    });
    // 后台重新执行（暂停后已下载字节不保留，从 0 开始重新下载）
    for (const t of paused) {
      void runDownloadTask({ taskId: t.id });
    }
    return NextResponse.json({ ok: true, count: paused.length });
  }

  // ── 清理已完成 ───────────────────────────────────────────────────────────
  if (action === 'clear_completed') {
    const result = await prismaClient.downloadTask.deleteMany({
      where: { userId: user.id, status: 'completed' },
    });
    return NextResponse.json({ ok: true, count: result.count });
  }

  // ── 清理已失败 ───────────────────────────────────────────────────────────
  if (action === 'clear_failed') {
    const result = await prismaClient.downloadTask.deleteMany({
      where: { userId: user.id, status: 'failed' },
    });
    return NextResponse.json({ ok: true, count: result.count });
  }

  // ── 清理所有 ─────────────────────────────────────────────────────────────
  if (action === 'clear_all') {
    const result = await prismaClient.downloadTask.deleteMany({
      where: { userId: user.id },
    });
    return NextResponse.json({ ok: true, count: result.count });
  }

  return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
}
