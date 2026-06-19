// 本地 JWT 鉴权层。
// 替代 supabase.auth.getUser(token) / supabase.auth.refreshSession() 等。
// 完全兼容前端 utils/access.ts 对 JWT 声明的读取。
import jwt, { JwtPayload } from 'jsonwebtoken';
import argon2 from 'argon2';
import { randomUUID } from 'crypto';
import { prismaClient } from './db';

const JWT_SECRET = process.env['JWT_SECRET'] || 'dev-insecure-secret-change-me';
const JWT_EXP_SECONDS = parseInt(process.env['JWT_EXP_SECONDS'] || '604800', 10); // 7 天
const REFRESH_EXP_SECONDS = parseInt(process.env['REFRESH_EXP_SECONDS'] || '2592000', 10); // 30 天
const ISSUER = 'readest-lite';
const AUDIENCE = 'authenticated';

export interface AuthUser {
  id: string;
  email: string;
  aud: string;
  role: string;
  app_metadata: Record<string, unknown>;
  user_metadata: Record<string, unknown>;
  created_at: string;
}

export interface AuthSession {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  expires_at: number;
  token_type: 'bearer';
  user: AuthUser;
}

// ───────────────────────────────────────────────────────────────────────────
// JWT 签发
// ───────────────────────────────────────────────────────────────────────────
const signAccessToken = (user: AuthUser): string => {
  return jwt.sign(
    {
      iss: ISSUER,
      aud: AUDIENCE,
      role: 'authenticated',
      email: user.email,
      aal: 'aal1',
      session_id: randomUUID(),
      // 兼容前端 utils/access.ts 读取的 plan / storage_* 字段：
      // Pro 体系已删除 → 全部按 'pro' + 无限配额返回，所有 plan 判断恒为已升级。
      plan: 'pro',
      storage_usage_bytes: 0,
      storage_purchased_bytes: Number.MAX_SAFE_INTEGER,
      is_anonymous: false,
    },
    JWT_SECRET,
    {
      algorithm: 'HS256',
      subject: user.id,
      expiresIn: JWT_EXP_SECONDS,
    },
  );
};

const signRefreshToken = (userId: string): string => {
  return jwt.sign(
    { iss: ISSUER, aud: AUDIENCE, sub: userId, type: 'refresh' },
    JWT_SECRET,
    { algorithm: 'HS256', expiresIn: REFRESH_EXP_SECONDS },
  );
};

// ───────────────────────────────────────────────────────────────────────────
// 校验 access token，返回 AuthUser（替代 supabase.auth.getUser）
// ───────────────────────────────────────────────────────────────────────────
export const verifyAccessToken = (token: string): AuthUser | null => {
  try {
    const payload = jwt.verify(token, JWT_SECRET, {
      algorithms: ['HS256'],
      issuer: ISSUER,
      audience: AUDIENCE,
    }) as JwtPayload & { sub: string; email: string };

    return {
      id: payload.sub!,
      email: payload.email,
      aud: AUDIENCE,
      role: 'authenticated',
      app_metadata: {},
      user_metadata: {},
      created_at: new Date((payload.iat ?? 0) * 1000).toISOString(),
    };
  } catch {
    return null;
  }
};

export const verifyRefreshToken = (token: string): { userId: string } | null => {
  try {
    const payload = jwt.verify(token, JWT_SECRET, {
      algorithms: ['HS256'],
      issuer: ISSUER,
      audience: AUDIENCE,
    }) as JwtPayload & { sub: string; type?: string };
    if (payload.type !== 'refresh') return null;
    return { userId: payload.sub };
  } catch {
    return null;
  }
};

// ───────────────────────────────────────────────────────────────────────────
// 替代 utils/access.ts::validateUserAndToken
// 路由调用：const { user, token } = await validateUserAndToken(req.headers.get('authorization'))
// ───────────────────────────────────────────────────────────────────────────
export const validateUserAndToken = async (
  authHeader: string | null | undefined,
): Promise<{ user?: AuthUser; token?: string }> => {
  if (!authHeader) return {};
  const token = authHeader.replace(/^Bearer\s+/i, '');
  const user = verifyAccessToken(token);
  if (!user) return {};
  // 单账号模式：仅允许本地存在的用户
  const dbUser = await prismaClient.user.findUnique({ where: { id: user.id } });
  if (!dbUser) return {};
  return { user, token };
};

