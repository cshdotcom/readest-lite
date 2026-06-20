// 本地 JWT 鉴权层 — 多用户支持
// 替代 supabase.auth.getUser(token) / supabase.auth.refreshSession() 等。
import jwt, { JwtPayload } from 'jsonwebtoken';
import argon2 from 'argon2';
import { randomUUID } from 'crypto';
import { prismaClient } from './db';

const JWT_SECRET = process.env['JWT_SECRET'] || (
  process.env['ADMIN_EMAIL'] && process.env['ADMIN_PASSWORD']
    ? `readest-lite-${process.env['ADMIN_EMAIL']}-${process.env['ADMIN_PASSWORD']}`
    : 'dev-insecure-secret-change-me'
);
const JWT_EXP_SECONDS = parseInt(process.env['JWT_EXP_SECONDS'] || '604800', 10);
const REFRESH_EXP_SECONDS = parseInt(process.env['REFRESH_EXP_SECONDS'] || '2592000', 10);
const ISSUER = 'readest-lite';
const AUDIENCE = 'authenticated';

export interface AuthUser {
  id: string;
  email: string;
  aud: string;
  role: string; // 'authenticated' (Supabase 兼容)
  app_metadata: Record<string, unknown>;
  user_metadata: Record<string, unknown>;
  created_at: string;
  // Readest Lite 扩展字段
  userRole?: string; // 'admin' | 'user'
  displayName?: string | null;
  storageQuotaMB?: number;
  translationQuotaKB?: number;
}

export interface AuthSession {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  expires_at: number;
  token_type: 'bearer';
  user: AuthUser;
  // v8.4: 加密的 vault 密钥（base64 JSON CipherEnvelope），客户端用密码派生 KE 解密
  encryptedVaultKey?: string | null;
}

// ───────────────────────────────────────────────────────────────────────────
// JWT 签发 — 包含 role / quota 信息
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
      plan: 'pro',
      storage_usage_bytes: 0,
      storage_purchased_bytes: Number.MAX_SAFE_INTEGER,
      is_anonymous: false,
      // Readest Lite 多用户字段
      user_role: user.userRole || 'user',
      display_name: user.displayName || null,
      storage_quota_mb: user.storageQuotaMB ?? 0,
      translation_quota_kb: user.translationQuotaKB ?? 0,
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
// 校验 access token
// ───────────────────────────────────────────────────────────────────────────
export const verifyAccessToken = (token: string): AuthUser | null => {
  try {
    const payload = jwt.verify(token, JWT_SECRET, {
      algorithms: ['HS256'],
      issuer: ISSUER,
      audience: AUDIENCE,
    }) as JwtPayload & {
      sub: string; email: string;
      user_role?: string; display_name?: string | null;
      storage_quota_mb?: number; translation_quota_kb?: number;
    };

    return {
      id: payload.sub!,
      email: payload.email,
      aud: AUDIENCE,
      role: 'authenticated',
      app_metadata: {},
      user_metadata: {},
      created_at: new Date((payload.iat ?? 0) * 1000).toISOString(),
      userRole: payload.user_role || 'user',
      displayName: payload.display_name ?? null,
      storageQuotaMB: payload.storage_quota_mb ?? 0,
      translationQuotaKB: payload.translation_quota_kb ?? 0,
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
// validateUserAndToken — 验证 token + 查库确认用户存在
// ───────────────────────────────────────────────────────────────────────────
export const validateUserAndToken = async (
  authHeader: string | null | undefined,
): Promise<{ user?: AuthUser; token?: string }> => {
  if (!authHeader) return {};
  const token = authHeader.replace(/^Bearer\s+/i, '');
  const user = verifyAccessToken(token);
  if (!user) return {};
  const dbUser = await prismaClient.user.findUnique({ where: { id: user.id } });
  if (!dbUser) return {};
  // 从数据库刷新 role/quota（防止 JWT 过期后权限变更不生效）
  user.userRole = dbUser.role;
  user.displayName = dbUser.displayName;
  user.storageQuotaMB = dbUser.storageQuotaMB;
  user.translationQuotaKB = dbUser.translationQuotaKB;
  return { user, token };
};

// ───────────────────────────────────────────────────────────────────────────
// validateAdmin — 仅管理员可通过
// ───────────────────────────────────────────────────────────────────────────
export const validateAdmin = async (
  authHeader: string | null | undefined,
): Promise<{ user?: AuthUser; token?: string }> => {
  const result = await validateUserAndToken(authHeader);
  if (!result.user || result.user.userRole !== 'admin') return {};
  return result;
};

// ───────────────────────────────────────────────────────────────────────────
// 邮箱密码登录
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
    userRole: user.role,
    displayName: user.displayName,
    storageQuotaMB: user.storageQuotaMB,
    translationQuotaKB: user.translationQuotaKB,
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
    encryptedVaultKey: user.encryptedVaultKey ?? null,
  };
};

// ───────────────────────────────────────────────────────────────────────────
// 刷新会话
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
    userRole: user.role,
    displayName: user.displayName,
    storageQuotaMB: user.storageQuotaMB,
    translationQuotaKB: user.translationQuotaKB,
  };
  return {
    access_token: signAccessToken(authUser),
    refresh_token: signRefreshToken(user.id),
    expires_in: JWT_EXP_SECONDS,
    expires_at: Math.floor(Date.now() / 1000) + JWT_EXP_SECONDS,
    token_type: 'bearer',
    user: authUser,
    encryptedVaultKey: user.encryptedVaultKey ?? null,
  };
};

// ───────────────────────────────────────────────────────────────────────────
// 初始化管理员账号（容器启动时调用）
// ───────────────────────────────────────────────────────────────────────────
import { createHash } from 'crypto';

const uuidV5 = (name: string, namespace = '6ba7b810-9dad-11d1-80b4-00c04fd430c8'): string => {
  const nsBytes = Buffer.from(namespace.replace(/-/g, ''), 'hex');
  const nameBytes = Buffer.from(name, 'utf8');
  const hash = createHash('sha1').update(Buffer.concat([nsBytes, nameBytes])).digest();
  hash[6] = (hash[6]! & 0x0f) | 0x50;
  hash[8] = (hash[8]! & 0x3f) | 0x80;
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
    const samePass = await argon2.verify(existing.encryptedPass, password).catch(() => false);
    if (!samePass) {
      const encryptedPass = await argon2.hash(password);
      await prismaClient.user.update({
        where: { id: userId },
        data: { encryptedPass, email, role: 'admin' },
      });
      console.log(`[init] admin password updated for ${email}`);
    } else if (existing.role !== 'admin') {
      // 确保 role 是 admin
      await prismaClient.user.update({
        where: { id: userId },
        data: { role: 'admin' },
      });
    }
    return;
  }
  const encryptedPass = await argon2.hash(password);
  await prismaClient.user.create({
    data: {
      id: userId,
      email,
      encryptedPass,
      role: 'admin',
    },
  });
  console.log(`[init] admin user created: ${email} (${userId})`);
};
