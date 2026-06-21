// 本地文件系统存储层。
// 替代 utils/object.ts + utils/r2.ts + utils/s3.ts。
// 保留原 object.ts 的对外 API：getUploadSignedUrl / getDownloadSignedUrl /
// putObject / deleteObject / objectExists / copyObject。
//
// 设计：
// - 文件落地到 /data/books/<file_key 路径>（file_key 形如 "<uid>/Readest/Books/<hash>.epub"）
// - "签名 URL" 改为指向本地内部端点 /api/storage/_put?key=&expires=&sig= 与 /api/storage/_get?key=&expires=&sig=
// - 客户端按原协议 PUT uploadUrl / GET downloadUrl，本服务端校验签名后流式读写本地文件
// - 这样客户端 webUpload / webDownload 零改动
import { createHmac } from 'crypto';
import { promises as fs } from 'fs';
import path from 'path';
import { createReadStream, createWriteStream } from 'fs';

const BOOKS_DIR = process.env['BOOKS_DIR'] || '/data/books';
const INBOX_DIR = process.env['INBOX_DIR'] || '/data/inbox';
const SIGNING_SECRET = process.env['JWT_SECRET'] || 'dev-insecure-secret-change-me';

const UPLOAD_TTL = 1800; // 30 min
const DOWNLOAD_TTL = 1800;

// ───────────────────────────────────────────────────────────────────────────
// 路径解析：把 file_key 映射到本地文件路径，防穿越
// ───────────────────────────────────────────────────────────────────────────
export const isSafeObjectKeyName = (fileName: string): boolean => {
  if (typeof fileName !== 'string' || fileName.length === 0) return false;
  const forms = [fileName];
  try {
    const decoded = decodeURIComponent(fileName);
    if (decoded !== fileName) forms.push(decoded);
  } catch {
    return false;
  }
  for (const form of forms) {
    if (form.includes('\\') || form.includes('\0')) return false;
    if (form.startsWith('/')) return false;
    if (form.split('/').some((seg) => seg === '' || seg === '.' || seg === '..')) return false;
  }
  return true;
};

const resolveLocalPath = (fileKey: string, bucketName?: string): string => {
  const base =
    bucketName && bucketName === 'readest-send-inbox' ? INBOX_DIR : BOOKS_DIR;
  // 防 .. 穿越
  if (fileKey.includes('..')) throw new Error('Invalid fileKey');
  return path.join(base, fileKey);
};

// ───────────────────────────────────────────────────────────────────────────
// HMAC-SHA256 签名 / 验签
// ───────────────────────────────────────────────────────────────────────────
const sign = (payload: string): string => {
  return createHmac('sha256', SIGNING_SECRET).update(payload).digest('hex');
};

// Readest Lite — 签名 URL 的 base：
// - 如果设了 PUBLIC_BASE_URL（如 https://read.example.com），用它（反向代理场景）
// - 否则用请求的 host 拼接绝对 URL（NextResponse.redirect 需要绝对 URL）
const getStorageBase = (): string => {
  const publicBase = process.env['PUBLIC_BASE_URL'];
  if (publicBase) return publicBase.replace(/\/$/, '');
  // 服务端：用容器内地址
  const port = process.env['PORT'] || '8225';
  return `http://127.0.0.1:${port}`;
};

const buildPutUrl = (fileKey: string, expires: number, contentType?: string): string => {
  const exp = Math.floor(Date.now() / 1000) + expires;
  const payload = `PUT|${fileKey}|${exp}`;
  const sig = sign(payload);
  const base = getStorageBase();
  const q = new URLSearchParams({
    key: fileKey,
    expires: String(exp),
    sig,
  });
  if (contentType) q.set('ct', contentType);
  return `${base}/api/storage/_put?${q.toString()}`;
};

