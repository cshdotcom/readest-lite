// Lite stub for @tauri-apps/plugin-biometric
// Web platform doesn't have biometric support
export const authenticate = async () => {};
export const checkStatus = async () => ({ available: false });
export const BiometryType = { none: 0, touchId: 1, faceId: 2, iris: 3, fingerprint: 4 };