// ───────────────────────────────────────────────────────────────────────────
// 邮箱密码登录（替代 supabase.auth.signInWithPassword）
// ───────────────────────────────────────────────────────────────────────────
export const signInWithPassword = async (
  email: string,
  password: string,
): Promise<AuthSession> => {
  const user = await prismaClient.user.findUnique({ where: { email: email.toLowerCase() } });
  if (!user) throw new Error('Invalid login credentials');
  const ok = await argon2.verify(user.encryptedPass, password);
  if (!ok) throw new Error('Invalid login credentials');

  await prismaClient.user.update({
    where: { id: user.id },
    data: { lastSignInAt: new Date() },
  });

  const authUser: AuthUser = {
    id: user.id,
    email: user.email,
    aud: AUDIENCE,
    role: 'authenticated',
    app_metadata: {},
    user_metadata: {},
    created_at: user.createdAt.toISOString(),
  };
  const access_token = signAccessToken(authUser);
  const refresh_token = signRefreshToken(user.id);
  return {
    access_token,
    refresh_token,
    expires_in: JWT_EXP_SECONDS,
    expires_at: Math.floor(Date.now() / 1000) + JWT_EXP_SECONDS,
    token_type: 'bearer',
    user: authUser,
  };
};

// ───────────────────────────────────────────────────────────────────────────
// 刷新会话（替代 supabase.auth.refreshSession）
// ───────────────────────────────────────────────────────────────────────────
export const refreshSession = async (refreshToken: string): Promise<AuthSession | null> => {
  const decoded = verifyRefreshToken(refreshToken);
  if (!decoded) return null;
  const user = await prismaClient.user.findUnique({ where: { id: decoded.userId } });
  if (!user) return null;

  const authUser: AuthUser = {
    id: user.id,
    email: user.email,
    aud: AUDIENCE,
    role: 'authenticated',
    app_metadata: {},
    user_metadata: {},
    created_at: user.createdAt.toISOString(),
  };
  return {
    access_token: signAccessToken(authUser),
    refresh_token: signRefreshToken(user.id),
    expires_in: JWT_EXP_SECONDS,
    expires_at: Math.floor(Date.now() / 1000) + JWT_EXP_SECONDS,
    token_type: 'bearer',
    user: authUser,
  };
};

// ───────────────────────────────────────────────────────────────────────────
// 初始化管理员账号（容器启动时调用一次）
// 用 UUID v5(ADMIN_EMAIL) 作为 user_id，保持外键类型一致。
// ───────────────────────────────────────────────────────────────────────────
import { createHash } from 'crypto';

const uuidV5 = (name: string, namespace = '6ba7b810-9dad-11d1-80b4-00c04fd430c8'): string => {
  const nsBytes = Buffer.from(namespace.replace(/-/g, ''), 'hex');
  const nameBytes = Buffer.from(name, 'utf8');
  const hash = createHash('sha1').update(Buffer.concat([nsBytes, nameBytes])).digest();
  hash[6] = (hash[6]! & 0x0f) | 0x50; // version 5
  hash[8] = (hash[8]! & 0x3f) | 0x80; // variant
  const hex = hash.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
};

export const ensureAdminUser = async (): Promise<void> => {
  const email = (process.env['ADMIN_EMAIL'] || '').toLowerCase().trim();
  const password = process.env['ADMIN_PASSWORD'] || '';
  if (!email || !password) {
    throw new Error('ADMIN_EMAIL and ADMIN_PASSWORD must be set');
  }
  const userId = uuidV5(email);
  const existing = await prismaClient.user.findUnique({ where: { id: userId } });
  if (existing) {
    // 密码可能 env 改过 → 同步
    const samePass = await argon2.verify(existing.encryptedPass, password).catch(() => false);
    if (!samePass) {
      const encryptedPass = await argon2.hash(password);
      await prismaClient.user.update({
        where: { id: userId },
        data: { encryptedPass, email },
      });
      console.log(`[init] admin password updated for ${email}`);
    }
    return;
  }
  const encryptedPass = await argon2.hash(password);
  await prismaClient.user.create({
    data: {
      id: userId,
      email,
      encryptedPass,
    },
  });
  console.log(`[init] admin user created: ${email} (${userId})`);
};
