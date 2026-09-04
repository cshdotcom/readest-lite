/**
 * Lite stub for `@/services/localsend/devicePrefs`.
 * LocalSend (LAN book transfer) is a Tauri-native-only feature; Lite is web-only
 * and never has LocalSend available. All consumers gate UI on `isLocalSendEnabled`
 * so returning `false` here safely hides every LocalSend UI surface.
 */

export const isLocalSendEnabled = (): boolean => false;
