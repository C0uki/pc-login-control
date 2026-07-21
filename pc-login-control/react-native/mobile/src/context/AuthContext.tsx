// =====================================================
// 認証状態の管理
//   ・ログイン成功時にユーザー情報＋パスワードハッシュを保持
//     （以降の listRequests / respondRequest / getLogs で使用）
//   ・AsyncStorage に永続化して次回起動時に自動ログイン
// =====================================================

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { login as apiLogin, hashPassword } from '@pclc/core';

export interface Session {
  userId: string;
  userName: string;
  passwordHash: string;
}

interface AuthContextValue {
  session: Session | null;
  loading: boolean;
  signIn: (userId: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const STORAGE_KEY = 'pclc.session.v1';

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (raw) setSession(JSON.parse(raw) as Session);
      } catch {
        // 破損データは無視
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const signIn = useCallback(async (userId: string, password: string) => {
    const res = await apiLogin(userId, password);
    if (!res.success) {
      throw new Error(res.message || 'ログインに失敗しました');
    }
    const s: Session = {
      userId: res.userId ?? userId,
      userName: res.userName ?? '',
      passwordHash: hashPassword(password),
    };
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(s));
    setSession(s);
  }, []);

  const signOut = useCallback(async () => {
    await AsyncStorage.removeItem(STORAGE_KEY);
    setSession(null);
  }, []);

  return (
    <AuthContext.Provider value={{ session, loading, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth は AuthProvider の内側で使用してください');
  return ctx;
}
