// 替换原 utils/supabase.ts。
// 把 @supabase/supabase-js 的客户端替换为一个"伪 supabase" 对象，
// 仅暴露前端在用的几个方法：auth.getUser / auth.getSession / auth.setSession /
// auth.refreshSession / auth.signOut / auth.onAuthStateChange。
//
// 这些方法实际打到本地 /auth/v1/* 兼容端点上（见 app/api/auth/[...path]/route.ts）。
// 这样前端 AuthContext / helpers/auth.ts 完全不需要改动。
//
// 关键：不能静态 import localAuth（含 argon2/prisma）— 会被打到客户端 bundle。
// AuthContext 在客户端运行，import supabase.ts，再 import localAuth 会拉入
// argon2 -> node-gyp-build -> 'fs'，浏览器 build 失败。
// 改为 dynamic import，getUser 时按需加载。
import type { AuthUser } from './localAuth';

// 仅类型 re-export，运行时不加载
export type { AuthUser };

// ───────────────────────────────────────────────────────────────────────────
// SUPABASE_URL 必须运行时动态计算，不能在模块加载时静态求值。
//
// 原因：NEXT_PUBLIC_SUPABASE_URL 是 Next.js 构建时烤死的变量，构建镜像时
// 用 http://localhost:8225，部署到 https://read.example.com 后前端仍会
// 打到 localhost，导致 "Failed to fetch"。
//
// 修复策略：浏览器里始终用 window.location.origin（即用户当前访问的域名），
// 服务端（SSR）才用 env 变量。
// ───────────────────────────────────────────────────────────────────────────
const getSupabaseUrl = (): string => {
  if (typeof window !== 'undefined') {
    // 浏览器：始终用当前页面 origin，无论用户从 localhost / IP / 域名访问都正确
    return window.location.origin;
  }
  // 服务端 SSR：用 env 变量（运行时由 PUBLIC_BASE_URL 注入到 runtime-config.js）
  // NEXT_PUBLIC_SUPABASE_URL 在构建时设为空字符串，所以需要 fallback
  return process.env['NEXT_PUBLIC_SUPABASE_URL'] || 'http://localhost:8225';
};

// ───────────────────────────────────────────────────────────────────────────
// 极简的"伪 supabase auth client"。仅兼容前端在用的调用形态。
// ───────────────────────────────────────────────────────────────────────────
type AuthStateListener = (
  event: string,
  session: { access_token: string; refresh_token: string; user: AuthUser } | null,
) => void;

class LocalAuthClient {
  private listeners: AuthStateListener[] = [];

  async getUser(token?: string) {
    const accessToken =
      token ??
      (typeof localStorage !== 'undefined' ? localStorage.getItem('token') ?? undefined : undefined);
    if (!accessToken) {
      return { data: { user: null }, error: { message: 'no token' } };
    }
    // dynamic import 避免客户端 build 时拉入 argon2/prisma
    const { verifyAccessToken } = await import('./localAuth');
    const user = verifyAccessToken(accessToken);
    if (!user) {
      return { data: { user: null }, error: { message: 'invalid token' } };
    }
    return { data: { user }, error: null };
  }

  async getSession() {
    if (typeof localStorage === 'undefined') {
      return { data: { session: null } };
    }
    const access_token = localStorage.getItem('token');
    const refresh_token = localStorage.getItem('refresh_token');
    const userJson = localStorage.getItem('user');
    if (!access_token || !userJson) {
      return { data: { session: null } };
    }
    try {
      const user = JSON.parse(userJson) as AuthUser;
      return {
        data: {
          session: {
            access_token,
            refresh_token: refresh_token ?? '',
            user,
            expires_at: 0,
          } as unknown,
        },
      };
    } catch {
      return { data: { session: null } };
    }
  }

