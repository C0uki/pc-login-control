'use strict';

// =====================================================
// PC_Login_Control_System — Electron Main Process
// =====================================================

const {
  app,
  BrowserWindow,
  globalShortcut,
  ipcMain,
  powerMonitor,
  session,
} = require('electron');
const path    = require('path');
const https   = require('https');
const http    = require('http');
const { exec, execSync } = require('child_process');

// ▼ GAS デプロイURL（Webアプリとして公開した際のURL）
const GAS_URL = 'YOUR_GAS_WEB_APP_URL';

// =====================================================
// 状態管理
// =====================================================
let mainWindow   = null;
let isLoggedIn   = false;
let currentUser  = null;   // { userId, userName }
let isQuitting   = false;

// =====================================================
// Windows スタートアップ登録（レジストリ）
// =====================================================
function registerStartup() {
  if (process.platform !== 'win32') return;
  const appPath = process.execPath.replace(/\\/g, '\\\\');
  try {
    execSync(
      `reg add "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run" ` +
      `/v "PC_Login_Control" /t REG_SZ /d "${appPath}" /f`,
      { stdio: 'ignore' }
    );
  } catch (e) {
    console.error('[Startup] レジストリ登録失敗:', e.message);
  }
}

// =====================================================
// タスクマネージャー無効化（要管理者権限）
// =====================================================
function disableTaskManager() {
  if (process.platform !== 'win32') return;
  try {
    execSync(
      'reg add "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Policies\\System" ' +
      '/v "DisableTaskMgr" /t REG_DWORD /d 1 /f',
      { stdio: 'ignore' }
    );
  } catch (e) {
    console.error('[TaskMgr] 無効化失敗:', e.message);
  }
}

function enableTaskManager() {
  if (process.platform !== 'win32') return;
  try {
    execSync(
      'reg add "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Policies\\System" ' +
      '/v "DisableTaskMgr" /t REG_DWORD /d 0 /f',
      { stdio: 'ignore' }
    );
  } catch (e) {}
}

// =====================================================
// ウィンドウ作成
// =====================================================
function createWindow() {
  mainWindow = new BrowserWindow({
    fullscreen:      true,
    kiosk:           true,
    frame:           false,
    alwaysOnTop:     true,
    skipTaskbar:     true,
    resizable:       false,
    movable:         false,
    minimizable:     false,
    maximizable:     false,
    closable:        false,
    webPreferences: {
      preload:          path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration:  false,
      devTools:         false,   // 本番はfalse
    },
  });

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  // ウィンドウレベルのショートカットブロック
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (isLoggedIn) return; // ログイン後はブロックしない

    const blocked = [
      input.alt   && input.key === 'F4',          // Alt+F4
      input.alt   && input.key === 'Tab',          // Alt+Tab
      input.control && input.key === 'Escape',     // Ctrl+Esc (スタートメニュー)
      input.control && input.key === 'F4',         // Ctrl+F4
      input.meta,                                   // Windowsキー
    ];
    if (blocked.some(Boolean)) {
      event.preventDefault();
    }
  });

  // 常に最前面を強制
  mainWindow.on('blur', () => {
    if (!isLoggedIn && mainWindow) {
      mainWindow.focus();
      mainWindow.setAlwaysOnTop(true, 'screen-saver');
    }
  });

  // ウィンドウが隠れないよう監視
  setInterval(() => {
    if (!isLoggedIn && mainWindow && !mainWindow.isFocused()) {
      mainWindow.focus();
    }
  }, 500);
}

// =====================================================
// グローバルショートカット無効化
// =====================================================
function registerBlockedShortcuts() {
  const blockedKeys = [
    'Super',           // Windowsキー
    'Super+D',         // デスクトップ表示
    'Super+E',         // エクスプローラー
    'Super+R',         // ファイル名を指定して実行
    'Super+L',         // 画面ロック
    'Super+Tab',       // タスクビュー
    'Alt+F4',
    'Alt+Tab',
    'Ctrl+Escape',
    'Ctrl+Alt+Delete', // ※OSレベルのため完全ブロックは不可
    'Ctrl+Shift+Escape', // タスクマネージャー直接起動
  ];

  blockedKeys.forEach(key => {
    try {
      globalShortcut.register(key, () => {
        // ログイン済みなら通常動作に戻す
        if (isLoggedIn) globalShortcut.unregister(key);
      });
    } catch (e) {
      // 一部のキーは登録できない場合があります
    }
  });
}

