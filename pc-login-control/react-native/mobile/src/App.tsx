// =====================================================
// PC Login Control モバイル — ルートコンポーネント
// =====================================================

import React from 'react';
import { ActivityIndicator, StatusBar, StyleSheet, View } from 'react-native';
import { AuthProvider, useAuth } from './context/AuthContext';
import LoginScreen from './screens/LoginScreen';
import MainScreen from './screens/MainScreen';
import { colors } from './theme';

function Root() {
  const { session, loading } = useAuth();

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }
  return session ? <MainScreen /> : <LoginScreen />;
}

export default function App() {
  return (
    <AuthProvider>
      <StatusBar barStyle="light-content" backgroundColor={colors.bg} />
      <Root />
    </AuthProvider>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg },
});
