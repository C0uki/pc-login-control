// =====================================================
// モバイル: ログイン画面
// =====================================================

import React, { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useAuth } from '../context/AuthContext';
import { colors } from '../theme';

export default function LoginScreen() {
  const { signIn } = useAuth();
  const [userId, setUserId] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async () => {
    if (loading) return;
    if (!password) {
      setError('パスワードを入力してください。');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await signIn(userId.trim(), password);
      // 成功すると App 側が自動で画面を切り替える
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.card}>
        <View style={styles.logo}>
          <View style={styles.logoMark}>
            <Text style={styles.logoIcon}>🔐</Text>
          </View>
          <Text style={styles.title}>PC Login 承認</Text>
          <Text style={styles.subtitle}>登録済みのユーザーでログイン</Text>
        </View>

        {error && (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        <Text style={styles.label}>ユーザーID</Text>
        <TextInput
          style={styles.input}
          value={userId}
          onChangeText={setUserId}
          placeholder="IDを入力（マスターは空欄可）"
          placeholderTextColor={colors.placeholder}
          autoCapitalize="none"
          autoCorrect={false}
          editable={!loading}
        />

        <Text style={styles.label}>パスワード</Text>
        <TextInput
          style={styles.input}
          value={password}
          onChangeText={setPassword}
          placeholder="パスワードを入力"
          placeholderTextColor={colors.placeholder}
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
          editable={!loading}
          onSubmitEditing={onSubmit}
        />

        <Pressable
          style={({ pressed }) => [
            styles.btn,
            loading && styles.btnDisabled,
            pressed && !loading && styles.btnPressed,
          ]}
          onPress={onSubmit}
          disabled={loading}>
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.btnText}>ログイン</Text>
          )}
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg, justifyContent: 'center', padding: 24 },
  card: {
    backgroundColor: colors.card,
    borderColor: colors.cardBorder,
    borderWidth: 1,
    borderRadius: 16,
    padding: 28,
  },
  logo: { alignItems: 'center', marginBottom: 24 },
  logoMark: {
    width: 56,
    height: 56,
    borderRadius: 14,
    backgroundColor: 'rgba(31,111,235,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  logoIcon: { fontSize: 26 },
  title: { color: colors.text, fontSize: 22, fontWeight: '600' },
  subtitle: { color: colors.subtext, fontSize: 13, marginTop: 4 },
  label: { color: colors.subtext, fontSize: 13, fontWeight: '500', marginBottom: 6, marginTop: 6 },
  input: {
    backgroundColor: colors.inputBg,
    borderColor: colors.inputBorder,
    borderWidth: 1,
    borderRadius: 8,
    color: colors.text,
    fontSize: 16,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginBottom: 14,
  },
  btn: {
    backgroundColor: colors.primary,
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 6,
  },
  btnText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  btnDisabled: { opacity: 0.5 },
  btnPressed: { opacity: 0.85 },
  errorBox: {
    backgroundColor: colors.dangerBg,
    borderColor: colors.danger,
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
  },
  errorText: { color: colors.danger, fontSize: 13 },
});
