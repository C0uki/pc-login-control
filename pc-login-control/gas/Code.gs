// =====================================================
// PC_Login_Control_System — Google Apps Script (Backend)
//   ・PC（Electron / React Native for Windows）からの直接ログイン
//   ・モバイルアプリからの承認フロー（プッシュ承認）
//   ・利用ログ / ユーザー管理
// =====================================================

// ▼ 必ずご自身の値に書き換えてください
const SPREADSHEET_ID    = '1aXZoeqpa7nSk0GILty09AEVr5q_uvD4kZJMBEl7smys'; // スプレッドシートのID
const MASTER_PASS_HASH  = 'YOUR_MASTER_PASSWORD_SHA256';                  // マスターPWのSHA-256ハッシュ
const USER_SHEET_NAME   = 'ユーザーマスター';
const LOG_SHEET_NAME    = '利用ログ';
const REQUEST_SHEET_NAME = '認証リクエスト';

// 承認リクエストの有効期限（秒）
const APPROVAL_TTL_SEC = 120;

// =====================================================
// エントリーポイント: POST リクエスト受付
// =====================================================
function doPost(e) {
  try {
    const data   = JSON.parse(e.postData.contents);
    const action = data.action;

    switch (action) {
      // --- 既存（PC 直接ログイン） ---
      case 'login':           return handleLogin(data);
      case 'logout':          return handleLogout(data);
      // --- モバイル承認フロー ---
      case 'requestApproval': return handleRequestApproval(data); // PC が承認を要求
      case 'checkApproval':   return handleCheckApproval(data);   // PC が承認状態を確認
      case 'listRequests':    return handleListRequests(data);    // モバイルが保留中を取得
      case 'respondRequest':  return handleRespondRequest(data);  // モバイルが承認/拒否
      // --- モバイル: ログ閲覧 ---
      case 'getLogs':         return handleGetLogs(data);
      default:                return respond(false, '不正なアクションです');
    }
  } catch (err) {
    return respond(false, 'サーバーエラー: ' + err.message);
  }
}

// 動作確認用（ブラウザで開いた時）
function doGet() {
  return respond(true, 'PC Login Control API is running');
}

// =====================================================
// ログイン処理（ID + パスワードハッシュ）
// =====================================================
function handleLogin(data) {
  const auth = authenticateUser(data.userId, data.passwordHash);
  if (!auth.ok) return respond(false, auth.message);

  recordLog(auth.userId, auth.userName, 'login');
  return respond(true, auth.userId === 'MASTER' ? 'マスターパスワードで認証しました' : 'ログイン成功', {
    userId:   auth.userId,
    userName: auth.userName,
  });
}

// =====================================================
// ログアウト処理
// =====================================================
function handleLogout(data) {
  const { userId, userName } = data;
  if (!userId) return respond(false, 'ユーザー情報がありません');

  recordLog(userId, userName || '', 'logout');
  return respond(true, 'ログアウト記録完了');
}

// =====================================================
// 認証ユーティリティ：ID + ハッシュ → { ok, userId, userName }
//   ・マスターパスワードにも対応
// =====================================================
function authenticateUser(userId, passwordHash) {
  if (!passwordHash) return { ok: false, message: 'パスワードが指定されていません' };

  // マスターパスワード
  if (passwordHash === MASTER_PASS_HASH) {
    return { ok: true, userId: 'MASTER', userName: 'マスター' };
  }

  const ss        = SpreadsheetApp.openById(SPREADSHEET_ID);
  const userSheet = ss.getSheetByName(USER_SHEET_NAME);
  if (!userSheet) return { ok: false, message: 'ユーザーマスターシートが見つかりません' };

  const users = userSheet.getDataRange().getValues();
  for (let i = 1; i < users.length; i++) {
    const [id, name, hash] = users[i];
    if (String(id).trim() === String(userId).trim() &&
        String(hash).trim() === String(passwordHash).trim()) {
      return { ok: true, userId: id, userName: name };
    }
  }
  return { ok: false, message: 'IDまたはパスワードが正しくありません' };
}

// =====================================================
// モバイル承認フロー
// =====================================================

// --- PC: 承認リクエストを作成 ---
// { userId, deviceName } → { requestId, userName, expiresInSec }
function handleRequestApproval(data) {
  const userId     = String(data.userId || '').trim();
  const deviceName = String(data.deviceName || 'PC').trim();
  if (!userId) return respond(false, 'ユーザーIDが必要です');

  // 存在するユーザーか確認（パスワードは不要。承認はモバイル側で認証して行う）
  const userName = lookupUserName(userId);
  if (userName === null) return respond(false, '登録されていないユーザーIDです');

  const sheet = getOrCreateRequestSheet();
  const requestId = Utilities.getUuid();
  const now = new Date();
  // request_id, user_id, user_name, device_name, status, created_at, responded_at
  sheet.appendRow([requestId, userId, userName, deviceName, 'pending', now, '']);

  return respond(true, '承認リクエストを送信しました', {
    requestId:    requestId,
    userName:     userName,
    expiresInSec: APPROVAL_TTL_SEC,
  });
}

