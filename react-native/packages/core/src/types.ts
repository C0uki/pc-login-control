// =====================================================
// 共通型定義（GAS レスポンスと一致させること）
// =====================================================

export type ApprovalStatus = 'pending' | 'approved' | 'denied' | 'expired';

/** 認証済みユーザー */
export interface AuthUser {
  userId: string;
  userName: string;
}

/** GAS 共通レスポンス */
export interface BaseResult {
  success: boolean;
  message: string;
}

export interface LoginResult extends BaseResult {
  userId?: string;
  userName?: string;
  orgId?: string;
  orgName?: string;
}

export interface CreateOrgResult extends BaseResult {
  orgId?: string;
  orgName?: string;
}

export interface RequestApprovalResult extends BaseResult {
  requestId?: string;
  userName?: string;
  expiresInSec?: number;
}

export interface CheckApprovalResult extends BaseResult {
  status?: ApprovalStatus;
  userId?: string;
  userName?: string;
}

export interface ApprovalRequest {
  requestId: string;
  userId: string;
  userName: string;
  deviceName: string;
  status: ApprovalStatus;
  createdAt: string;
}

export interface ListRequestsResult extends BaseResult {
  requests?: ApprovalRequest[];
}

export interface RespondRequestResult extends BaseResult {
  status?: ApprovalStatus;
}

export interface LogEntry {
  timestamp: string;
  userId: string;
  userName: string;
  action: string;
}

export interface GetLogsResult extends BaseResult {
  logs?: LogEntry[];
}

export interface RegisterResult extends BaseResult {
  userId?: string;
}
