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

// v8.8: 大文件自动分块上传，规避 Cloudflare 100s 524 超时
// 文件 > CHUNK_SIZE 时切分，每块单独 PUT 到 /api/storage/_put?...&index=N&total=M，
// 全部传完发一次 /api/storage/_put?...&merge=1&total=M 触发服务端流式合并。
// 小文件（<= CHUNK_SIZE）走原直传路径，保持兼容。
const CHUNK_SIZE = 5 * 1024 * 1024; // 5MB — 5MB 在慢带宽下也能在 ~30s 内传完

const uploadSingleChunk = (
  data: Blob,
  uploadUrl: string,
  onProgress?: ProgressHandler,
  progressOffset = 0,
  progressTotal = 0,
): Promise<void> => {
  return new Promise<void>((resolve, reject) => {
    const startTime = Date.now();
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', uploadUrl, true);

    xhr.upload.onprogress = (event) => {
      if (onProgress && event.lengthComputable) {
        onProgress({
          progress: progressOffset + event.loaded,
          total: progressTotal || event.total,
          transferSpeed: event.loaded / ((Date.now() - startTime) / 1000),
        });
      }
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve();
      } else {
        reject(new Error(`Upload failed with status ${xhr.status}`));
      }
    };

    xhr.onerror = () => reject(new Error('Upload failed'));
    xhr.send(data);
  });
};

export const webUpload = async (file: File, uploadUrl: string, onProgress?: ProgressHandler) => {
  const totalSize = file.size;
  const totalChunks = Math.ceil(totalSize / CHUNK_SIZE);

  // 小文件直传 — 走原路径
  if (totalChunks <= 1) {
    return uploadSingleChunk(file, uploadUrl, onProgress, 0, totalSize);
  }

  // 大文件分块上传
  // 解析 uploadUrl 以追加 index/total/merge 参数
  // 兼容绝对 URL (PUBLIC_BASE_URL 场景) 和相对 URL (本地直连场景)
  const urlBase = typeof window !== 'undefined' ? window.location.href : 'http://localhost';
  const urlObj = new URL(uploadUrl, urlBase);
  let uploadedBytes = 0;

  for (let i = 0; i < totalChunks; i++) {
    const start = i * CHUNK_SIZE;
    const end = Math.min(start + CHUNK_SIZE, totalSize);
    const chunk = file.slice(start, end);

    const chunkUrl = new URL(urlObj.toString());
    chunkUrl.searchParams.set('index', String(i));
    chunkUrl.searchParams.set('total', String(totalChunks));

    const chunkSize = end - start;
    await uploadSingleChunk(
      chunk,
      chunkUrl.toString(),
      onProgress,
      uploadedBytes,
      totalSize,
    );
    uploadedBytes += chunkSize;
  }

  // 全部 chunk 上传完成，触发服务端合并
  // merge 请求用一个最小的 PUT + 空 body（保持与 _put.ts 的 method 检查一致）
  const mergeUrl = new URL(urlObj.toString());
  mergeUrl.searchParams.set('merge', '1');
  mergeUrl.searchParams.set('total', String(totalChunks));
  // 删掉 index（如果有）
  mergeUrl.searchParams.delete('index');

  const mergeResp = await fetch(mergeUrl.toString(), {
    method: 'PUT',
    body: new Blob([]),
  });
  if (!mergeResp.ok) {
    const text = await mergeResp.text().catch(() => '');
    throw new Error(`Merge failed: ${mergeResp.status} ${text}`);
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
