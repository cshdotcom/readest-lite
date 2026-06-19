export interface ReadestRuntimeConfig {
  supabaseUrl?: string;
  supabaseAnonKey?: string;
  apiBaseUrl?: string;
  objectStorageType?: string;
  storageFixedQuota?: number;
  translationFixedQuota?: number;
}

declare global {
  interface Window {
    __READEST_RUNTIME_CONFIG?: ReadestRuntimeConfig;
  }
}

export const getRuntimeConfig = () =>
  typeof window === 'undefined' ? undefined : window.__READEST_RUNTIME_CONFIG;

export const getServerRuntimeConfig = (): ReadestRuntimeConfig => {
  // Readest Lite — 关键修复：所有 URL 字段在容器部署场景下应该用相对路径，
  // 让浏览器自动用当前 origin（无论用户从 localhost / IP / 域名访问都正确）。
  //
  // 原版用 NEXT_PUBLIC_* 构建时烤死的绝对 URL（http://localhost:8225），
  // 部署到 https://read.example.com 后前端会打到 localhost，导致 "Failed to fetch"。
  //
  // 策略：
  // - supabaseUrl: 设为空字符串，前端 supabase.ts 的 getSupabaseUrl() 会用 window.location.origin
  // - apiBaseUrl: 设为 '/api'（相对路径），浏览器自动拼接当前 origin
  // - 用户如果需要指向不同后端，可通过 PUBLIC_BASE_URL env 显式覆盖

  const publicBaseUrl = process.env['PUBLIC_BASE_URL'];

  return {
    // supabaseUrl 留空 — 前端 utils/supabase.ts 会用 window.location.origin
    supabaseUrl: publicBaseUrl || '',
    supabaseAnonKey: (process.env['SUPABASE_ANON_KEY'] ?? process.env['NEXT_PUBLIC_SUPABASE_ANON_KEY']) || 'anon',
    // apiBaseUrl 用相对路径 /api，浏览器自动用当前 origin
    apiBaseUrl: publicBaseUrl ? `${publicBaseUrl}/api` : '/api',
    objectStorageType:
      process.env['OBJECT_STORAGE_TYPE'] ?? process.env['NEXT_PUBLIC_OBJECT_STORAGE_TYPE'] ?? 'local',
    storageFixedQuota: (() => {
      const raw =
        process.env['STORAGE_FIXED_QUOTA'] ?? process.env['NEXT_PUBLIC_STORAGE_FIXED_QUOTA'];
      return raw ? parseInt(raw, 10) : undefined;
    })(),
    translationFixedQuota: (() => {
      const raw =
        process.env['TRANSLATION_FIXED_QUOTA'] ?? process.env['NEXT_PUBLIC_TRANSLATION_FIXED_QUOTA'];
      return raw ? parseInt(raw, 10) : undefined;
    })(),
  };
};