// --- PC: 承認状態を確認 ---
// { requestId } → { status, userId, userName }
function handleCheckApproval(data) {
  const requestId = String(data.requestId || '').trim();
  if (!requestId) return respond(false, 'requestId が必要です');

  const found = findRequest(requestId);
  if (!found) return respond(false, 'リクエストが見つかりません', { status: 'expired' });

  const status = effectiveStatus(found.row);
  return respond(true, 'OK', {
    status:   status,
    userId:   found.row.userId,
    userName: found.row.userName,
  });
}

// --- モバイル: 保留中リクエスト一覧 ---
// { userId, passwordHash } → { requests: [...] }
function handleListRequests(data) {
  const auth = authenticateUser(data.userId, data.passwordHash);
  if (!auth.ok) return respond(false, auth.message);

  const sheet = getOrCreateRequestSheet();
  const values = sheet.getDataRange().getValues();
  const isMaster = auth.userId === 'MASTER';
  const requests = [];

  for (let i = 1; i < values.length; i++) {
    const row = parseRequestRow(values[i]);
    if (row.status !== 'pending') continue;
    if (isExpired(row.createdAt)) continue;
    if (!isMaster && String(row.userId).trim() !== String(auth.userId).trim()) continue;

    requests.push({
      requestId:  row.requestId,
      userId:     row.userId,
      userName:   row.userName,
      deviceName: row.deviceName,
      status:     'pending',
      createdAt:  toIso(row.createdAt),
    });
  }
  // 新しい順
  requests.reverse();
  return respond(true, 'OK', { requests: requests });
}

// --- モバイル: 承認 / 拒否 ---
// { userId, passwordHash, requestId, decision } → { }
function handleRespondRequest(data) {
  const auth = authenticateUser(data.userId, data.passwordHash);
  if (!auth.ok) return respond(false, auth.message);

  const requestId = String(data.requestId || '').trim();
  const decision  = String(data.decision || '').trim(); // 'approve' | 'deny'
  if (!requestId) return respond(false, 'requestId が必要です');
  if (decision !== 'approve' && decision !== 'deny') {
    return respond(false, 'decision は approve か deny を指定してください');
  }

  const found = findRequest(requestId);
  if (!found) return respond(false, 'リクエストが見つかりません');

  const row = found.row;
  const isMaster = auth.userId === 'MASTER';
  // 自分宛のリクエストのみ応答可能（マスターは全て可）
  if (!isMaster && String(row.userId).trim() !== String(auth.userId).trim()) {
    return respond(false, 'このリクエストに応答する権限がありません');
  }
  if (effectiveStatus(row) !== 'pending') {
    return respond(false, 'このリクエストは既に処理済みか期限切れです');
  }

  const sheet = getOrCreateRequestSheet();
  const newStatus = decision === 'approve' ? 'approved' : 'denied';
  // status(5列目), responded_at(7列目)
  sheet.getRange(found.rowIndex, 5).setValue(newStatus);
  sheet.getRange(found.rowIndex, 7).setValue(new Date());

  // 承認時にログイン記録
  if (newStatus === 'approved') {
    recordLog(row.userId, row.userName, 'login(mobile)');
  }
  return respond(true, newStatus === 'approved' ? '承認しました' : '拒否しました', { status: newStatus });
}

// =====================================================
// モバイル: 利用ログ取得
// { userId, passwordHash, limit } → { logs: [...] }
// =====================================================
function handleGetLogs(data) {
  const auth = authenticateUser(data.userId, data.passwordHash);
  if (!auth.ok) return respond(false, auth.message);

  const limit = Math.min(Math.max(parseInt(data.limit, 10) || 50, 1), 200);
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const logSheet = ss.getSheetByName(LOG_SHEET_NAME);
  if (!logSheet) return respond(true, 'OK', { logs: [] });

  const values = logSheet.getDataRange().getValues();
  const isMaster = auth.userId === 'MASTER';
  const logs = [];

  // 末尾（新しい行）から遡って収集
  for (let i = values.length - 1; i >= 1 && logs.length < limit; i--) {
    const [timestamp, uid, uname, act] = values[i];
    if (!isMaster && String(uid).trim() !== String(auth.userId).trim()) continue;
    logs.push({
      timestamp: toIso(timestamp),
      userId:    uid,
      userName:  uname,
      action:    act,
    });
  }
  return respond(true, 'OK', { logs: logs });
}

