import { READEST_WEB_BASE_URL } from '@/services/constants';
import { getRuntimeConfig } from '@/services/runtimeConfig';

export type AnnotationDeepLink = {
  bookHash: string;
  noteId: string;
  cfi?: string;
};

/**
 * Which form of annotation link markdown export embeds: the custom-scheme
 * `readest://` app deeplink or the universal `https://` web link.
 */
export type AnnotationLinkType = 'app' | 'web';

const ANNOTATION_PATH_PREFIX = '/o/book/';

/**
 * v8.10.2: 运行时解析 web base URL。
 *
 * 旧实现直接用构建期的 READEST_WEB_BASE_URL（Readest Lite 里硬编码为 ''），
 * 导致导出的笔记链接是相对路径 `/o/book/...`——用户在站外（GitHub / Obsidian /
 * VS Code）点开就找不到，浏览器报「无法打开此书籍」。
 *
 * 新实现按优先级解析：
 * 1. 浏览器运行时：runtimeConfig.apiBaseUrl（运行时配置注入的完整 URL）
 * 2. 浏览器运行时：window.location.origin（当前部署的实际 origin）
 * 3. 构建期常量 READEST_WEB_BASE_URL（兜底，通常为空）
 * 4. 服务端：构建期常量（用于 SSR / 邮件模板等）
 */
const resolveWebBaseUrl = (): string => {
  // 浏览器运行时：优先用 runtime-config 注入的 URL（反代场景下与 PUBLIC_BASE_URL 一致）
  if (typeof window !== 'undefined') {
    const cfg = getRuntimeConfig();
    if (cfg?.apiBaseUrl && cfg.apiBaseUrl.startsWith('http')) {
      return cfg.apiBaseUrl.replace(/\/api$/, '').replace(/\/$/, '');
    }
    // 回退到当前 origin（用户直接 IP:端口 访问，没设 PUBLIC_BASE_URL 的情况）
    return window.location.origin;
  }
  // 服务端：用构建期常量
  return READEST_WEB_BASE_URL;
};

/**
 * Build the canonical HTTPS URL for an annotation. Used in markdown export
 * and Readwise sync. Mobile App Links (web.readest.com) intercept this URL
 * and open the native app; on desktop browsers it resolves to the smart
 * landing page at /o/book/{hash}/annotation/{id}.
 *
 * v8.10.2: 返回绝对 URL（包含 host），让用户在站外点击也能打开。
 */
export const buildAnnotationWebUrl = ({ bookHash, noteId, cfi }: AnnotationDeepLink): string => {
  const base = `${resolveWebBaseUrl()}${ANNOTATION_PATH_PREFIX}${bookHash}/annotation/${noteId}`;
  return cfi ? `${base}?cfi=${encodeURIComponent(cfi)}` : base;
};

/**
 * Build the custom-scheme URL. Kept as a parallel form for share-sheet flows
 * and direct deeplink scenarios. Markdown export uses the HTTPS form.
 */
export const buildAnnotationAppUrl = ({ bookHash, noteId, cfi }: AnnotationDeepLink): string => {
  const base = `readest://book/${bookHash}/annotation/${noteId}`;
  return cfi ? `${base}?cfi=${encodeURIComponent(cfi)}` : base;
};

/**
 * Build the annotation link for the requested {@link AnnotationLinkType}.
 * `app` yields the custom-scheme deeplink; `web` yields the universal HTTPS form.
 */
export const buildAnnotationUrl = (
  link: AnnotationDeepLink,
  linkType: AnnotationLinkType,
): string => (linkType === 'app' ? buildAnnotationAppUrl(link) : buildAnnotationWebUrl(link));

/**
 * Parse an incoming readest:// or https://web.readest.com annotation URL.
 * Accepts the new hierarchical form (book/{hash}/annotation/{id}) and the
 * legacy flat form (annotation/{hash}/{id}) emitted by older Readwise syncs.
 * Returns null if the URL doesn't match.
 */
export const parseAnnotationDeepLink = (url: string): AnnotationDeepLink | null => {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }

  const isCustomScheme = parsed.protocol === 'readest:';
  const isWebHost =
    (parsed.protocol === 'https:' || parsed.protocol === 'http:') &&
    parsed.host === 'web.readest.com';
  if (!isCustomScheme && !isWebHost) return null;

  // For readest:// URLs the URL parser stores the first path segment in the
  // host. Reconstruct a uniform segment list across both schemes.
  const segments: string[] = isCustomScheme
    ? [parsed.host, ...parsed.pathname.split('/')].filter(Boolean)
    : parsed.pathname.split('/').filter(Boolean);

  // HTTPS landing page is prefixed with /o/. Strip it for uniform parsing.
  if (isWebHost) {
    if (segments[0] !== 'o') return null;
    segments.shift();
  }

  const cfiParam = parsed.searchParams.get('cfi');
  const cfi = cfiParam ? cfiParam : undefined;

  // Hierarchical: book/{hash}/annotation/{id}
  if (segments.length === 4 && segments[0] === 'book' && segments[2] === 'annotation') {
    return { bookHash: segments[1]!, noteId: segments[3]!, cfi };
  }

  // Legacy flat: annotation/{hash}/{id}
  if (segments.length === 3 && segments[0] === 'annotation') {
    return { bookHash: segments[1]!, noteId: segments[2]!, cfi };
  }

  return null;
};
