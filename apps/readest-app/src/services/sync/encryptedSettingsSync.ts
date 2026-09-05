/**
 * v8.18.4: Encrypted settings sync — push/pull SystemSettings,
 * GlobalViewSettings, and GlobalReadSettings through the server in
 * encrypted form so cross-device sync works without WebDAV.
 *
 * Encryption: AES-GCM with the vault key K (same key used for local
 * library/settings encryption). K is derived from the user's password
 * via PBKDF2 on login and stays in memory; K_enc (K encrypted by the
 * password-derived KE) is persisted server-side in User.encryptedVaultKey,
 * so the key survives across sessions — this is NOT a one-time key.
 *
 * Wire format: base64(JSON(CipherEnvelope)) — the server only stores the
 * ciphertext blob, never decrypts it.
 *
 * Scopes:
 *   'system'      → SystemSettings (KOSync, Readwise, OPDS, proxy, etc.)
 *   'global_view' → globalViewSettings (font size, theme, layout)
 *   'global_read' → globalReadSettings (pagination, auto-scroll, TTS)
 */
import { getAPIBaseUrl } from '@/services/environment';
import { getAccessToken } from '@/utils/access';
import { getVaultKey } from '@/utils/vaultState';
import { encryptToEnvelope, decryptFromEnvelope } from '@/libs/crypto/envelope';

export type SettingsScope = 'system' | 'global_view' | 'global_read';

interface ServerResponse {
  scope: SettingsScope;
  encryptedPayload: string;
  updatedAt: string;
}

/**
 * Encrypt a settings object and upload it to the server.
 * The vault key must be active (user logged in).
 *
 * Returns false if the vault key is not available (user not logged in or
 * vault not yet unlocked) — callers should treat this as a no-op, not an
 * error, since settings sync is best-effort.
 */
export const pushEncryptedSettings = async (
  scope: SettingsScope,
  settings: unknown,
): Promise<boolean> => {
  const vaultKey = getVaultKey();
  if (!vaultKey) return false; // vault not unlocked — skip silently

  const token = await getAccessToken();
  if (!token) return false;

  try {
    const plaintext = JSON.stringify(settings);
    const envelope = await encryptToEnvelope(plaintext, vaultKey, 'settings-sync');
    const payload = btoa(JSON.stringify(envelope));

    const resp = await fetch(`${getAPIBaseUrl()}/settings/save?scope=${scope}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ encryptedPayload: payload }),
    });

    if (!resp.ok) {
      console.warn(`[settingsSync] push ${scope} failed: ${resp.status}`);
      return false;
    }
    return true;
  } catch (err) {
    console.warn(`[settingsSync] push ${scope} error:`, err);
    return false;
  }
};

/**
 * Pull the latest encrypted settings from the server and decrypt them.
 * Returns the decrypted settings object, or null if:
 *   - vault key is not available
 *   - no synced settings exist yet (404)
 *   - decryption fails (wrong key / corrupted data)
 */
export const pullEncryptedSettings = async <T>(
  scope: SettingsScope,
): Promise<{ settings: T; updatedAt: string } | null> => {
  const vaultKey = getVaultKey();
  if (!vaultKey) return null;

  const token = await getAccessToken();
  if (!token) return null;

  try {
    const resp = await fetch(`${getAPIBaseUrl()}/settings?scope=${scope}`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
    });

    if (resp.status === 404) return null; // no synced settings yet
    if (!resp.ok) {
      console.warn(`[settingsSync] pull ${scope} failed: ${resp.status}`);
      return null;
    }

    const data = (await resp.json()) as ServerResponse;
    const envelope = JSON.parse(atob(data.encryptedPayload));
    const plaintext = await decryptFromEnvelope(envelope, vaultKey);
    const settings = JSON.parse(plaintext) as T;

    return { settings, updatedAt: data.updatedAt };
  } catch (err) {
    console.warn(`[settingsSync] pull ${scope} error:`, err);
    return null;
  }
};