// =====================================================
// リクエストシート ヘルパー
// =====================================================
function getOrCreateRequestSheet() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  let sheet = ss.getSheetByName(REQUEST_SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(REQUEST_SHEET_NAME);
    sheet.appendRow(['request_id', 'user_id', 'user_name', 'device_name', 'status', 'created_at', 'responded_at']);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function parseRequestRow(arr) {
  return {
    requestId:  arr[0],
    userId:     arr[1],
    userName:   arr[2],
    deviceName: arr[3],
    status:     arr[4],
    createdAt:  arr[5],
    respondedAt: arr[6],
  };
}

function findRequest(requestId) {
  const sheet = getOrCreateRequestSheet();
  const values = sheet.getDataRange().getValues();
  for (let i = 1; i < values.length; i++) {
    if (String(values[i][0]).trim() === requestId) {
      return { rowIndex: i + 1, row: parseRequestRow(values[i]) };
    }
  }
  return null;
}

function effectiveStatus(row) {
  if (row.status === 'pending' && isExpired(row.createdAt)) return 'expired';
  return row.status;
}

function isExpired(createdAt) {
  const t = (createdAt instanceof Date) ? createdAt.getTime() : new Date(createdAt).getTime();
  return (Date.now() - t) > APPROVAL_TTL_SEC * 1000;
}

function lookupUserName(userId) {
  if (userId === 'MASTER') return 'マスター';
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const userSheet = ss.getSheetByName(USER_SHEET_NAME);
  if (!userSheet) return null;
  const users = userSheet.getDataRange().getValues();
  for (let i = 1; i < users.length; i++) {
    if (String(users[i][0]).trim() === String(userId).trim()) {
      return users[i][1];
    }
  }
  return null;
}

// =====================================================
// ログ記録
// =====================================================
function recordLog(userId, userName, action) {
  const ss       = SpreadsheetApp.openById(SPREADSHEET_ID);
  let logSheet   = ss.getSheetByName(LOG_SHEET_NAME);
  if (!logSheet) {
    logSheet = ss.insertSheet(LOG_SHEET_NAME);
    logSheet.appendRow(['timestamp', 'user_id', 'user_name', 'action']);
    logSheet.setFrozenRows(1);
  }
  logSheet.appendRow([new Date(), userId, userName, action]);
}

// =====================================================
// レスポンス生成
// =====================================================
function respond(success, message, extra) {
  const payload = Object.assign({ success, message }, extra || {});
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}

// 日付を ISO 文字列へ（未定義は空文字）
function toIso(d) {
  if (!d) return '';
  const date = (d instanceof Date) ? d : new Date(d);
  return isNaN(date.getTime()) ? String(d) : date.toISOString();
}

// =====================================================
// Googleフォーム送信トリガー — パスワードをハッシュ化して保存
// =====================================================
function onFormSubmit(e) {
  const res      = e.namedValues;
  const userId   = (res['ユーザーID'] || [''])[0].trim();
  const userName = (res['ユーザー名'] || [''])[0].trim();
  const password = (res['パスワード'] || [''])[0].trim();
  if (!userId || !password) return;

  const hashed    = hashPassword(password);
  const ss        = SpreadsheetApp.openById(SPREADSHEET_ID);
  const userSheet = ss.getSheetByName(USER_SHEET_NAME);

  const data = userSheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]).trim() === userId) {
      userSheet.getRange(i + 1, 2).setValue(userName);
      userSheet.getRange(i + 1, 3).setValue(hashed);
      return;
    }
  }
  userSheet.appendRow([userId, userName, hashed]);
}

// =====================================================
// SHA-256 ハッシュ計算ユーティリティ
// =====================================================
function hashPassword(password) {
  const bytes = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    password,
    Utilities.Charset.UTF_8
  );
  return bytes
    .map(b => ('0' + (b & 0xFF).toString(16)).slice(-2))
    .join('');
}

// =====================================================
// スプレッドシートの初期セットアップ（初回のみ実行）
// =====================================================
function setupSpreadsheet() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);

  let userSheet = ss.getSheetByName(USER_SHEET_NAME);
  if (!userSheet) {
    userSheet = ss.insertSheet(USER_SHEET_NAME);
    userSheet.appendRow(['user_id', 'user_name', 'hashed_password']);
    userSheet.setFrozenRows(1);
  }

  let logSheet = ss.getSheetByName(LOG_SHEET_NAME);
  if (!logSheet) {
    logSheet = ss.insertSheet(LOG_SHEET_NAME);
    logSheet.appendRow(['timestamp', 'user_id', 'user_name', 'action']);
    logSheet.setFrozenRows(1);
  }

  getOrCreateRequestSheet();
  Logger.log('セットアップ完了');
}
