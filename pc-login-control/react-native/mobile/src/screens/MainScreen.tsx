// =====================================================
// モバイル: ログイン後のメイン画面
//   ヘッダー（ユーザー名 / ログアウト）＋ タブ切替（承認 / ログ）
// =====================================================

import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native';
import { useAuth } from '../context/AuthContext';
import { colors } from '../theme';
import ApprovalsScreen from './ApprovalsScreen';
import LogsScreen from './LogsScreen';

type Tab = 'approvals' | 'logs';

export default function MainScreen() {
  const { session, signOut } = useAuth();
  const [tab, setTab] = useState<Tab>('approvals');

  return (
    <SafeAreaView style={styles.root}>
      {/* ヘッダー */}
      <View style={styles.header}>
        <View>
          <Text style={styles.hello}>{session?.userName || session?.userId} さん</Text>
          <Text style={styles.role}>
            {session?.userId === 'MASTER' ? 'マスター権限' : 'ユーザー'}
          </Text>
        </View>
        <Pressable
          style={({ pressed }) => [styles.logout, pressed && styles.pressed]}
          onPress={signOut}>
          <Text style={styles.logoutText}>ログアウト</Text>
        </Pressable>
      </View>

      {/* タブ */}
      <View style={styles.tabs}>
        <TabButton label="承認" active={tab === 'approvals'} onPress={() => setTab('approvals')} />
        <TabButton label="利用ログ" active={tab === 'logs'} onPress={() => setTab('logs')} />
      </View>

      {/* コンテンツ */}
      <View style={styles.content}>
        {tab === 'approvals' ? <ApprovalsScreen /> : <LogsScreen />}
      </View>
    </SafeAreaView>
  );
}

function TabButton({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable style={styles.tab} onPress={onPress}>
      <Text style={[styles.tabText, active && styles.tabTextActive]}>{label}</Text>
      <View style={[styles.tabIndicator, active && styles.tabIndicatorActive]} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  hello: { color: colors.text, fontSize: 18, fontWeight: '700' },
  role: { color: colors.subtext, fontSize: 12, marginTop: 2 },
  logout: {
    borderColor: colors.cardBorder,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  logoutText: { color: colors.subtext, fontSize: 13, fontWeight: '600' },
  pressed: { opacity: 0.7 },
  tabs: { flexDirection: 'row', borderBottomColor: colors.cardBorder, borderBottomWidth: 1 },
  tab: { flex: 1, alignItems: 'center' },
  tabText: { color: colors.subtext, fontSize: 15, fontWeight: '600', paddingVertical: 12 },
  tabTextActive: { color: colors.text },
  tabIndicator: { height: 2, width: '60%', backgroundColor: 'transparent' },
  tabIndicatorActive: { backgroundColor: colors.primary },
  content: { flex: 1 },
});
