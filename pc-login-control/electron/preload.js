'use strict';

// =====================================================
// PC_Login_Control_System — Preload Script
// レンダラープロセスへ安全にAPIを公開
// =====================================================

const { contextBridge, ipcRenderer } = require('electron');
const crypto = require('crypto');

contextBridge.exposeInMainWorld('electronAPI', {
  /**
   * 認証リクエスト
   * @param {string} userId
   * @param {string} password  - 平文パスワード（ここでハッシュ化してから送信）
   * @returns {Promise<{success: boolean, message: string, userId?: string, userName?: string}>}
   */
  authenticate: (userId, password) => {
    const passwordHash = crypto
      .createHash('sha256')
      .update(password)
      .digest('hex');
    return ipcRenderer.invoke('authenticate', { userId, passwordHash });
  },

  /**
   * インターネット接続確認
   * @returns {Promise<boolean>}
   */
  checkOnline: () => ipcRenderer.invoke('check-online'),
});
