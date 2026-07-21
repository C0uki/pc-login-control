// =====================================================
// モバイル: 利用ログ閲覧
//   （通常ユーザーは自分のログ、マスターは全ユーザーのログ）
// =====================================================

import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { getLogs, type LogEntry } from '@pclc/core';
import { useAuth } from '../context/AuthContext';
import { colors } from '../theme';

export default function LogsScreen() {
  const { session } = useAuth();
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (isRefresh = false) => {
      if (!session) return;
      if (isRefresh) setRefreshing(true);
      try {
        const res = await getLogs(session.userId, session.passwordHash, 100);
        if (res.success) {
          setLogs(res.logs ?? []);
          setError(null);
        } else {
          setError(res.message);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [session],
  );

  useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  return (
    <View style={styles.root}>
      {error && (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}
      <FlatList
        data={logs}
        keyExtractor={(_, i) => String(i)}
        contentContainerStyle={logs.length === 0 && styles.emptyContainer}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => load(true)}
            tintColor={colors.primary}
          />
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyText}>ログはまだありません</Text>
          </View>
        }
        renderItem={({ item }) => (
          <View style={styles.item}>
            <View style={[styles.dot, actionColor(item.action)]} />
            <View style={styles.itemBody}>
              <Text style={styles.itemUser}>
                {item.userName || item.userId}
                <Text style={styles.itemAction}>  ・{actionLabel(item.action)}</Text>
              </Text>
              <Text style={styles.itemTime}>{formatDateTime(item.timestamp)}</Text>
            </View>
          </View>
        )}
      />
    </View>
  );
}

function actionLabel(action: string): string {
  if (action.startsWith('login')) return action.includes('mobile') ? 'ログイン(スマホ承認)' : 'ログイン';
  if (action === 'logout') return 'ログアウト';
  return action;
}
function actionColor(action: string) {
  if (action.startsWith('login')) return { backgroundColor: colors.success };
  if (action === 'logout') return { backgroundColor: colors.subtext };
  return { backgroundColor: colors.warn };
}
function formatDateTime(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleString('ja-JP', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg },
  emptyContainer: { flexGrow: 1, justifyContent: 'center' },
  empty: { alignItems: 'center', padding: 40 },
  emptyText: { color: colors.subtext, fontSize: 14 },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderBottomColor: colors.cardBorder,
    borderBottomWidth: 1,
  },
  dot: { width: 8, height: 8, borderRadius: 4, marginRight: 14 },
  itemBody: { flex: 1 },
  itemUser: { color: colors.text, fontSize: 15, fontWeight: '500' },
  itemAction: { color: colors.subtext, fontSize: 13, fontWeight: '400' },
  itemTime: { color: colors.subtext, fontSize: 12, marginTop: 3 },
  errorBox: {
    backgroundColor: colors.dangerBg,
    borderColor: colors.danger,
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    margin: 16,
  },
  errorText: { color: colors.danger, fontSize: 13 },
});
