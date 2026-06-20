import { useRouter } from 'next/navigation';
import { useEnv } from '@/context/EnvContext';
import { useAuth } from '@/context/AuthContext';
import { useVault } from '@/context/VaultContext';
import { deleteUser } from '@/libs/user';
import { eventDispatcher } from '@/utils/event';
import { navigateToLibrary, navigateToResetPassword, navigateToUpdatePassword } from '@/utils/nav';
import { useLibraryStore } from '@/store/libraryStore';
import { useSettingsStore } from '@/store/settingsStore';
import { useTransferStore } from '@/store/transferStore';
import {
  DEFAULT_KOSYNC_SETTINGS,
  DEFAULT_READWISE_SETTINGS,
  DEFAULT_HARDCOVER_SETTINGS,
  DEFAULT_WEBDAV_SETTINGS,
} from '@/services/constants';
import { DEFAULT_AI_SETTINGS } from '@/services/ai/constants';
import { setVaultState } from '@/utils/vaultState';

export const useUserActions = () => {
  const router = useRouter();
  const { envConfig } = useEnv();
  const { logout } = useAuth();
  const { clearVault } = useVault();

  // v8.4: 登出时彻底清理当前账号数据
  // - 数据已经加密保存在磁盘上（library-<userId>.enc / settings-<userId>.enc）
  // - K_enc 已经在登录时上传到服务端
  // - 登出只需：清 VaultContext（K 从内存清除）+ 清 library/settings state + 重置 cursor
  // - 加密数据保留在磁盘，重新登录同账号时用密码解密 K_enc → K → 解密数据恢复
  // - 不需要密码（K_enc 已在服务端，不需要重新加密 K）
  // - 不删 Books/ 目录下的 <hash>/ 文件夹（文件本体保留）
  const handleLogout = async () => {
    try {
      // 1. 清空 library 内存 state
      //    磁盘上的加密文件 library-<userId>.enc 保留（重新登录可解密恢复）
      useLibraryStore.getState().setLibrary([]);

      // 2. 清账号绑定的 settings state + 重置 sync cursor
      const { settings, setSettings } = useSettingsStore.getState();
      const clearedSettings = {
        ...settings,
        keepLogin: false,
        lastSyncedAtBooks: 0,
        lastSyncedAtConfigs: 0,
        lastSyncedAtNotes: 0,
        kosync: { ...DEFAULT_KOSYNC_SETTINGS },
        readwise: { ...DEFAULT_READWISE_SETTINGS },
        hardcover: { ...DEFAULT_HARDCOVER_SETTINGS },
        webdav: { ...DEFAULT_WEBDAV_SETTINGS },
        aiSettings: { ...DEFAULT_AI_SETTINGS },
        pinCodeEnabled: false,
        pinCodeHash: undefined,
        pinCodeSalt: undefined,
        lastSyncedAtReplicas: {},
      };
      setSettings(clearedSettings);
      // 注意：不调 saveSettings——因为 vaultState 还没清，saveSettings 会加密写盘
      // 加密数据已经在磁盘上了，不需要再写一次

      // 3. 清 transfer queue
      try {
        useTransferStore.getState().clearAll();
      } catch (err) {
        console.warn('Failed to clear transfer queue on logout:', err);
      }

      // 4. 清 VaultContext + vaultState（K 从内存清除）
      //    这一步必须在 saveSettings 之后，防止 saveSettings 用已清除的 K 加密失败
      clearVault();
      setVaultState(null, null);
    } catch (err) {
      console.error('Error during logout cleanup:', err);
    } finally {
      // 5. 最后走原 logout（清 token/user）
      await logout();
      navigateToLibrary(router);
    }
  };

  const handleResetPassword = () => {
    navigateToResetPassword(router);
  };

  const handleUpdateEmail = () => {
    navigateToUpdatePassword(router);
  };

  const handleConfirmDelete = async (errorMessage: string) => {
    try {
      await deleteUser();
      await handleLogout();
    } catch (error) {
      console.error('Error deleting user:', error);
      eventDispatcher.dispatch('toast', {
        type: 'error',
        message: errorMessage,
      });
    }
  };

  return {
    handleLogout,
    handleUpdateEmail,
    handleResetPassword,
    handleConfirmDelete,
  };
};
