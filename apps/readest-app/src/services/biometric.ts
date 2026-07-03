// Lite: stub @tauri-apps/plugin-biometric for web platform (no biometric support)
const BiometryType = { None: 0, TouchID: 1, FaceID: 2, Iris: 3, Fingerprint: 4 } as const;
type BiometryType = (typeof BiometryType)[keyof typeof BiometryType];
const authenticate = async (_reason?: string, _opts?: unknown): Promise<void> => {};
const checkStatus = async (): Promise<{ isAvailable: boolean; biometryType: BiometryType }> => ({ isAvailable: false, biometryType: BiometryType.None });

import type { AppService } from '@/types/system';
import { stubTranslation as _ } from '@/utils/misc';

export const isBiometricSupported = (appService: AppService | null): boolean => {
  return !!appService?.isAndroidApp || !!appService?.isIOSApp;
};

export const getBiometricStatus = async (): Promise<{
  available: boolean;
  biometryType: BiometryType;
}> => {
  try {
    const status = await checkStatus();
    return { available: status.isAvailable, biometryType: status.biometryType };
  } catch {
    return { available: false, biometryType: BiometryType.None };
  }
};

export const authenticateWithBiometrics = async (reason: string): Promise<boolean> => {
  try {
    await authenticate(reason, { allowDeviceCredential: false });
    return true;
  } catch {
    return false;
  }
};

export const getBiometryLabelKey = (biometryType: BiometryType): string => {
  switch (biometryType) {
    case BiometryType.TouchID:
      return 'settings.appLock.biometric.touchId';
    case BiometryType.FaceID:
      return 'settings.appLock.biometric.faceId';
    case BiometryType.Iris:
      return 'settings.appLock.biometric.iris';
    case BiometryType.Fingerprint:
      return 'settings.appLock.biometric.fingerprint';
    default:
      return 'settings.appLock.biometric.none';
  }
};
