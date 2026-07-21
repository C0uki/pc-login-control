// =====================================================
// PC Login Control — 管理コンソール（Web GUI）
//   同一オリジンの /api（Vercel）を叩いて、導入状態の確認・
//   マスターPWハッシュ生成・DB初期化ガイド・ユーザー管理・
//   ログ閲覧・承認をブラウザだけで行います。
// =====================================================
'use strict';

// supabase/schema.sql と同一（DB初期化ガイド表示用）
var SCHEMA_SQL = [
  '-- PC Login Control — Supabase スキーマ',
  'create table if not exists public.users (',
  '  user_id         text primary key,',
  '  user_name       text not null default \'\',',
  '  hashed_password text not null,',
  '  created_at      timestamptz not null default now(),',
  '  updated_at      timestamptz not null default now()',
  ');',
  '',
  'create table if not exists public.logs (',
  '  id         bigint generated always as identity primary key,',
  '  user_id    text not null,',
  '  user_name  text not null default \'\',',
  '  action     text not null,',
  '  created_at timestamptz not null default now()',
  ');',
  'create index if not exists logs_user_id_idx   on public.logs (user_id);',
  'create index if not exists logs_created_at_idx on public.logs (created_at desc);',
  '',
  'create table if not exists public.approval_requests (',
  '  request_id   uuid primary key default gen_random_uuid(),',
  '  user_id      text not null,',
  '  user_name    text not null default \'\',',
  '  device_name  text not null default \'PC\',',
  '  status       text not null default \'pending\'',
  '               check (status in (\'pending\', \'approved\', \'denied\', \'expired\')),',
  '  created_at   timestamptz not null default now(),',
  '  responded_at timestamptz',
  ');',
  'create index if not exists approval_requests_user_status_idx on public.approval_requests (user_id, status);',
  'create index if not exists approval_requests_created_at_idx  on public.approval_requests (created_at desc);',
  '',
  'alter table public.users             enable row level security;',
  'alter table public.logs              enable row level security;',
  'alter table public.approval_requests enable row level security;',
].join('\n');

// ---------- 状態 ----------
var session = null; // { userId:'MASTER', passwordHash }

function $(id) { return document.getElementById(id); }

function getApiBase() {
  var saved = localStorage.getItem('pclc.apiBase');
  if (saved) return saved;
  // 同一オリジン配信時は相対 /api
  return (location.origin && location.origin !== 'null') ? location.origin + '/api' : '/api';
}