  async setSession({
    access_token,
    refresh_token,
  }: {
    access_token: string;
    refresh_token: string;
  }) {
    // dynamic import 避免客户端 build 时拉入 argon2/prisma
    const { verifyAccessToken } = await import('./localAuth');
    const user = verifyAccessToken(access_token);
    if (!user) {
      return { data: { session: null }, error: { message: 'invalid token' } };
    }
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('token', access_token);
      localStorage.setItem('refresh_token', refresh_token);
      localStorage.setItem('user', JSON.stringify(user));
    }
    this.emit('SIGNED_IN', { access_token, refresh_token, user });
    return {
      data: {
        session: { access_token, refresh_token, user, expires_at: 0 } as unknown,
      },
      error: null,
    };
  }

  async refreshSession() {
    if (typeof localStorage === 'undefined') return { data: { session: null }, error: null };
    const refresh_token = localStorage.getItem('refresh_token');
    if (!refresh_token) return { data: { session: null }, error: null };

    try {
      const resp = await fetch(`${getSupabaseUrl()}/auth/v1/token?grant_type=refresh_token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: 'anon' },
        body: JSON.stringify({ refresh_token }),
      });
      if (!resp.ok) {
        this.emit('SIGNED_OUT', null);
        return { data: { session: null }, error: { message: 'refresh failed' } };
      }
      const session = await resp.json();
      localStorage.setItem('token', session.access_token);
      localStorage.setItem('refresh_token', session.refresh_token);
      localStorage.setItem('user', JSON.stringify(session.user));
      this.emit('SIGNED_IN', session);
      return { data: { session }, error: null };
    } catch {
      this.emit('SIGNED_OUT', null);
      return { data: { session: null }, error: { message: 'refresh failed' } };
    }
  }

  async signOut() {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem('token');
      localStorage.removeItem('refresh_token');
      localStorage.removeItem('user');
    }
    this.emit('SIGNED_OUT', null);
    return { error: null };
  }

  // 兼容原 supabase.auth.updateUser() — Lite 单账号模式下禁用邮箱修改，
  // 返回错误让前端提示用户。
  async updateUser(_attrs: { email?: string; password?: string; data?: Record<string, unknown> }) {
    return {
      data: { user: null },
      error: { message: 'Email update is disabled in Readest Lite.' },
    };
  }

  // 兼容原 supabase.auth.signInWithOAuth() — Lite 不支持 OAuth
  async signInWithOAuth(_opts: {
    provider: string;
    options?: { redirectTo?: string; scopes?: string; skipBrowserRedirect?: boolean };
  }) {
    return {
      data: { url: null, provider: null },
      error: { message: 'OAuth is disabled in Readest Lite. Use email/password.' },
    };
  }

  // 兼容原 supabase.auth.signInWithIdToken() — Lite 不支持
  async signInWithIdToken(_opts: { provider: string; token: string }) {
    return {
      data: { user: null, session: null },
      error: { message: 'ID token sign-in is disabled in Readest Lite.' },
    };
  }

  async signInWithPassword({ email, password }: { email: string; password: string }) {
    const resp = await fetch(`${getSupabaseUrl()}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: 'anon' },
      body: JSON.stringify({ email, password }),
    });
    const data = await resp.json();
    if (!resp.ok) {
      return { data: { session: null, user: null }, error: { message: data.error_description || data.error || 'login failed' } };
    }
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('token', data.access_token);
      localStorage.setItem('refresh_token', data.refresh_token);
      localStorage.setItem('user', JSON.stringify(data.user));
    }
    this.emit('SIGNED_IN', data);
    return { data: { session: data, user: data.user }, error: null };
  }

  onAuthStateChange(listener: AuthStateListener) {
    this.listeners.push(listener);
    return {
      data: {
        subscription: {
          unsubscribe: () => {
            this.listeners = this.listeners.filter((l) => l !== listener);
          },
        },
      },
    };
  }

  private emit(event: string, session: { access_token: string; refresh_token: string; user: AuthUser } | null) {
    for (const l of this.listeners) l(event, session);
  }
}

class LocalSupabaseClient {
  auth = new LocalAuthClient();
  // 表直查路径——本改造已全部走 Next API，supabase.from(...) 不再使用；
  // 保留空实现以兼容潜在 import。
  from(_table: string) {
    throw new Error('supabase.from() is deprecated in readest-lite; use Next API routes');
  }
}

export const supabase = new LocalSupabaseClient();
export const createSupabaseClient = (_token?: string) => supabase;
export const createSupabaseAdminClient = () => supabase;
