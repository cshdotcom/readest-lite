// 内部 PUT 端点 — 接收客户端直传的文件字节，写入本地文件系统。
// 替代 R2/S3 预签名 PUT URL 的接收方。
// URL: /api/storage/_put?key=<fileKey>&expires=<epoch>&sig=<hex>
//   可选参数：
//     &index=N&total=M — 分块上传：本请求是第 N 块（共 M 块），写到 <fileKey>.parts/<NNNNN>
//     &merge=1&total=M — 合并所有已上传的 parts 到 <fileKey>，删除 parts 目录
// 流程：校验签名 → 根据 query 决定写整文件 / 写 part / 合并 parts
import type { NextApiRequest, NextApiResponse } from 'next';
import { corsAllMethods, runMiddleware } from '@/utils/cors';
import {
  verifyPutSig,
  createWriteStreamForKey,
  createPartWriteStream,
  mergePartsForKey,
  isSafeObjectKeyName,
} from '@/utils/localStorage';

export const config = { api: { bodyParser: false, responseLimit: false } };

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  await runMiddleware(req, res, corsAllMethods);
  if (req.method !== 'PUT') return res.status(405).json({ error: 'Method not allowed' });

  const { key, expires, sig, index, total, merge } = req.query as {
    key?: string;
    expires?: string;
    sig?: string;
    index?: string;
    total?: string;
    merge?: string;
  };
  if (!key || !expires || !sig) return res.status(400).json({ error: 'Missing signature params' });
  if (!isSafeObjectKeyName(key)) return res.status(400).json({ error: 'Invalid fileKey' });

  const exp = parseInt(expires, 10);
  if (!verifyPutSig(key, exp, sig)) return res.status(403).json({ error: 'Invalid or expired signature' });

  // ── 分支 1：合并请求 ──────────────────────────────────────────────────────
  // 客户端传完所有 parts 后发一次，服务端流式合并 parts → <fileKey>，删除 parts 目录
  if (merge === '1') {
    if (!total) return res.status(400).json({ error: 'Missing total for merge' });
    const totalNum = parseInt(total, 10);
    if (!Number.isFinite(totalNum) || totalNum <= 0) {
      return res.status(400).json({ error: 'Invalid total' });
    }
    try {
      await mergePartsForKey(key, totalNum);
      return res.status(200).json({ ok: true, merged: true, parts: totalNum });
    } catch (error) {
      console.error('storage/_put merge failed:', error);
      return res.status(500).json({
        error: error instanceof Error ? error.message : 'Merge failed',
      });
    }
  }

  // ── 分支 2：分块上传 ──────────────────────────────────────────────────────
  // 写到 <fileKey>.parts/<NNNNN>，等所有块传完后客户端发 merge=1
  if (index !== undefined && total !== undefined) {
    const idx = parseInt(index, 10);
    const tot = parseInt(total, 10);
    if (!Number.isFinite(idx) || !Number.isFinite(tot) || idx < 0 || idx >= tot) {
      return res.status(400).json({ error: 'Invalid index/total' });
    }
    try {
      const stream = createPartWriteStream(key, idx, tot);
      req.pipe(stream);
      await new Promise<void>((resolve, reject) => {
        stream.on('finish', resolve);
        stream.on('error', reject);
        req.on('error', reject);
      });
      return res.status(200).json({ ok: true, index: idx, total: tot });
    } catch (error) {
      console.error('storage/_put chunk failed:', error);
      return res.status(500).json({ error: 'Could not write part' });
    }
  }

  // ── 分支 3：整文件上传（兼容旧客户端 + 小文件路径）──────────────────────
  try {
    const stream = createWriteStreamForKey(key);
    req.pipe(stream);
    await new Promise<void>((resolve, reject) => {
      stream.on('finish', resolve);
      stream.on('error', reject);
      req.on('error', reject);
    });
    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error('storage/_put failed:', error);
    return res.status(500).json({ error: 'Could not write file' });
  }
}
