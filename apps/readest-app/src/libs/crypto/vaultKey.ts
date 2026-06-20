// v8.4: Vault 密钥工具
//
// 架构：
//   K  = 随机 256-bit AES-GCM 密钥（用于加密本地 library/settings）
//   KE = PBKDF2(密码, salt) 派生的密钥（用于加密 K）
//   K_enc = encryptToEnvelope(K, KE) → 存到服务端 User.encryptedVaultKey
//
// 登录：密码 → KE → 解密 K_enc → K → 解密本地数据
// 登出：生成新 K → 加密本地数据 → KE 加密 K → 上传 K_enc
//
// 安全保障：
//   - 密码不存客户端（只在登录/登出瞬间用）
//   - K 只在内存（VaultContext），登出清除
//   - 服务端只存 K_enc（密文），没有密码无法解密
//   - 浏览器存储里的 library/settings 是密文

import { SyncError } from '@/libs/errors';

const VAULT_KEY_LENGTH_BITS = 256;

const requireSubtle = (): SubtleCrypto => {
  if (typeof crypto === 'undefined' || !crypto.subtle) {
    throw new SyncError('CRYPTO_UNAVAILABLE', 'Web Crypto subtle is not available');
  }
  return crypto.subtle;
};

// 生成随机 256-bit AES-GCM 密钥
export const generateVaultKey = async (): Promise<CryptoKey> => {
  const subtle = requireSubtle();
  const raw = crypto.getRandomValues(new Uint8Array(VAULT_KEY_LENGTH_BITS / 8));
  return subtle.importKey(
    'raw',
    raw,
    { name: 'AES-GCM', length: VAULT_KEY_LENGTH_BITS },
    true,
    ['encrypt', 'decrypt'],
  );
};

// 导出密钥为 base64 字符串
export const exportVaultKeyToBase64 = async (key: CryptoKey): Promise<string> => {
  const subtle = requireSubtle();
  const raw = await subtle.exportKey('raw', key);
  const bytes = new Uint8Array(raw);
  let s = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    s += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(s);
};

// 从 base64 字符串导入密钥
export const importVaultKeyFromBase64 = async (b64: string): Promise<CryptoKey> => {
  const subtle = requireSubtle();
  const s = atob(b64);
  const bytes = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) bytes[i] = s.charCodeAt(i);
  return subtle.importKey(
    'raw',
    bytes,
    { name: 'AES-GCM', length: VAULT_KEY_LENGTH_BITS },
    true,
    ['encrypt', 'decrypt'],
  );
};

// 生成固定 salt（用于 PBKDF2 派生 KE）
// 每个用户的 vault salt 独立，从 user.id 派生（不是秘密，但每个用户不同）
export const getVaultSalt = (userId: string): Uint8Array => {
  const enc = new TextEncoder();
  const seed = `readest-lite-vault-salt-${userId}`;
  const bytes = enc.encode(seed);
  // 取前 16 字节作为 salt（PBKDF2 推荐 16+ 字节）
  const salt = new Uint8Array(16);
  for (let i = 0; i < 16; i++) {
    salt[i] = bytes[i % bytes.length]!;
  }
  return salt;
};
