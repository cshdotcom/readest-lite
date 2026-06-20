// v8.4: 全局 vault 密钥 holder
// 让 libraryService/settingsService 在不改动调用方签名的情况下，
// 内部自动判断是否加密 + 用哪个 userId 的文件名
//
// VaultContext 在 setVaultKey/clearVault 时同步到这个模块
// libraryService/settingsService 在 loadLibraryBooks/saveLibraryBooks 时从这里读

interface VaultState {
  vaultKey: CryptoKey | null;
  userId: string | null;
}

let state: VaultState = {
  vaultKey: null,
  userId: null,
};

export const setVaultState = (vaultKey: CryptoKey | null, userId: string | null): void => {
  state = { vaultKey, userId };
};

export const getVaultKey = (): CryptoKey | null => state.vaultKey;

export const getVaultUserId = (): string | null => state.userId;

export const isVaultActive = (): boolean => state.vaultKey !== null && state.userId !== null;
