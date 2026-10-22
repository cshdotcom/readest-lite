import { invoke, Channel } from '@tauri-apps/api/core';

export type UploadMethod = 'POST' | 'PUT';

export const enum UploadFileError {
  Unauthorized = 'Unauthorized access',
  DownloadFailed = 'File download failed',
}

export interface ProgressPayload {
  progress: number;
  total: number;
  transferSpeed: number;
}

export type ProgressHandler = (progress: ProgressPayload) => void;

/**
 * Percentage sentinel for "running, but the byte total is unknown". Chunked
 * responses, buffered fallbacks and queued-but-not-started transfers have no
 * total to divide by; reporting 0 there renders as a frozen 0%, so progress
 * surfaces render this as an indeterminate state instead.
 */
export const INDETERMINATE_PROGRESS = -1;

/** Bytes to a 0-100 percentage, or {@link INDETERMINATE_PROGRESS}. */
export const toProgressPercent = (progress: ProgressPayload): number =>
  progress.total > 0 ? (progress.progress / progress.total) * 100 : INDETERMINATE_PROGRESS;

export interface ProgressThrottle {
  /** Record a progress payload, emitting at most once per interval. */
  push: (progress: ProgressPayload) => void;
  /** Emit any pending payload immediately (e.g. when the transfer finishes). */
  flush: () => void;
  /** Drop any pending payload and clear the trailing timer. */
  cancel: () => void;
}

/**
 * Coalesce high-frequency progress emissions to at most one per `intervalMs`
 * (leading + trailing edges). Web and native download streams call onProgress
 * once per chunk, often as a dense microtask burst for already-buffered sources
 * (`while (true) { await reader.read(); onProgress(...) }`), and `transferSpeed`
 * is recomputed from wall-clock time on every call. Emitting each one churns the
 * transfer store per chunk and sustains a synchronous React update storm past
 * the nested-update limit (Sentry READEST-2). Throttling caps store writes and
 * defers the trailing emit to a macrotask, so the render fan-out cannot loop.
 */
export const createProgressThrottle = (
  emit: (progress: ProgressPayload) => void,
  intervalMs: number,
): ProgressThrottle => {
  let lastEmit = Number.NEGATIVE_INFINITY;
  let pending: ProgressPayload | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const fire = () => {
    timer = null;
    if (!pending) return;
    const payload = pending;
    pending = null;
    lastEmit = Date.now();
    emit(payload);
  };

  return {
    push: (progress) => {
      pending = progress;
      const elapsed = Date.now() - lastEmit;
      if (elapsed >= intervalMs) {
        fire();
      } else if (timer === null) {
        timer = setTimeout(fire, intervalMs - elapsed);
      }
    },
    flush: () => {
      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
      }
      fire();
    },
    cancel: () => {
      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
      }
      pending = null;
    },
  };
};

// ───────────────────────────────────────────────────────────────────────────
// 分块上传常量 — 与 v8.8 服务端分块协议对齐（/api/storage/_put index/total/merge）
// 阈值 5MB：
//   - 规避 Cloudflare 反代 100s origin timeout（CF 524）：慢带宽下每块也能
//     在 ~30s 内传完（v8.8 原始动机）
//   - 双保险：Next.js 16 对 middleware 匹配的带 body 请求默认 10MB
//     cloneable-body 截断（issue #8），middleware matcher 已排除 _put，
//     但分块使每块 body 远小于任何潜在的代理层限制
export const UPLOAD_CHUNK_THRESHOLD = 5 * 1024 * 1024; // ≤5MB 走整传
export const UPLOAD_CHUNK_SIZE = 5 * 1024 * 1024; // 每块 5MB

/**
 * 把分块参数追加到签名 uploadUrl（key/expires/sig 不动，index/total/merge
 * 只是服务端 _put.ts 的路由参数，不参与 HMAC 签名）。
 * 用 window.location.href 作 base 解析，兼容绝对 URL（PUBLIC_BASE_URL 反代
 * 场景）与相对 URL（本地直连场景）。
 */
const withQueryParams = (uploadUrl: string, params: Record<string, string>): string => {
  const url = new URL(uploadUrl, window.location.href);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  return url.toString();
};

const webUploadSingle = (
  file: Blob,
  uploadUrl: string,
  onProgress?: ProgressHandler,
  progressBase = 0,
  progressTotal = 0,
) => {
  return new Promise<void>((resolve, reject) => {
    const startTime = Date.now();
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', uploadUrl, true);

    // 进度跨块累计：progressBase 是之前块已完成的总字节数。
    // progressTotal=0（整传路径）时回退为单文件语义。
    if (onProgress && progressTotal > 0) {
      const baseStartTime = startTime - 0;
      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) {
          onProgress({
            progress: progressBase + event.loaded,
            total: progressTotal,
            transferSpeed: (progressBase + event.loaded) / ((Date.now() - baseStartTime) / 1000),
          });
        }
      };
    } else if (onProgress) {
      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) {
          onProgress({
            progress: event.loaded,
            total: event.total,
            transferSpeed: event.loaded / ((Date.now() - startTime) / 1000),
          });
        }
      };
    }

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve();
      } else {
        reject(new Error(`Upload failed with status ${xhr.status}`));
      }
    };

    xhr.onerror = () => reject(new Error('Upload failed'));

    xhr.send(file);
  });
};

