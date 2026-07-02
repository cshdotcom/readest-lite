'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { IoArrowBack } from 'react-icons/io5';

import { useAuth } from '@/context/AuthContext';
import { useVault } from '@/context/VaultContext';
import { useThemeStore } from '@/store/themeStore';
import { useTranslation } from '@/hooks/useTranslation';
import { useTheme } from '@/hooks/useTheme';
import { supabase } from '@/utils/supabase';
import { User } from '@supabase/supabase-js';
import { derivePbkdf2Key } from '@/libs/crypto/derive';
import { decryptFromEnvelope, encryptToEnvelope } from '@/libs/crypto/envelope';
import {
  generateVaultKey,
  exportVaultKeyToBase64,
  importVaultKeyFromBase64,
  getVaultSalt,
} from '@/libs/crypto/vaultKey';
import { getAPIBaseUrl } from '@/services/environment';
import type { CipherEnvelope } from '@/types/replica';

// Readest Lite — 登录页（仅邮箱密码，无社交登录、无注册）
// Pro 体系与注册入口已完全移除。
export default function AuthPage() {
  const _ = useTranslation();
  const router = useRouter();
  const { login } = useAuth();
  const { setVaultKey } = useVault();
  const { isDarkMode } = useThemeStore();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useTheme({ systemUIVisible: false });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      if (data.session && data.user) {
        const user = data.user as User;
        login(data.session.access_token, user);

        // v8.4: Vault 密钥解密
        // 登录返回的 session 含 encryptedVaultKey（K_enc）
        // 用密码派生 KE → 解密 K_enc → K → setVaultKey
        // 然后用 KE 加密 K → 上传 K_enc（确保服务端有最新的 K_enc）
        const encryptedVaultKey = (data.session as { encryptedVaultKey?: string | null }).encryptedVaultKey;
        const userId = user.id;
        const salt = getVaultSalt(userId);
        const accessToken = data.session.access_token;

        // 派生 KE（用于解密/加密 K）
        const KE = await derivePbkdf2Key(password, salt);

        let K: CryptoKey;
        let needUpload = false;

        if (encryptedVaultKey) {
          // 已有 vault：解密 K_enc → K
          try {
            const envelope = JSON.parse(encryptedVaultKey) as CipherEnvelope;
            const kBase64 = await decryptFromEnvelope(envelope, KE);
            K = await importVaultKeyFromBase64(kBase64);
          } catch (vaultErr) {
            console.error('Vault decryption failed, generating new key:', vaultErr);
            K = await generateVaultKey();
            needUpload = true;
          }
        } else {
          // 首次登录/改密码后：生成新 K
          K = await generateVaultKey();
          needUpload = true;
        }

        setVaultKey(K);

        // 上传 K_enc 到服务端（首次登录或解密失败时）
        // 后续登录不需要重复上传（K_enc 已在服务端）
        if (needUpload) {
          try {
            const kBase64 = await exportVaultKeyToBase64(K);
            const envelope = await encryptToEnvelope(kBase64, KE, 'vault');
            await fetch(`${getAPIBaseUrl()}/auth/v1/vault-key`, {
              method: 'PUT',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${accessToken}`,
              },
              body: JSON.stringify({ encryptedVaultKey: JSON.stringify(envelope) }),
            });
          } catch (uploadErr) {
            console.warn('Failed to upload vault key:', uploadErr);
            // 不阻塞登录——下次登录会重试
          }
        }

        const redirectTo = new URLSearchParams(window.location.search).get('redirect');
        router.push(redirectTo ?? '/library');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : _('Login failed'));
    } finally {
      setLoading(false);
    }
  };

  const handleGoBack = () => {
    const redirectTo = new URLSearchParams(window.location.search).get('redirect');
    if (redirectTo) {
      router.push(redirectTo);
    } else {
      router.back();
    }
  };

  return (
    <div
      className='bg-base-100 text-base-content'
      style={{ maxWidth: '420px', margin: 'auto', padding: '2rem', paddingTop: '4rem', minHeight: '100vh' }}
    >
      <button
        onClick={handleGoBack}
        className='btn btn-ghost fixed left-6 top-6 h-8 min-h-8 w-8 p-0'
        aria-label={_('Go Back')}
      >
        <IoArrowBack className='text-base-content' />
      </button>

      <h1 className='text-2xl font-bold mb-2 text-center'>{_('Sign in to Readest Lite')}</h1>
      <p className='text-base-content/60 text-sm text-center mb-8'>
        {_('Enter your administrator credentials')}
      </p>

      <form onSubmit={handleSubmit} className='space-y-4'>
        <div>
          <label htmlFor='email' className={`block text-sm mb-1 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
            {_('Email')}
          </label>
          <input
            id='email'
            type='email'
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={_('Your email address')}
            required
            disabled={loading}
            className='input input-bordered w-full bg-base-200'
          />
        </div>

        <div>
          <label htmlFor='password' className={`block text-sm mb-1 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
            {_('Password')}
          </label>
          <input
            id='password'
            type='password'
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={_('Your password')}
            required
            disabled={loading}
            className='input input-bordered w-full bg-base-200'
          />
        </div>

        {error && <div className='text-sm text-red-500'>{error}</div>}

        <button
          type='submit'
          disabled={loading || !email || !password}
          className='btn btn-primary w-full'
        >
          {loading ? _('Signing in...') : _('Sign in')}
        </button>
      </form>

      <p className='text-base-content/50 text-xs text-center mt-6'>
        {_('New accounts are not accepted. Contact the administrator if you need access.')}
      </p>
    </div>
  );
}
