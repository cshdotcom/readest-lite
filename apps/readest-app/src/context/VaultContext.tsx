'use client';

// v8.4 VaultContext — 管理客户端 vault 密钥 K
//
// K 是随机 256-bit AES-GCM 密钥，用于加密本地 library/settings
// K 只在内存中，登出时清除
// K 的加密版本 K_enc 存在服务端 User.encryptedVaultKey
//
// 登录流程：
//   1. 用户输入密码 → API 验证 → 返回 token + user + encryptedVaultKey
//   2. 用密码 + userId 派生 KE（PBKDF2）
//   3. KE 解密 K_enc → K
//   4. setVaultKey(K) → K 存内存
//   5. 密码从内存清除
//
// 登出流程（阶段 4 实现）：
//   1. 弹密码框 → 派生 KE
//   2. 用 K 加密 library/settings → 写盘
//   3. 用 KE 加密 K → PUT /api/auth/v1/vault-key
//   4. clearVault() → K 从内存清除

import {
  createContext,
  useState,
  useContext,
  useCallback,
  useMemo,
  ReactNode,
} from 'react';
import { useAuth } from '@/context/AuthContext';
import { setVaultState } from '@/utils/vaultState';

interface VaultContextType {
  vaultKey: CryptoKey | null;
  setVaultKey: (key: CryptoKey) => void;
  clearVault: () => void;
  isVaultReady: boolean;
}

const VaultContext = createContext<VaultContextType | undefined>(undefined);

export const VaultProvider = ({ children }: { children: ReactNode }) => {
  const { user } = useAuth();
  const [vaultKey, setVaultKeyState] = useState<CryptoKey | null>(null);

  const setVaultKey = useCallback((key: CryptoKey) => {
    setVaultKeyState(key);
  }, []);

  const clearVault = useCallback(() => {
    setVaultKeyState(null);
  }, []);

  // v8.4: 同步 vaultKey + userId 到全局 vaultState
  // 让 libraryService/settingsService 能在不变签名的情况下自动加密
  const currentUserId = user?.id ?? null;
  useMemo(() => {
    setVaultState(vaultKey, currentUserId);
  }, [vaultKey, currentUserId]);

  // isVaultReady = true 当 vaultKey 已设置（不管是解密的还是新生成的）
  // 当用户没有 encryptedVaultKey（首次登录/改密码后），auth/page.tsx 会生成新 K 并 setVaultKey
  // 所以 isVaultReady 最终都会变成 true
  const isVaultReady = vaultKey !== null;

  const value = useMemo(
    () => ({ vaultKey, setVaultKey, clearVault, isVaultReady }),
    [vaultKey, setVaultKey, clearVault, isVaultReady],
  );

  return <VaultContext.Provider value={value}>{children}</VaultContext.Provider>;
};

export const useVault = (): VaultContextType => {
  const context = useContext(VaultContext);
  if (!context) throw new Error('useVault must be used within VaultProvider');
  return context;
};