/**
 * Web 客户端上传。≤5MB 走整传（零行为变化）；>5MB 自动切 5MB 块串行
 * PUT &index=N&total=M，最后发一次 &merge=1&total=M 触发服务端流式合并。
 * 进度回调跨块累计，UI 显示连续进度条。
 */
export const webUpload = async (file: File, uploadUrl: string, onProgress?: ProgressHandler) => {
  if (file.size <= UPLOAD_CHUNK_THRESHOLD) {
    // 小文件：单次 PUT（原路径）
    return webUploadSingle(file, uploadUrl, onProgress);
  }

  // 大文件：分块串行 PUT → merge
  const totalChunks = Math.ceil(file.size / UPLOAD_CHUNK_SIZE);
  for (let index = 0; index < totalChunks; index++) {
    const start = index * UPLOAD_CHUNK_SIZE;
    const end = Math.min(start + UPLOAD_CHUNK_SIZE, file.size);
    const chunk = file.slice(start, end);
    const chunkUrl = withQueryParams(uploadUrl, {
      index: String(index),
      total: String(totalChunks),
    });
    // 传入累计基数：start 是之前所有块（已传完）的总字节
    await webUploadSingle(chunk, chunkUrl, onProgress, start, file.size);
  }

  // 所有块传完 → 触发服务端合并（空 body PUT）
  const mergeUrl = withQueryParams(uploadUrl, {
    merge: '1',
    total: String(totalChunks),
  });
  const response = await fetch(mergeUrl, { method: 'PUT' });
  if (!response.ok) {
    let detail = '';
    try {
      detail = (await response.json()).error ?? '';
    } catch {
      // 响应体不是 JSON 时忽略
    }
    throw new Error(
      `Chunked upload merge failed with status ${response.status}${detail ? `: ${detail}` : ''}`,
    );
  }
};

export const webDownload = async (
  downloadUrl: string,
  onProgress?: ProgressHandler,
  headers?: Record<string, string>,
) => {
  const response = await fetch(downloadUrl, {
    method: 'GET',
    headers: headers ? headers : undefined,
  });
  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      throw new Error(UploadFileError.Unauthorized);
    }
    throw new Error(UploadFileError.DownloadFailed);
  }

  const responseHeaders = Object.fromEntries(response.headers.entries());
  const contentLength =
    response.headers.get('Content-Length') || response.headers.get('X-Content-Length');
  // R2/S3 signed URLs frequently don't expose Content-Length over CORS, so
  // missing length is common in the wild. Fall back to indeterminate
  // progress (total=0) instead of failing the download. UI callers already
  // guard `total === 0` to skip percentage updates.
  const totalSize = parseInt(contentLength || '0', 10);
  let receivedSize = 0;
  const reader = response.body!.getReader();
  const chunks: Uint8Array[] = [];

  const startTime = Date.now();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    chunks.push(value);
    receivedSize += value.length;

    if (onProgress) {
      onProgress({
        progress: receivedSize,
        total: totalSize,
        transferSpeed: receivedSize / ((Date.now() - startTime) / 1000),
      });
    }
  }

  return { headers: responseHeaders, blob: new Blob(chunks as BlobPart[]) };
};

export const tauriUpload = async (
  url: string,
  filePath: string,
  method: UploadMethod,
  progressHandler?: ProgressHandler,
  headers?: Map<string, string>,
): Promise<string> => {
  const ids = new Uint32Array(1);
  window.crypto.getRandomValues(ids);
  const id = ids[0];

  const onProgress = new Channel<ProgressPayload>();
  if (progressHandler) {
    onProgress.onmessage = progressHandler;
  }

  return await invoke('upload_file', {
    id,
    url,
    filePath,
    method,
    headers: headers ?? {},
    onProgress,
  });
};

export const tauriDownload = async (
  url: string,
  filePath: string,
  progressHandler?: ProgressHandler,
  headers?: Record<string, string>,
  body?: string,
  singleThreaded?: boolean,
  skipSslVerification?: boolean,
): Promise<Record<string, string>> => {
  const ids = new Uint32Array(1);
  window.crypto.getRandomValues(ids);
  const id = ids[0];

  const onProgress = new Channel<ProgressPayload>();
  if (progressHandler) {
    onProgress.onmessage = progressHandler;
  }

  const responseHeaders = await invoke<Record<string, string>>('download_file', {
    id,
    url,
    filePath,
    headers: headers ?? {},
    onProgress,
    body,
    singleThreaded,
    skipSslVerification,
  });
  return responseHeaders;
};
