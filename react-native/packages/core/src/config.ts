// =====================================================
// 共通設定
//   ・API_URL: オーナーが運用する Vercel API のURL（全導入者で共通・固定）
//     例: https://pc-login-control.vercel.app/api
//   ・ORG_ID: 導入者が管理コンソールで組織を作成して得た「組織ID」。
//     このアプリを使う組織ごとに設定します（setOrgId でも上書き可能）。
// =====================================================

export const API_URL = 'https://your-app.vercel.app/api';

/** 導入者の組織ID（管理コンソールの「組織を作成」で取得） */
export const ORG_ID = '';

/** API へのリクエストタイムアウト(ms) */
export const REQUEST_TIMEOUT_MS = 10_000;

/** モバイル承認のポーリング間隔(ms) */
export const APPROVAL_POLL_INTERVAL_MS = 2_500;

/** モバイル承認の待機タイムアウト(ms) */
export const APPROVAL_TIMEOUT_MS = 120_000;

/** オンライン判定に使う軽量エンドポイント（204を返す） */
export const ONLINE_CHECK_URL = 'https://www.google.com/generate_204';
