// =====================================================
// モバイル: PC ログイン承認一覧
//   ・保留中リクエストをポーリング表示
//   ・承認 / 拒否
// =====================================================

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  listRequests,
  respondRequest,
  APPROVAL_POLL_INTERVAL_MS,
  type ApprovalRequest,
} from '@pclc/core';
import { useAuth } from '../context/AuthContext';
import { colors } from '../theme';

export default function ApprovalsScreen() {
  const { session } = useAuth();
  const [requests, setRequests] = useState<ApprovalRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [actingId, setActingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(true);

  const load = useCallback(
    async (isRefresh = false) => {
      if (!session) return;
      if (isRefresh) setRefreshing(true);
      try {
        const res = await listRequests(session.userId, session.passwordHash);
        if (!mounted.current) return;
        if (res.success) {
          setRequests(res.requests ?? []);
          setError(null);
        } else {
          setError(res.message);
        }
      } catch (e) {
        if (mounted.current) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (mounted.current) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    [session],
  );

  // 初回 + ポーリング
  useEffect(() => {
    mounted.current = true;
    load();
    const id = setInterval(() => load(), APPROVAL_POLL_INTERVAL_MS);
    return () => {
      mounted.current = false;
      clearInterval(id);
    };
  }, [load]);

  const respond = useCallback(
    async (req: ApprovalRequest, decision: 'approve' | 'deny') => {
      if (!session || actingId) return;
      setActingId(req.requestId);
      try {
        const res = await respondRequest(
          session.userId,
          session.passwordHash,
          req.requestId,
          decision,
        );
        if (!res.success) setError(res.message);
        // 応答後は一覧から除去
        setRequests((prev) => prev.filter((r) => r.requestId !== req.requestId));
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setActingId(null);
      }
    },
    [session, actingId],
  );

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
        data={requests}
        keyExtractor={(item) => item.requestId}
        contentContainerStyle={requests.length === 0 && styles.emptyContainer}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => load(true)}
            tintColor={colors.primary}
          />
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyIcon}>✓</Text>
            <Text style={styles.emptyText}>保留中の承認リクエストはありません</Text>
            <Text style={styles.emptySub}>
              PC でログインを開始すると、ここに表示されます
            </Text>
          </View>
        }
        renderItem={({ item }) => {
          const acting = actingId === item.requestId;
          return (
            <View style={styles.item}>
              <View style={styles.itemHead}>
                <Text style={styles.itemDevice}>💻 {item.deviceName}</Text>
                <Text style={styles.itemTime}>{formatTime(item.createdAt)}</Text>
              </View>
              <Text style={styles.itemUser}>
                {item.userName}（{item.userId}）としてログイン
              </Text>
              <View style={styles.actions}>
                <Pressable
                  style={({ pressed }) => [
                    styles.btn,
                    styles.deny,
                    (acting || !!actingId) && styles.btnDisabled,
                    pressed && styles.btnPressed,
                  ]}
                  disabled={!!actingId}
                  onPress={() => respond(item, 'deny')}>
                  <Text style={styles.denyText}>拒否</Text>
                </Pressable>
                <Pressable
                  style={({ pressed }) => [
                    styles.btn,
                    styles.approve,
                    (acting || !!actingId) && styles.btnDisabled,
                    pressed && styles.btnPressed,
                  ]}
                  disabled={!!actingId}
                  onPress={() => respond(item, 'approve')}>
                  {acting ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={styles.approveText}>承認</Text>
                  )}
                </Pressable>
              </View>
            </View>
          );
        }}
      />
    </View>
  );
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg },
  emptyContainer: { flexGrow: 1, justifyContent: 'center' },
  empty: { alignItems: 'center', padding: 40 },
  emptyIcon: { fontSize: 40, color: colors.success, marginBottom: 12 },
  emptyText: { color: colors.text, fontSize: 15, fontWeight: '600' },
  emptySub: { color: colors.subtext, fontSize: 13, marginTop: 6, textAlign: 'center' },
  item: {
    backgroundColor: colors.card,
    borderColor: colors.cardBorder,
    borderWidth: 1,
    borderRadius: 12,
    padding: 16,
    marginHorizontal: 16,
    marginTop: 12,
  },
  itemHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  itemDevice: { color: colors.text, fontSize: 15, fontWeight: '600' },
  itemTime: { color: colors.subtext, fontSize: 12 },
  itemUser: { color: colors.subtext, fontSize: 13, marginTop: 6 },
  actions: { flexDirection: 'row', marginTop: 16, gap: 10 },
  btn: { flex: 1, borderRadius: 8, paddingVertical: 12, alignItems: 'center' },
  approve: { backgroundColor: colors.success },
  approveText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  deny: { backgroundColor: colors.dangerBg, borderColor: colors.danger, borderWidth: 1 },
  denyText: { color: colors.danger, fontSize: 15, fontWeight: '600' },
  btnDisabled: { opacity: 0.5 },
  btnPressed: { opacity: 0.85 },
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
