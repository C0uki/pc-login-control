/*
 * NOTE: 生成物 server/app.js は本ファイルから `npm run build:console` で生成されます。
 *       編集はこの .ts 側で行ってください（.js を直接編集しないこと）。
 *
 * PC Login Control — 管理コンソール（Web GUI・マルチテナント）
 *   導入者は「組織を作成」→ 組織ID を取得 → 自組織のユーザー/ログ/承認を管理。
 *   Supabase / Vercel の操作は不要（オーナーの初回セットアップのみ）。
 */

// ---------- 型 ----------
interface BaseResult { success: boolean; message: string; }
interface HealthResult extends BaseResult {
  envConfigured?: boolean; tablesReady?: boolean; signupCodeRequired?: boolean; dbError?: string;
}
interface CreateOrgResult extends BaseResult { orgId?: string; orgName?: string; }
interface LoginResult extends BaseResult { orgId?: string; orgName?: string; userId?: string; userName?: string; }
interface UserRow { userId: string; userName: string; createdAt: string; }
interface ListUsersResult extends BaseResult { users?: UserRow[]; }
interface LogRow { timestamp: string; userId: string; userName: string; action: string; }
interface GetLogsResult extends BaseResult { logs?: LogRow[]; }
interface ApprovalRow { requestId: string; userId: string; userName: string; deviceName: string; createdAt: string; }
interface ListRequestsResult extends BaseResult { requests?: ApprovalRow[]; }
interface Session { orgId: string; orgName: string; passwordHash: string; }

type TabName = 'users' | 'logs' | 'approvals';

// supabase/schema.sql と同一（オーナーのDB初期化ガイド表示用）
const SCHEMA_SQL: string = [
  '-- PC Login Control — Supabase スキーマ（マルチテナント）',
  'create table if not exists public.organizations (',
  '  org_id           uuid primary key default gen_random_uuid(),',
  '  name             text not null,',
  '  master_pass_hash text not null,',
  '  created_at       timestamptz not null default now()',
  ');',
  '',
  'create table if not exists public.users (',
  '  org_id          uuid not null references public.organizations(org_id) on delete cascade,',
  '  user_id         text not null,',
  '  user_name       text not null default \'\',',
  '  hashed_password text not null,',
  '  created_at      timestamptz not null default now(),',
  '  updated_at      timestamptz not null default now(),',
  '  primary key (org_id, user_id)',
  ');',
  '',
  'create table if not exists public.logs (',
  '  id         bigint generated always as identity primary key,',
  '  org_id     uuid not null references public.organizations(org_id) on delete cascade,',
  '  user_id    text not null,',
  '  user_name  text not null default \'\',',
  '  action     text not null,',
  '  created_at timestamptz not null default now()',
  ');',
  'create index if not exists logs_org_created_idx on public.logs (org_id, created_at desc);',
  '',
  'create table if not exists public.approval_requests (',
  '  request_id   uuid primary key default gen_random_uuid(),',
  '  org_id       uuid not null references public.organizations(org_id) on delete cascade,',
  '  user_id      text not null,',
  '  user_name    text not null default \'\',',
  '  device_name  text not null default \'PC\',',
  '  status       text not null default \'pending\'',
  '               check (status in (\'pending\',\'approved\',\'denied\',\'expired\')),',
  '  created_at   timestamptz not null default now(),',
  '  responded_at timestamptz',
  ');',
  'create index if not exists approval_requests_org_idx on public.approval_requests (org_id, status, created_at desc);',
  '',
  'alter table public.organizations     enable row level security;',
  'alter table public.users             enable row level security;',
  'alter table public.logs              enable row level security;',
  'alter table public.approval_requests enable row level security;',
].join('\n');

// ---------- 状態 ----------
let session: Session | null = null;

// ---------- DOM ヘルパー ----------
function $<T extends HTMLElement = HTMLElement>(id: string): T {
  return document.getElementById(id) as T;
}
function inp(id: string): HTMLInputElement { return $(id) as HTMLInputElement; }

function getApiBase(): string {
  const saved = localStorage.getItem('pclc.apiBase');
  if (saved) return saved;
  return (location.origin && location.origin !== 'null') ? location.origin + '/api' : '/api';
}

