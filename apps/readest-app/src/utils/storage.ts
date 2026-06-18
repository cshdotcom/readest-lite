import { getRuntimeConfig } from '@/services/runtimeConfig';

// Readest Lite — 加 'local' 类型，默认 'local'（原项目默认 'r2'）。
type ObjectStorageType = 'r2' | 's3' | 'local';

export const getStorageType = (): ObjectStorageType => {
  const runtimeType = getRuntimeConfig()?.objectStorageType ?? process.env['OBJECT_STORAGE_TYPE'];
  return (runtimeType as ObjectStorageType) || 'local';
};