async function api(payload) {
  var res = await fetch(getApiBase(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  var text = await res.text();
  try { return JSON.parse(text); }
  catch (e) { throw new Error('レスポンス解析に失敗: ' + text.slice(0, 160)); }
}

function authCall(action, extra) {
  if (!session) return Promise.reject(new Error('未ログインです'));
  var payload = Object.assign({ action: action, userId: session.userId, passwordHash: session.passwordHash }, extra || {});
  return api(payload);
}

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}
function fmtTime(iso) {
  var d = new Date(iso);
  if (isNaN(d.getTime())) return esc(iso);
  return d.toLocaleString('ja-JP', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
}

// ---------- ① 導入状態 ----------
function setDot(id, state) {
  var el = $(id);
  el.className = 'dot' + (state ? ' ' + state : '');
}
async function refreshHealth() {
  $('healthMsg').textContent = '確認中…';
  try {
    var r = await api({ action: 'health' });
    setDot('dotApi', 'ok');
    setDot('dotEnv', r.envConfigured ? 'ok' : 'bad');
    setDot('dotMaster', r.masterConfigured ? 'ok' : 'warn');
    setDot('dotTables', r.tablesReady ? 'ok' : (r.envConfigured ? 'warn' : 'bad'));
    var notes = [];
    if (!r.envConfigured) notes.push('Vercel の環境変数 SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY を設定してください。');
    if (!r.masterConfigured) notes.push('MASTER_PASS_HASH を設定してください（②で生成）。');
    if (r.envConfigured && !r.tablesReady) notes.push('DBテーブルが未作成です（③のSQLを実行）。');
    if (r.dbError) notes.push('DB: ' + r.dbError);
    $('healthMsg').textContent = notes.length ? notes.join(' ') : 'すべて正常です。';
  } catch (e) {
    setDot('dotApi', 'bad');
    setDot('dotEnv', ''); setDot('dotMaster', ''); setDot('dotTables', '');
    $('healthMsg').textContent = 'API に接続できません（' + e.message + '）。⚙️ で URL を確認してください。';
  }
}

// ---------- ② ハッシュ生成 ----------
function genHash() {
  var pw = $('masterPlain').value;
  if (!pw) { return; }
  var hex = sha256(pw);
  $('hashValue').textContent = hex;
  $('hashOut').classList.remove('hidden');
}

// ---------- ④ ログイン ----------
async function doLogin() {
  var pw = $('masterPw').value;
  var errEl = $('loginError');
  errEl.classList.add('hidden');
  if (!pw) { showMsg(errEl, 'マスターパスワードを入力してください。', 'error'); return; }

  var hash = sha256(pw);
  $('loginBtn').disabled = true;
  try {
    var r = await api({ action: 'login', userId: 'MASTER', passwordHash: hash });
    if (r.success && r.userId === 'MASTER') {
      session = { userId: 'MASTER', passwordHash: hash };
      sessionStorage.setItem('pclc.session', JSON.stringify(session));
      $('masterPw').value = '';
      applyLoggedIn();
    } else if (r.success) {
      showMsg(errEl, '管理者(マスター)権限が必要です。', 'error');
    } else {
      showMsg(errEl, r.message || 'ログインに失敗しました。', 'error');
    }
  } catch (e) {
    showMsg(errEl, '通信エラー: ' + e.message, 'error');
  } finally {
    $('loginBtn').disabled = false;
  }
}
function doLogout() {
  session = null;
  sessionStorage.removeItem('pclc.session');
  $('adminArea').classList.add('hidden');
  $('loginCard').classList.remove('hidden');
  $('logoutBtn').classList.add('hidden');
  $('sessionBadge').classList.add('hidden');
}
function applyLoggedIn() {
  $('loginCard').classList.add('hidden');
  $('adminArea').classList.remove('hidden');
  $('logoutBtn').classList.remove('hidden');
  var badge = $('sessionBadge');
  badge.textContent = 'マスターでログイン中';
  badge.classList.remove('hidden');
  loadUsers();
}

// ---------- ユーザー ----------
async function loadUsers() {
  var ul = $('userList');
  ul.innerHTML = '<li class="empty">読み込み中…</li>';
  try {
    var r = await authCall('listUsers');
    if (!r.success) { ul.innerHTML = '<li class="empty">' + esc(r.message) + '</li>'; return; }
    var users = r.users || [];
    if (!users.length) { ul.innerHTML = '<li class="empty">ユーザーがいません</li>'; return; }
    ul.innerHTML = '';
    users.forEach(function (u) {
      var li = document.createElement('li');
      li.innerHTML =
        '<div class="meta"><div class="title">' + esc(u.userName || u.userId) + '</div>' +
        '<div class="sub">ID: ' + esc(u.userId) + '</div></div>' +
        '<div class="actions"><button class="danger-btn">削除</button></div>';
      li.querySelector('.danger-btn').addEventListener('click', function () { deleteUser(u.userId); });
      ul.appendChild(li);
    });
  } catch (e) {
    ul.innerHTML = '<li class="empty">' + esc(e.message) + '</li>';
  }
}
async function addUser() {
  var id = $('newUserId').value.trim();
  var name = $('newUserName').value.trim();
  var pw = $('newUserPw').value;
  var msg = $('userMsg');
  if (!id || !pw) { showMsg(msg, 'ユーザーIDと初期パスワードは必須です。', 'error'); return; }
  try {
    var r = await authCall('register', { newUserId: id, newUserName: name, newPasswordHash: sha256(pw) });
    if (r.success) {
      showMsg(msg, 'ユーザー「' + id + '」を登録しました。', 'ok');
      $('newUserId').value = ''; $('newUserName').value = ''; $('newUserPw').value = '';
      loadUsers();
    } else {
      showMsg(msg, r.message || '登録に失敗しました。', 'error');
    }
  } catch (e) { showMsg(msg, '通信エラー: ' + e.message, 'error'); }
}
async function deleteUser(userId) {
  if (!confirm('ユーザー「' + userId + '」を削除しますか？')) return;
  var msg = $('userMsg');
  try {
    var r = await authCall('deleteUser', { targetUserId: userId });
    showMsg(msg, r.success ? 'ユーザー「' + userId + '」を削除しました。' : (r.message || '削除に失敗しました。'), r.success ? 'ok' : 'error');
    loadUsers();
  } catch (e) { showMsg(msg, '通信エラー: ' + e.message, 'error'); }
}

// ---------- ログ ----------
async function loadLogs() {
  var ul = $('logList');
  ul.innerHTML = '<li class="empty">読み込み中…</li>';
  try {
    var r = await authCall('getLogs', { limit: 100 });
    var logs = (r.success && r.logs) ? r.logs : [];
    if (!logs.length) { ul.innerHTML = '<li class="empty">ログはありません</li>'; return; }
    ul.innerHTML = '';
    logs.forEach(function (log) {
      var color = log.action.indexOf('login') === 0 ? 'var(--ok)' : (log.action === 'logout' ? 'var(--sub)' : 'var(--warn)');
      var li = document.createElement('li');
      li.innerHTML =
        '<div class="meta"><div class="title"><span class="log-dot" style="background:' + color + '"></span>' +
        esc(log.userName || log.userId) + ' <span class="sub">・' + esc(actionLabel(log.action)) + '</span></div></div>' +
        '<div class="sub">' + fmtTime(log.timestamp) + '</div>';
      ul.appendChild(li);
    });
  } catch (e) { ul.innerHTML = '<li class="empty">' + esc(e.message) + '</li>'; }
}
function actionLabel(a) {
  if (a.indexOf('login') === 0) return a.indexOf('mobile') >= 0 ? 'ログイン(スマホ承認)' : 'ログイン';
  if (a === 'logout') return 'ログアウト';
  return a;
}

// ---------- 承認 ----------
async function loadApprovals() {
  var ul = $('approvalList');
  ul.innerHTML = '<li class="empty">読み込み中…</li>';
  try {
    var r = await authCall('listRequests');
    var reqs = (r.success && r.requests) ? r.requests : [];
    if (!reqs.length) { ul.innerHTML = '<li class="empty">保留中の承認はありません</li>'; return; }
    ul.innerHTML = '';
    reqs.forEach(function (req) {
      var li = document.createElement('li');
      li.innerHTML =
        '<div class="meta"><div class="title">💻 ' + esc(req.deviceName) + '</div>' +
        '<div class="sub">' + esc(req.userName || req.userId) + '（' + esc(req.userId) + '）· ' + fmtTime(req.createdAt) + '</div></div>' +
        '<div class="actions"><button class="danger-btn deny">拒否</button><button class="primary-btn approve">承認</button></div>';
      li.querySelector('.approve').addEventListener('click', function () { respond(req.requestId, 'approve'); });
      li.querySelector('.deny').addEventListener('click', function () { respond(req.requestId, 'deny'); });
      ul.appendChild(li);
    });
  } catch (e) { ul.innerHTML = '<li class="empty">' + esc(e.message) + '</li>'; }
}
async function respond(requestId, decision) {
  try {
    await authCall('respondRequest', { requestId: requestId, decision: decision });
  } catch (e) { /* 表示は再読込に任せる */ }
  loadApprovals();
}

// ---------- 共通UI ----------
function showMsg(el, text, kind) {
  el.textContent = text;
  el.className = 'msg ' + (kind || '');
  el.classList.remove('hidden');
}
function switchTab(name) {
  ['users', 'logs', 'approvals'].forEach(function (t) {
    $('tab-' + t).classList.toggle('hidden', t !== name);
  });
  document.querySelectorAll('.tab').forEach(function (b) {
    b.classList.toggle('active', b.getAttribute('data-tab') === name);
  });
  if (name === 'users') loadUsers();
  if (name === 'logs') loadLogs();
  if (name === 'approvals') loadApprovals();
}

// ---------- 初期化 ----------
function init() {
  $('schemaSql').textContent = SCHEMA_SQL;
  $('apiUrl').value = localStorage.getItem('pclc.apiBase') || '';

  $('settingsBtn').addEventListener('click', function () { $('settingsPanel').classList.toggle('hidden'); });
  $('saveApiUrl').addEventListener('click', function () {
    var v = $('apiUrl').value.trim();
    if (v) localStorage.setItem('pclc.apiBase', v); else localStorage.removeItem('pclc.apiBase');
    $('settingsPanel').classList.add('hidden');
    refreshHealth();
  });

  $('refreshHealth').addEventListener('click', refreshHealth);
  $('genHash').addEventListener('click', genHash);
  $('masterPlain').addEventListener('keydown', function (e) { if (e.key === 'Enter') genHash(); });
  $('copyHash').addEventListener('click', function () { copyText($('hashValue').textContent, this); });
  $('copySql').addEventListener('click', function () { copyText(SCHEMA_SQL, this); });

  $('loginBtn').addEventListener('click', doLogin);
  $('masterPw').addEventListener('keydown', function (e) { if (e.key === 'Enter') doLogin(); });
  $('logoutBtn').addEventListener('click', doLogout);

  $('addUser').addEventListener('click', addUser);
  $('refreshUsers').addEventListener('click', loadUsers);
  $('refreshLogs').addEventListener('click', loadLogs);
  $('refreshApprovals').addEventListener('click', loadApprovals);
  document.querySelectorAll('.tab').forEach(function (b) {
    b.addEventListener('click', function () { switchTab(b.getAttribute('data-tab')); });
  });

  // セッション復元
  var saved = sessionStorage.getItem('pclc.session');
  if (saved) {
    try { session = JSON.parse(saved); applyLoggedIn(); } catch (e) { /* ignore */ }
  }

  refreshHealth();
}

function copyText(text, btn) {
  var done = function () {
    if (!btn) return;
    var orig = btn.textContent; btn.textContent = 'コピーしました';
    setTimeout(function () { btn.textContent = orig; }, 1200);
  };
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(done, function () { fallbackCopy(text, done); });
  } else { fallbackCopy(text, done); }
}
function fallbackCopy(text, done) {
  var ta = document.createElement('textarea');
  ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
  document.body.appendChild(ta); ta.select();
  try { document.execCommand('copy'); } catch (e) { /* ignore */ }
  document.body.removeChild(ta); done();
}

document.addEventListener('DOMContentLoaded', init);
