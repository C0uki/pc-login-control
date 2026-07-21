// =====================================================
// 共通設定
//   API_URL は Vercel にデプロイした API のURLに書き換えてください。
//   （server/ を `vercel deploy` して取得。末尾は /api）
//   例: https://your-app.vercel.app/api
// =====================================================

export const API_URL = 'https://your-app.vercel.app/api';

/** API へのリクエストタイムアウト(ms) */
export const REQUEST_TIMEOUT_MS = 10_000;

/** モバイル承認のポーリング間隔(ms) */
export const APPROVAL_POLL_INTERVAL_MS = 2_500;

/** モバイル承認の待機タイムアウト(ms) */
export const APPROVAL_TIMEOUT_MS = 120_000;

/** オンライン判定に使う軽量エンドポイント（204を返す） */
export const ONLINE_CHECK_URL = 'https://www.google.com/generate_204';
