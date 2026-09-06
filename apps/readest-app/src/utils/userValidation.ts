// v8.18.9: 用户输入校验共享工具 —— 供 admin 路由和注册路由复用
//
// 1. avatarUrl —— 接受 http(s):// 或 data:image/* 但拒绝 SVG（XSS 风险）
// 2. displayName —— 拒绝 @ / 尖括号 / 引号 / 斜杠 / 控制字符，避免和 email 混淆
//    或注入到 HTML/JSON 渲染中。允许 CJK、字母、数字、空格、点、连字符、下划线。

export const isValidAvatarUrl = (url: string): boolean => {
  const trimmed = url.trim();
  if (!trimmed) return false;
  // 长度上限 2048，避免恶意超长 URL 入库
  if (trimmed.length > 2048) return false;
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:' && parsed.protocol !== 'data:') {
      return false;
    }
    if (parsed.protocol === 'data:') {
      // data:[<mediatype>][;base64],<data>
      // 仅允许 image/* 且非 svg
      const commaIdx = trimmed.indexOf(',');
      if (commaIdx < 0) return false;
      const head = trimmed.slice(0, commaIdx).toLowerCase();
      // head 形如 "data:image/png;base64"
      if (!head.startsWith('data:image/')) return false;
      if (head.startsWith('data:image/svg')) return false; // svg / svg+xml
      return true;
    }
    // http(s): 检查 path 后缀 —— .svg / .svgz 拒绝
    // 注意：有些 CDN 会用 .svg?query 参数，所以先看后缀
    const path = parsed.pathname.toLowerCase();
    if (path.endsWith('.svg') || path.endsWith('.svgz')) return false;
    return true;
  } catch {
    return false;
  }
};

// 不允许的字符：@、尖括号、引号、斜杠、反斜杠、竖线、问号、星号、控制字符。
const INVALID_DISPLAY_NAME_CHARS = /[@<>:"/\\|?*\x00-\x1f]/;

export const isValidDisplayName = (name: string): boolean => {
  const trimmed = name.trim();
  if (!trimmed) return true; // 空允许（会用 email 回退）
  if (trimmed.length > 64) return false;
  return !INVALID_DISPLAY_NAME_CHARS.test(trimmed);
};
