// =====================================================
// サーバー内部の型
// =====================================================

export type ApprovalStatus = 'pending' | 'approved' | 'denied' | 'expired';

/** 全ハンドラー共通のレスポンス（GAS の respond と同じ形） */
export interface ApiResult {
  success: boolean;
  message: string;
  [key: string]: unknown;
}

/** POST ボディ（クライアントからのリクエスト） */
export interface RequestData {
  action?: string;
  // マルチテナント（組織スコープ）
  orgId?: string;
  // createOrg（組織のセルフサービス登録）
  orgName?: string;
  masterPasswordHash?: string;
  signupCode?: string;
  userId?: string;
  userName?: string;
  passwordHash?: string;
  deviceName?: string;
  requestId?: string;
  decision?: string;
  limit?: number;
  // register（マスター権限でのユーザー登録）
  newUserId?: string;
  newUserName?: string;
  newPasswordHash?: string;
  // deleteUser（マスター権限での削除）
  targetUserId?: string;
  // selfRegister / setRegistrationCode（組織ごとの登録フォーム）
  registrationCode?: string;
}
