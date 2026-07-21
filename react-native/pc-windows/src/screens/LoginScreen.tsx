// =====================================================
// ログイン画面（キオスク）
//   ・ID + パスワードによる直接ログイン
//   ・「スマホで承認」によるモバイル承認ログイン
// =====================================================

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { login, checkOnline, type AuthUser } from '@pclc/core';
import { colors } from '../theme';
import { requestMobileApproval } from '../lib/approval';

type MessageType = 'error' | 'success' | 'warn';
interface Message {
  text: string;
  type: MessageType;
}

interface Props {
  deviceName: string;
  onLoginSuccess: (user: AuthUser) => void;
}

export default function LoginScreen({ deviceName, onLoginSuccess }: Props) {
  const [userId, setUserId] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [approving, setApproving] = useState(false);
  const [online, setOnline] = useState(true);
  const [message, setMessage] = useState<Message | null>(null);

  const cancelRef = useRef(false);

  // オンライン監視（起動時 + 30秒毎）
  useEffect(() => {
    let mounted = true;
    const run = async () => {
      const ok = await checkOnline();
      if (mounted) setOnline(ok);
    };
    run();
    const id = setInterval(run, 30_000);
    return () => {
      mounted = false;
      clearInterval(id);
    };
  }, []);

  const busy = loading || approving;

  // --- ID + パスワードで直接ログイン ---
  const handleDirectLogin = useCallback(async () => {
    if (busy) return;
    const id = userId.trim();
    if (!id && !password) {
      setMessage({ text: 'IDまたはパスワードを入力してください。', type: 'error' });
      return;
    }
    if (!password) {
      setMessage({ text: 'パスワードを入力してください。', type: 'error' });
      return;
    }
    if (!(await checkOnline())) {
      setMessage({ text: 'インターネットに接続されていません。接続を確認してください。', type: 'warn' });
      return;
    }

    setLoading(true);
    setMessage(null);
    try {
      const result = await login(id, password);
      if (result.success) {
        setMessage({ text: `ようこそ、${result.userName} さん。ログインしています…`, type: 'success' });
        setPassword('');
        setTimeout(() => {
          onLoginSuccess({ userId: result.userId!, userName: result.userName ?? '' });
        }, 1200);
      } else {
        setMessage({ text: result.message || '認証に失敗しました。', type: 'error' });
        setPassword('');
        // 簡易ブルートフォース対策
        setLoading(true);
        setTimeout(() => setLoading(false), 3000);
        return;
      }
    } catch (err) {
      setMessage({ text: '通信エラーが発生しました。\n' + toMsg(err), type: 'error' });
    } finally {
      setLoading(false);
    }
  }, [busy, userId, password, onLoginSuccess]);

  // --- スマホで承認 ---
  const handleMobileApproval = useCallback(async () => {
    if (busy) return;
    const id = userId.trim();
    if (!id) {
      setMessage({ text: 'スマホ承認にはユーザーIDの入力が必要です。', type: 'error' });
      return;
    }
    if (!(await checkOnline())) {
      setMessage({ text: 'インターネットに接続されていません。接続を確認してください。', type: 'warn' });
      return;
    }

    cancelRef.current = false;
    setApproving(true);
    setMessage({ text: '承認リクエストを送信しています…', type: 'success' });
    try {
      const user = await requestMobileApproval(
        id,
        deviceName,
        (m) => setMessage({ text: m, type: 'success' }),
        () => cancelRef.current,
      );
      setMessage({ text: `承認されました。ようこそ、${user.userName} さん。`, type: 'success' });
      setTimeout(() => onLoginSuccess(user), 1000);
    } catch (err) {
      const msg = toMsg(err);
      if (msg !== 'キャンセルされました') {
        setMessage({ text: msg, type: 'error' });
      } else {
        setMessage(null);
      }
    } finally {
      setApproving(false);
    }
  }, [busy, userId, deviceName, onLoginSuccess]);

  const cancelApproval = useCallback(() => {
    cancelRef.current = true;
  }, []);

  return (
    <View style={styles.root}>
      {!online && (
        <View style={styles.offlineBadge}>
          <Text style={styles.offlineText}>⚠ オフライン</Text>
        </View>
      )}

      <View style={styles.card}>
        {/* ロゴ / タイトル */}
        <View style={styles.logo}>
          <View style={styles.logoMark}>
            <Text style={styles.logoIcon}>🔒</Text>
          </View>
          <Text style={styles.title}>PC ログイン認証</Text>
          <Text style={styles.subtitle}>このPCを使用するにはログインが必要です</Text>
        </View>

        {/* メッセージ */}
        {message && (
          <View style={[styles.message, msgBoxStyle(message.type)]}>
            <Text style={[styles.messageText, { color: msgColor(message.type) }]}>
              {message.text}
            </Text>
          </View>
        )}

        {/* フォーム */}
        <View style={styles.formGroup}>
          <Text style={styles.label}>ユーザーID</Text>
          <TextInput
            style={styles.input}
            value={userId}
            onChangeText={setUserId}
            placeholder="IDを入力"
            placeholderTextColor={colors.placeholder}
            autoCapitalize="none"
            autoCorrect={false}
            editable={!busy}
          />
        </View>

        <View style={styles.formGroup}>
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
            editable={!busy}
            onSubmitEditing={handleDirectLogin}
          />
        </View>

        <Pressable
          style={({ pressed }) => [
            styles.btnPrimary,
            busy && styles.btnDisabled,
            pressed && !busy && styles.btnPressed,
          ]}
          onPress={handleDirectLogin}
          disabled={busy}>
          {loading ? (
            <View style={styles.row}>
              <ActivityIndicator color="#fff" />
              <Text style={styles.btnPrimaryText}>  認証中</Text>
            </View>
          ) : (
            <Text style={styles.btnPrimaryText}>ログイン</Text>
          )}
        </Pressable>

        {/* 区切り */}
        <View style={styles.divider}>
          <View style={styles.dividerLine} />
          <Text style={styles.dividerText}>または</Text>
          <View style={styles.dividerLine} />
        </View>

        {/* スマホ承認 */}
        {approving ? (
          <Pressable style={styles.btnSecondary} onPress={cancelApproval}>
            <View style={styles.row}>
              <ActivityIndicator color={colors.primary} />
              <Text style={styles.btnSecondaryText}>  承認待ち — タップでキャンセル</Text>
            </View>
          </Pressable>
        ) : (
          <Pressable
            style={({ pressed }) => [
              styles.btnSecondary,
              loading && styles.btnDisabled,
              pressed && !loading && styles.btnPressed,
            ]}
            onPress={handleMobileApproval}
            disabled={loading}>
            <Text style={styles.btnSecondaryText}>📱 スマホで承認する</Text>
          </Pressable>
        )}

        <Text style={styles.footer}>Enterキーでもログインできます</Text>
      </View>
    </View>
  );
}

function toMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function msgColor(type: MessageType): string {
  return type === 'error' ? colors.error : type === 'success' ? colors.success : colors.warn;
}
function msgBoxStyle(type: MessageType) {
  const bg =
    type === 'error' ? colors.errorBg : type === 'success' ? colors.successBg : colors.warnBg;
  const border =
    type === 'error' ? colors.error : type === 'success' ? colors.success : colors.warn;
  return { backgroundColor: bg, borderColor: border };
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  offlineBadge: {
    position: 'absolute',
    top: 20,
    right: 20,
    backgroundColor: colors.warnBg,
    borderColor: colors.warn,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
  },
  offlineText: { color: colors.warn, fontSize: 12, fontWeight: '600' },
  card: {
    width: 440,
    maxWidth: '90%',
    backgroundColor: colors.card,
    borderColor: colors.cardBorder,
    borderWidth: 1,
    borderRadius: 16,
    paddingVertical: 44,
    paddingHorizontal: 48,
  },
  logo: { alignItems: 'center', marginBottom: 28 },
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
  message: {
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginBottom: 16,
  },
  messageText: { fontSize: 13, lineHeight: 20 },
  formGroup: { marginBottom: 18 },
  label: { color: colors.subtext, fontSize: 13, fontWeight: '500', marginBottom: 6 },
  input: {
    backgroundColor: colors.inputBg,
    borderColor: colors.inputBorder,
    borderWidth: 1,
    borderRadius: 8,
    color: colors.text,
    fontSize: 16,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  btnPrimary: {
    backgroundColor: colors.primary,
    borderRadius: 8,
    paddingVertical: 13,
    alignItems: 'center',
    marginTop: 4,
  },
  btnPrimaryText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  btnSecondary: {
    backgroundColor: 'transparent',
    borderColor: colors.primary,
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
  },
  btnSecondaryText: { color: colors.primary, fontSize: 15, fontWeight: '600' },
  btnDisabled: { opacity: 0.5 },
  btnPressed: { opacity: 0.85 },
  row: { flexDirection: 'row', alignItems: 'center' },
  divider: { flexDirection: 'row', alignItems: 'center', marginVertical: 18 },
  dividerLine: { flex: 1, height: 1, backgroundColor: colors.cardBorder },
  dividerText: { color: colors.placeholder, fontSize: 12, marginHorizontal: 10 },
  footer: { color: colors.placeholder, fontSize: 12, textAlign: 'center', marginTop: 22 },
});
