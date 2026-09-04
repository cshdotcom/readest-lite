/**
 * Lite stub for `@/hooks/useAndroidGamepadConnection`.
 * Bluetooth gamepad connection is a Tauri-Android-only feature.
 * Returns always-false in web-only Lite so reader behavior is unaffected.
 */

import { useEffect, useState } from 'react';

export const useAndroidGamepadConnection = (
  _isAndroidApp: boolean,
): boolean => {
  const [connected, setConnected] = useState(false);
  useEffect(() => {
    setConnected(false);
  }, []);
  return connected;
};
