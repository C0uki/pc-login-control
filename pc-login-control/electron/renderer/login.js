'use strict';

// =====================================================
// PC_Login_Control_System — Login Renderer
// =====================================================

const userIdInput  = document.getElementById('userId');
const passwordInput = document.getElementById('password');
const loginBtn     = document.getElementById('loginBtn');
const messageEl    = document.getElementById('message');
const offlineBadge = document.getElementById('offline-badge');

// =====================================================
// オンライン状態の監視
// =====================================================
let isOnline = true;

async function updateOnlineStatus() {
  isOnline = await window.electronAPI.checkOnline();
  if (!isOnline) {
    offlineBadge.classList.add('visible');
    showMessage('インターネットに接続されていません。接続を確認してください。', 'warn');
  } else {
    offlineBadge.classList.remove('visible');
    clearMessage();
  }
}

// 起動時 + 30秒ごとに確認
updateOnlineStatus();
setInterval(updateOnlineStatus, 30_000);

// =====================================================
// メッセージ表示
// =====================================================
function showMessage(text, type = 'error') {
  messageEl.textContent = text;
  messageEl.className = `message ${type}`;
}

function clearMessage() {
  messageEl.className = 'message';
  messageEl.textContent = '';
}

// =====================================================
// ログイン処理
// =====================================================
async function handleLogin() {
  const userId   = userIdInput.value.trim();
  const password = passwordInput.value;

  // 入力バリデーション
  if (!userId) {
    showMessage('ユーザーIDを入力してください。');
    userIdInput.focus();
    return;
  }
  if (!password) {
    showMessage('パスワードを入力してください。');
    passwordInput.focus();
    return;
  }

  // オフライン確認
  const online = await window.electronAPI.checkOnline();
  if (!online) {
    showMessage('インターネットに接続されていません。\nネットワークを確認後、再度お試しください。', 'warn');
    return;
  }

  // ボタンをローディング状態に
  setLoading(true);
  clearMessage();

  try {
    const result = await window.electronAPI.authenticate(userId, password);

    if (result.success) {
      showMessage(`ようこそ、${result.userName} さん。\nログインしています…`, 'success');
      passwordInput.value = '';
      // GASへの記録とバックグラウンド移行はmain.jsで完了
      // 少し待ってからウィンドウが消える
      setTimeout(() => setLoading(false), 2000);
    } else {
      showMessage(result.message || '認証に失敗しました。');
      passwordInput.value = '';
      passwordInput.focus();
      setLoading(false);
      // ブルートフォース対策: 3秒間ボタンを無効化
      loginBtn.disabled = true;
      setTimeout(() => { loginBtn.disabled = false; }, 3000);
    }
  } catch (err) {
    showMessage('通信エラーが発生しました。\n' + err.message);
    setLoading(false);
  }
}

function setLoading(loading) {
  loginBtn.disabled = loading;
  if (loading) {
    loginBtn.classList.add('loading');
    loginBtn.textContent = '認証中';
  } else {
    loginBtn.classList.remove('loading');
    loginBtn.textContent = 'ログイン';
  }
}

// =====================================================
// イベントリスナー
// =====================================================
loginBtn.addEventListener('click', handleLogin);

// Enterキーで送信
[userIdInput, passwordInput].forEach(input => {
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter') handleLogin();
  });
});

// =====================================================
// キーボードショートカット無効化（レンダラー側）
// =====================================================
document.addEventListener('keydown', e => {
  // F系キー、Alt系、Ctrl+Alt 系を無効化
  const blocked = [
    e.key.startsWith('F') && !['F5'].includes(e.key),  // F1-F12 (F5リロードも念のため)
    e.altKey,
    e.metaKey,
    e.ctrlKey && e.altKey,
  ];
  if (blocked.some(Boolean)) {
    e.preventDefault();
    e.stopPropagation();
  }
}, true);

// コンテキストメニュー無効化
document.addEventListener('contextmenu', e => e.preventDefault());

// ドラッグ無効化
document.addEventListener('dragstart', e => e.preventDefault());

// =====================================================
// フォーカス制御（ページロード時にIDフィールドへ）
// =====================================================
window.addEventListener('DOMContentLoaded', () => {
  userIdInput.focus();
});