async function api<T extends BaseResult = BaseResult>(payload: Record<string, unknown>): Promise<T> {
  const res = await fetch(getApiBase(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const text = await res.text();
  try { return JSON.parse(text) as T; }
  catch (e) { throw new Error('レスポンス解析に失敗: ' + text.slice(0, 160)); }
}

// 組織スコープ + マスター資格でのAPI呼び出し
function authCall<T extends BaseResult = BaseResult>(action: string, extra?: Record<string, unknown>): Promise<T> {
  if (!session) return Promise.reject(new Error('未ログインです'));
  return api<T>(Object.assign(
    { action, orgId: session.orgId, userId: 'MASTER', passwordHash: session.passwordHash },
    extra || {},
  ));
}

function esc(s: unknown): string {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' } as Record<string, string>
  )[c]);
}
function fmtTime(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return esc(iso);
  return d.toLocaleString('ja-JP', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
}
function showMsg(el: HTMLElement, text: string, kind?: string): void {
  el.textContent = text; el.className = 'msg ' + (kind || ''); el.classList.remove('hidden');
}

// ---------- 導入状態（オーナー向け） ----------
function setDot(id: string, state: string): void { $(id).className = 'dot' + (state ? ' ' + state : ''); }
async function refreshHealth(): Promise<void> {
  $('healthMsg').textContent = '確認中…';
  try {
    const r = await api<HealthResult>({ action: 'health' });
    setDot('dotApi', 'ok');
    setDot('dotEnv', r.envConfigured ? 'ok' : 'bad');
    setDot('dotTables', r.tablesReady ? 'ok' : (r.envConfigured ? 'warn' : 'bad'));
    if (r.signupCodeRequired) $('signupCodeRow').classList.remove('hidden');
    const notes: string[] = [];
    if (!r.envConfigured) notes.push('環境変数 SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY を設定してください。');
    if (r.envConfigured && !r.tablesReady) notes.push('DBテーブルが未作成です（スキーマSQLを実行）。');
    if (r.dbError) notes.push('DB: ' + r.dbError);
    $('healthMsg').textContent = notes.length ? notes.join(' ') : 'すべて正常です。';
  } catch (e) {
    setDot('dotApi', 'bad'); setDot('dotEnv', ''); setDot('dotTables', '');
    $('healthMsg').textContent = 'API に接続できません（' + errMsg(e) + '）。⚙️ で URL を確認してください。';
  }
}

// ---------- 組織を作成 ----------
async function createOrg(): Promise<void> {
  const name = inp('orgName').value.trim();
  const pw = inp('signupMasterPw').value;
  const code = inp('signupCode').value.trim();
  const err = $('signupError'); err.classList.add('hidden');
  if (!name) { showMsg(err, '組織名を入力してください。', 'error'); return; }
  if (!pw) { showMsg(err, '管理者パスワードを入力してください。', 'error'); return; }

  (inp('createOrgBtn') as unknown as HTMLButtonElement).disabled = true;
  try {
    const payload: Record<string, unknown> = { action: 'createOrg', orgName: name, masterPasswordHash: sha256(pw) };
    if (code) payload.signupCode = code;
    const r = await api<CreateOrgResult>(payload);
    if (r.success && r.orgId) {
      $('orgIdValue').textContent = r.orgId;
      $('orgResult').classList.remove('hidden');
      inp('orgIdInput').value = r.orgId;
      inp('loginMasterPw').value = pw;
      inp('signupMasterPw').value = '';
      inp('loginMasterPw').focus();
    } else {
      showMsg(err, r.message || '組織の作成に失敗しました。', 'error');
    }
  } catch (e) {
    showMsg(err, '通信エラー: ' + errMsg(e), 'error');
  } finally {
    (inp('createOrgBtn') as unknown as HTMLButtonElement).disabled = false;
  }
}

// ---------- 組織にログイン ----------
async function doLogin(): Promise<void> {
  const orgId = inp('orgIdInput').value.trim();
  const pw = inp('loginMasterPw').value;
  const err = $('loginError'); err.classList.add('hidden');
  if (!orgId) { showMsg(err, '組織IDを入力してください。', 'error'); return; }
  if (!pw) { showMsg(err, '管理者パスワードを入力してください。', 'error'); return; }

  const hash = sha256(pw);
  (inp('loginBtn') as unknown as HTMLButtonElement).disabled = true;
  try {
    const r = await api<LoginResult>({ action: 'login', orgId, userId: 'MASTER', passwordHash: hash });
    if (r.success && r.userId === 'MASTER') {
      session = { orgId: r.orgId || orgId, orgName: r.orgName || '', passwordHash: hash };
      inp('loginMasterPw').value = '';
      applyLoggedIn();
    } else if (r.success) {
      showMsg(err, '管理者パスワードが一致しません。', 'error');
    } else {
      showMsg(err, r.message || 'ログインに失敗しました。', 'error');
    }
  } catch (e) {
    showMsg(err, '通信エラー: ' + errMsg(e), 'error');
  } finally {
    (inp('loginBtn') as unknown as HTMLButtonElement).disabled = false;
  }
}
function doLogout(): void {
  session = null;
  $('adminArea').classList.add('hidden');
  $('authArea').classList.remove('hidden');
  $('logoutBtn').classList.add('hidden');
  $('sessionBadge').classList.add('hidden');
}
function applyLoggedIn(): void {
  if (!session) return;
  $('authArea').classList.add('hidden');
  $('adminArea').classList.remove('hidden');
  $('logoutBtn').classList.remove('hidden');
  $('orgBarName').textContent = session.orgName || '(組織)';
  $('orgBarId').textContent = session.orgId;
  const badge = $('sessionBadge');
  badge.textContent = (session.orgName || '組織') + ' · マスター';
  badge.classList.remove('hidden');
  switchTab('users');
}

// ---------- ユーザー ----------
async function loadUsers(): Promise<void> {
  const ul = $('userList'); ul.innerHTML = '<li class="empty">読み込み中…</li>';
  try {
    const r = await authCall<ListUsersResult>('listUsers');
    if (!r.success) { ul.innerHTML = '<li class="empty">' + esc(r.message) + '</li>'; return; }
    const users = r.users || [];
    if (!users.length) { ul.innerHTML = '<li class="empty">ユーザーがいません</li>'; return; }
    ul.innerHTML = '';
    users.forEach((u) => {
      const li = document.createElement('li');
      li.innerHTML =
        '<div class="meta"><div class="title">' + esc(u.userName || u.userId) + '</div>' +
        '<div class="sub">ID: ' + esc(u.userId) + '</div></div>' +
        '<div class="actions"><button class="danger-btn">削除</button></div>';
      const btn = li.querySelector('.danger-btn');
      if (btn) btn.addEventListener('click', () => deleteUser(u.userId));
      ul.appendChild(li);
    });
  } catch (e) { ul.innerHTML = '<li class="empty">' + esc(errMsg(e)) + '</li>'; }
}
async function addUser(): Promise<void> {
  const id = inp('newUserId').value.trim();
  const name = inp('newUserName').value.trim();
  const pw = inp('newUserPw').value;
  const msg = $('userMsg');
  if (!id || !pw) { showMsg(msg, 'ユーザーIDと初期パスワードは必須です。', 'error'); return; }
  try {
    const r = await authCall<BaseResult>('register', { newUserId: id, newUserName: name, newPasswordHash: sha256(pw) });
    if (r.success) {
      showMsg(msg, 'ユーザー「' + id + '」を登録しました。', 'ok');
      inp('newUserId').value = ''; inp('newUserName').value = ''; inp('newUserPw').value = '';
      loadUsers();
    } else { showMsg(msg, r.message || '登録に失敗しました。', 'error'); }
  } catch (e) { showMsg(msg, '通信エラー: ' + errMsg(e), 'error'); }
}
async function deleteUser(userId: string): Promise<void> {
  if (!confirm('ユーザー「' + userId + '」を削除しますか？')) return;
  const msg = $('userMsg');
  try {
    const r = await authCall<BaseResult>('deleteUser', { targetUserId: userId });
    showMsg(msg, r.success ? 'ユーザー「' + userId + '」を削除しました。' : (r.message || '削除に失敗しました。'), r.success ? 'ok' : 'error');
    loadUsers();
  } catch (e) { showMsg(msg, '通信エラー: ' + errMsg(e), 'error'); }
}

// ---------- ログ ----------
async function loadLogs(): Promise<void> {
  const ul = $('logList'); ul.innerHTML = '<li class="empty">読み込み中…</li>';
  try {
    const r = await authCall<GetLogsResult>('getLogs', { limit: 100 });
    const logs = (r.success && r.logs) ? r.logs : [];
    if (!logs.length) { ul.innerHTML = '<li class="empty">ログはありません</li>'; return; }
    ul.innerHTML = '';
    logs.forEach((log) => {
      const color = log.action.indexOf('login') === 0 ? 'var(--ok)' : (log.action === 'logout' ? 'var(--sub)' : 'var(--warn)');
      const li = document.createElement('li');
      li.innerHTML =
        '<div class="meta"><div class="title"><span class="log-dot" style="background:' + color + '"></span>' +
        esc(log.userName || log.userId) + ' <span class="sub">・' + esc(actionLabel(log.action)) + '</span></div></div>' +
        '<div class="sub">' + fmtTime(log.timestamp) + '</div>';
      ul.appendChild(li);
    });
  } catch (e) { ul.innerHTML = '<li class="empty">' + esc(errMsg(e)) + '</li>'; }
}
function actionLabel(a: string): string {
  if (a.indexOf('login') === 0) return a.indexOf('mobile') >= 0 ? 'ログイン(スマホ承認)' : 'ログイン';
  if (a === 'logout') return 'ログアウト';
  return a;
}

// ---------- 承認 ----------
async function loadApprovals(): Promise<void> {
  const ul = $('approvalList'); ul.innerHTML = '<li class="empty">読み込み中…</li>';
  try {
    const r = await authCall<ListRequestsResult>('listRequests');
    const reqs = (r.success && r.requests) ? r.requests : [];
    if (!reqs.length) { ul.innerHTML = '<li class="empty">保留中の承認はありません</li>'; return; }
    ul.innerHTML = '';
    reqs.forEach((req) => {
      const li = document.createElement('li');
      li.innerHTML =
        '<div class="meta"><div class="title">💻 ' + esc(req.deviceName) + '</div>' +
        '<div class="sub">' + esc(req.userName || req.userId) + '（' + esc(req.userId) + '）· ' + fmtTime(req.createdAt) + '</div></div>' +
        '<div class="actions"><button class="danger-btn deny">拒否</button><button class="primary-btn approve">承認</button></div>';
      const ap = li.querySelector('.approve');
      const dn = li.querySelector('.deny');
      if (ap) ap.addEventListener('click', () => respond(req.requestId, 'approve'));
      if (dn) dn.addEventListener('click', () => respond(req.requestId, 'deny'));
      ul.appendChild(li);
    });
  } catch (e) { ul.innerHTML = '<li class="empty">' + esc(errMsg(e)) + '</li>'; }
}
async function respond(requestId: string, decision: 'approve' | 'deny'): Promise<void> {
  try { await authCall<BaseResult>('respondRequest', { requestId, decision }); }
  catch (e) { /* 再読込に任せる */ }
  loadApprovals();
}

// ---------- タブ ----------
function switchTab(name: TabName): void {
  (['users', 'logs', 'approvals'] as TabName[]).forEach((t) => {
    $('tab-' + t).classList.toggle('hidden', t !== name);
  });
  document.querySelectorAll('.tab').forEach((b) => {
    b.classList.toggle('active', b.getAttribute('data-tab') === name);
  });
  if (name === 'users') loadUsers();
  if (name === 'logs') loadLogs();
  if (name === 'approvals') loadApprovals();
}

// ---------- コピー ----------
function copyText(text: string, btn?: HTMLElement): void {
  const done = (): void => {
    if (!btn) return;
    const orig = btn.textContent; btn.textContent = 'コピーしました';
    setTimeout(() => { btn.textContent = orig; }, 1200);
  };
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(done, () => fallbackCopy(text, done));
  } else { fallbackCopy(text, done); }
}
function fallbackCopy(text: string, done: () => void): void {
  const ta = document.createElement('textarea');
  ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
  document.body.appendChild(ta); ta.select();
  try { document.execCommand('copy'); } catch (e) { /* ignore */ }
  document.body.removeChild(ta); done();
}