const buildGetUrl = (fileKey: string, expires: number, bucketName?: string): string => {
  const exp = Math.floor(Date.now() / 1000) + expires;
  const payload = `GET|${fileKey}|${exp}|${bucketName ?? ''}`;
  const sig = sign(payload);
  const base = getStorageBase();
  const q = new URLSearchParams({
    key: fileKey,
    expires: String(exp),
    sig,
  });
  if (bucketName) q.set('bucket', bucketName);
  return `${base}/api/storage/_get?${q.toString()}`;
};

// ───────────────────────────────────────────────────────────────────────────
// 对外 API（与原 utils/object.ts 完全一致）
// ───────────────────────────────────────────────────────────────────────────
export const getUploadSignedUrl = async (
  fileKey: string,
  _contentLength: number,
  expiresIn: number = UPLOAD_TTL,
  _bucketName?: string,
): Promise<string> => {
  return buildPutUrl(fileKey, expiresIn);
};

export const getDownloadSignedUrl = async (
  fileKey: string,
  expiresIn: number = DOWNLOAD_TTL,
  bucketName?: string,
): Promise<string> => {
  return buildGetUrl(fileKey, expiresIn, bucketName);
};

export const putObject = async (
  fileKey: string,
  body: ArrayBuffer | string | Buffer,
  _contentType: string,
  bucketName?: string,
): Promise<void> => {
  const localPath = resolveLocalPath(fileKey, bucketName);
  await fs.mkdir(path.dirname(localPath), { recursive: true });
  const buf = body instanceof ArrayBuffer ? Buffer.from(body) : Buffer.isBuffer(body) ? body : Buffer.from(body as string);
  await fs.writeFile(localPath, buf);
};

export const deleteObject = async (fileKey: string, bucketName?: string): Promise<void> => {
  const localPath = resolveLocalPath(fileKey, bucketName);
  try {
    await fs.unlink(localPath);
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
  }
};

export const objectExists = async (fileKey: string, bucketName?: string): Promise<boolean> => {
  const localPath = resolveLocalPath(fileKey, bucketName);
  try {
    await fs.access(localPath);
    return true;
  } catch {
    return false;
  }
};

export const copyObject = async (
  sourceFileKey: string,
  destFileKey: string,
  _bucketName?: string,
): Promise<{ ok: boolean; status: number }> => {
  const src = resolveLocalPath(sourceFileKey);
  const dst = resolveLocalPath(destFileKey);
  await fs.mkdir(path.dirname(dst), { recursive: true });
  await fs.copyFile(src, dst);
  return { ok: true, status: 200 };
};

// ───────────────────────────────────────────────────────────────────────────
// 签名校验（供 /api/storage/_put 与 /api/storage/_get 内部使用）
// ───────────────────────────────────────────────────────────────────────────
export const verifyPutSig = (
  fileKey: string,
  expires: number,
  sig: string,
): boolean => {
  if (expires < Math.floor(Date.now() / 1000)) return false;
  const expected = sign(`PUT|${fileKey}|${expires}`);
  return sig === expected;
};

export const verifyGetSig = (
  fileKey: string,
  expires: number,
  sig: string,
  bucketName?: string,
): boolean => {
  if (expires < Math.floor(Date.now() / 1000)) return false;
  const expected = sign(`GET|${fileKey}|${expires}|${bucketName ?? ''}`);
  return sig === expected;
};

// ───────────────────────────────────────────────────────────────────────────
// 流式读取（供 /api/storage/_get 使用，支持 Range）
// ───────────────────────────────────────────────────────────────────────────
export const openReadStream = (fileKey: string, bucketName?: string) => {
  const localPath = resolveLocalPath(fileKey, bucketName);
  return createReadStream(localPath);
};

export const getFileSize = async (fileKey: string, bucketName?: string): Promise<number> => {
  const localPath = resolveLocalPath(fileKey, bucketName);
  const stat = await fs.stat(localPath);
  return stat.size;
};