// =====================================================
// GASへHTTPSリクエスト（Node.js ネイティブ）
// =====================================================
function postToGAS(payload) {
  return new Promise((resolve, reject) => {
    const body    = JSON.stringify(payload);
    const urlObj  = new URL(GAS_URL);
    const options = {
      hostname: urlObj.hostname,
      path:     urlObj.pathname + urlObj.search,
      method:   'POST',
      headers: {
        'Content-Type':   'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
    };

    const req = https.request(options, res => {
      let data = '';
      res.on('data', chunk => (data += chunk));
      res.on('end', () => {
        // GASはリダイレクトを返す場合があるため追跡
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          return postToGASUrl(res.headers.location, body).then(resolve).catch(reject);
        }
        try {
          resolve(JSON.parse(data));
        } catch {
          reject(new Error('レスポンスのパース失敗: ' + data));
        }
      });
    });

    req.on('error', reject);
    req.setTimeout(10000, () => {
      req.destroy(new Error('タイムアウト'));
    });
    req.write(body);
    req.end();
  });
}

// リダイレクト先へ再送（GASのリダイレクト対応）
function postToGASUrl(location, body) {
  return new Promise((resolve, reject) => {
    const urlObj  = new URL(location);
    const useHttps = urlObj.protocol === 'https:';
    const client  = useHttps ? https : http;
    const options = {
      hostname: urlObj.hostname,
      path:     urlObj.pathname + urlObj.search,
      method:   'POST',
      headers: {
        'Content-Type':   'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
    };

    const req = client.request(options, res => {
      let data = '';
      res.on('data', chunk => (data += chunk));
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch { reject(new Error('リダイレクト先パース失敗')); }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// =====================================================
// ログアウト記録（同期的・シャットダウン時用）
// =====================================================
function recordLogoutSync(user) {
  if (!user) return;
  try {
    // PowerShellでfire-and-forget的に送信
    const payload = JSON.stringify({
      action:   'logout',
      userId:   user.userId,
      userName: user.userName,
    });
    // 非同期で試みる（シャットダウン直前なので保証はできない）
    postToGAS({ action: 'logout', userId: user.userId, userName: user.userName })
      .catch(() => {});
  } catch (e) {}
}

// =====================================================
// ログイン後の後処理（バックグラウンド移行）
// =====================================================
function onLoginSuccess(user) {
  isLoggedIn  = true;
  currentUser = user;

  // タスクマネージャー再有効化
  enableTaskManager();

  // グローバルショートカットのブロックを解除
  globalShortcut.unregisterAll();

  // ウィンドウをバックグラウンドへ
  if (mainWindow) {
    mainWindow.setKiosk(false);
    mainWindow.setAlwaysOnTop(false);
    mainWindow.setSkipTaskbar(true);
    mainWindow.minimize();
    mainWindow.hide();
  }
}

// =====================================================
// IPC ハンドラー
// =====================================================

// 認証
ipcMain.handle('authenticate', async (_event, { userId, passwordHash }) => {
  try {
    const result = await postToGAS({ action: 'login', userId, passwordHash });
    if (result.success) {
      onLoginSuccess({ userId: result.userId, userName: result.userName });
    }
    return result;
  } catch (err) {
    return {
      success: false,
      message: 'ネットワークエラー: インターネット接続を確認してください\n' + err.message,
    };
  }
});

// オンライン確認
ipcMain.handle('check-online', () => {
  return new Promise(resolve => {
    const req = https.request({ hostname: 'www.google.com', path: '/', method: 'HEAD' }, res => {
      resolve(res.statusCode < 500);
    });
    req.on('error', () => resolve(false));
    req.setTimeout(5000, () => { req.destroy(); resolve(false); });
    req.end();
  });
});

// =====================================================
// アプリ起動
// =====================================================
app.whenReady().then(() => {
  // 二重起動防止
  const gotLock = app.requestSingleInstanceLock();
  if (!gotLock) { app.quit(); return; }

  createWindow();
  registerStartup();
  disableTaskManager();
  registerBlockedShortcuts();

  // シャットダウン検知
  powerMonitor.on('shutdown', () => {
    if (isLoggedIn && currentUser) {
      recordLogoutSync(currentUser);
    }
  });

  // スリープ・復帰は何もしない（仕様通り）
  // powerMonitor.on('suspend', () => {});
  // powerMonitor.on('resume', () => {});
});

// 二重起動時は既存ウィンドウにフォーカス
app.on('second-instance', () => {
  if (mainWindow) {
    if (!isLoggedIn) mainWindow.show();
    mainWindow.focus();
  }
});

// 終了前処理
app.on('before-quit', () => {
  isQuitting = true;
  enableTaskManager();
  globalShortcut.unregisterAll();

  if (isLoggedIn && currentUser) {
    recordLogoutSync(currentUser);
  }
});

// ウィンドウを閉じてもアプリは終了しない（バックグラウンド常駐）
app.on('window-all-closed', () => {
  if (!isQuitting) return; // バックグラウンド維持
  app.quit();
});