function errMsg(e: unknown): string { return e instanceof Error ? e.message : String(e); }

// ---------- 初期化 ----------
function init(): void {
  $('schemaSql').textContent = SCHEMA_SQL;
  inp('apiUrl').value = localStorage.getItem('pclc.apiBase') || '';

  $('settingsBtn').addEventListener('click', () => $('settingsPanel').classList.toggle('hidden'));
  $('saveApiUrl').addEventListener('click', () => {
    const v = inp('apiUrl').value.trim();
    if (v) localStorage.setItem('pclc.apiBase', v); else localStorage.removeItem('pclc.apiBase');
    $('settingsPanel').classList.add('hidden');
    refreshHealth();
  });

  $('createOrgBtn').addEventListener('click', createOrg);
  const copyOrgIdBtn = $('copyOrgId');
  copyOrgIdBtn.addEventListener('click', () => copyText($('orgIdValue').textContent || '', copyOrgIdBtn));
  $('loginBtn').addEventListener('click', doLogin);
  inp('loginMasterPw').addEventListener('keydown', (e) => { if (e.key === 'Enter') doLogin(); });
  $('logoutBtn').addEventListener('click', doLogout);
  const copyBarBtn = $('copyOrgBarId');
  copyBarBtn.addEventListener('click', () => copyText($('orgBarId').textContent || '', copyBarBtn));

  $('refreshHealth').addEventListener('click', refreshHealth);
  const copySqlBtn = $('copySql');
  copySqlBtn.addEventListener('click', () => copyText(SCHEMA_SQL, copySqlBtn));

  $('addUser').addEventListener('click', addUser);
  $('refreshUsers').addEventListener('click', loadUsers);
  $('refreshLogs').addEventListener('click', loadLogs);
  $('refreshApprovals').addEventListener('click', loadApprovals);
  document.querySelectorAll('.tab').forEach((b) => {
    b.addEventListener('click', () => switchTab(b.getAttribute('data-tab') as TabName));
  });

  refreshHealth();
}

document.addEventListener('DOMContentLoaded', init);