export const createWriteStreamForKey = (fileKey: string, bucketName?: string) => {
  const localPath = resolveLocalPath(fileKey, bucketName);
  // 同步创建父目录（fileKey 可能是多级路径如 <uid>/Readest/Books/<hash>.epub）
  const dir = path.dirname(localPath);
  try {
    // 同步 mkdirSync，因为 createWriteStream 是同步返回的
    require('fs').mkdirSync(dir, { recursive: true });
  } catch {
    // 目录已存在或其他非致命错误，忽略
  }
  return createWriteStream(localPath);
};

// ───────────────────────────────────────────────────────────────────────────
// v8.8: 分块上传支持 — 大文件 >5MB 自动切分，规避 Cloudflare 100s 524 超时
// 流程：客户端串行 PUT 每块到 /api/storage/_put?...&index=N&total=M →
//       全部传完发一次 /api/storage/_put?...&merge=1&total=M → 服务端流式合并
// ───────────────────────────────────────────────────────────────────────────

// 写第 N 块到 <fileKey>.parts/<NNNNN>（5 位补零，确保字典序 == 数字序）
// 当 index === 0 时先清空 parts 目录，避免上次失败上传残留的旧 part 干扰本次合并
export const createPartWriteStream = (fileKey: string, index: number, total: number) => {
  const localPath = resolveLocalPath(fileKey);
  const partsDir = `${localPath}.parts`;
  const fsSync = require('fs');
  try {
    fsSync.mkdirSync(partsDir, { recursive: true });
  } catch {
    // 目录已存在，忽略
  }
  // index=0 时清空 parts 目录里所有旧文件（重试上传场景）
  if (index === 0) {
    try {
      const oldParts = fsSync.readdirSync(partsDir) as string[];
      for (const old of oldParts) {
        try { fsSync.unlinkSync(path.join(partsDir, old)); } catch { /* ignore */ }
      }
    } catch { /* parts dir not exist, ignore */ }
  }
  const partPath = path.join(partsDir, String(index).padStart(5, '0'));
  void total; // total 仅用于客户端校验，服务端 merge 时从目录扫描
  return createWriteStream(partPath);
};

// 流式合并所有 part 文件到 <fileKey>，完成后删除 parts 目录
// 用 pipeline + Readable.from (concat streams)，避免一次性 buffer 整个大文件到内存
export const mergePartsForKey = async (fileKey: string, expectedTotal: number): Promise<void> => {
  const localPath = resolveLocalPath(fileKey);
  const partsDir = `${localPath}.parts`;

  const partNames = await fs.readdir(partsDir).catch(() => [] as string[]);
  if (partNames.length === 0) {
    throw new Error(`No parts found for ${fileKey}`);
  }
  // 按文件名（数字补零）升序排序
  partNames.sort();

  // 校验：part 数量必须匹配客户端声明的 total
  if (partNames.length !== expectedTotal) {
    throw new Error(
      `Part count mismatch: expected ${expectedTotal}, got ${partNames.length}`,
    );
  }
  // 校验：part 名必须是 0..expectedTotal-1 的补零形式
  for (let i = 0; i < expectedTotal; i++) {
    const expected = String(i).padStart(5, '0');
    if (partNames[i] !== expected) {
      throw new Error(`Missing part ${expected} (found ${partNames[i]})`);
    }
  }

  // 确保目标目录存在
  const targetDir = path.dirname(localPath);
  await fs.mkdir(targetDir, { recursive: true });

  // 流式合并：每个 part createReadStream → pipe 到 target writeStream
  const { Readable } = await import('stream');
  const { pipeline } = await import('stream/promises');

  const partStreams = partNames.map((name) => createReadStream(path.join(partsDir, name)));
  const concat = Readable.from((async function* () {
    for (const s of partStreams) {
      yield* s;
    }
  })());

  const target = createWriteStream(localPath);
  await pipeline(concat, target);

  // 合并成功后删除 parts 目录
  await fs.rm(partsDir, { recursive: true, force: true }).catch(() => {});
};
