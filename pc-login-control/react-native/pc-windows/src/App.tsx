// =====================================================
// PC Login Control (Windows) — ルートコンポーネント
//   ・起動時にキオスクモードを有効化
//   ・ログイン成功でキオスク解除 → バックグラウンドへ最小化
//   ・アンマウント/終了時にログアウト記録
// =====================================================

import React, { useEffect, useRef, useState } from 'react';
import { StatusBar, StyleSheet, Text, View } from 'react-native';
import { logout, type AuthUser } from '@pclc/core';
import KioskModule from './native/KioskModule';
import LoginScreen from './screens/LoginScreen';
import { colors } from './theme';

export default function App() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [deviceName, setDeviceName] = useState('PC');
  const userRef = useRef<AuthUser | null>(null);

  // 起動時：キオスク有効化 + 端末名取得
  useEffect(() => {
    KioskModule.enableKioskMode().catch(() => {});
    KioskModule.getDeviceName()
      .then((name) => name && setDeviceName(name))
      .catch(() => {});

    // 終了時：ログアウト記録（保証はされない）
    return () => {
      if (userRef.current) {
        logout(userRef.current.userId, userRef.current.userName).catch(() => {});
      }
      KioskModule.disableKioskMode().catch(() => {});
    };
  }, []);

  const handleLoginSuccess = (u: AuthUser) => {
    userRef.current = u;
    setUser(u);
    // キオスク解除 → バックグラウンドへ
    KioskModule.disableKioskMode()
      .catch(() => {})
      .finally(() => {
        KioskModule.minimizeToBackground().catch(() => {});
      });
  };

  return (
    <View style={styles.container}>
      <StatusBar hidden />
      {user ? (
        <View style={styles.loggedIn}>
          <Text style={styles.loggedInText}>
            {user.userName} さんとしてログイン中です。
          </Text>
          <Text style={styles.loggedInSub}>このウィンドウは閉じてかまいません。</Text>
        </View>
      ) : (
        <LoginScreen deviceName={deviceName} onLoginSuccess={handleLoginSuccess} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  loggedIn: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  loggedInText: { color: colors.text, fontSize: 18, fontWeight: '600' },
  loggedInSub: { color: colors.subtext, fontSize: 13, marginTop: 8 },
});
