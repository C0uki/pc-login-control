// =====================================================
// PC_Login_Control_System — Google Apps Script
// =====================================================

// ▼ 必ずご自身の値に書き換えてください
const SPREADSHEET_ID    = 'YOUR_SPREADSHEET_ID';           // スプレッドシートのID
const MASTER_PASS_HASH  = 'YOUR_MASTER_PASSWORD_SHA256';   // マスターPWのSHA-256ハッシュ
const USER_SHEET_NAME   = 'ユーザーマスター';
const LOG_SHEET_NAME    = '利用ログ';

// =====================================================
// エントリーポイント: POST リクエスト受付
// =====================================================
function doPost(e) {
  try {
    const data   = JSON.parse(e.postData.contents);
    const action = data.action;

    if (action === 'login')  return handleLogin(data);
    if (action === 'logout') return handleLogout(data);

    return respond(false, '不正なアクションです');
  } catch (err) {
    return respond(false, 'サーバーエラー: ' + err.message);
  }
}

// =====================================================
// ログイン処理
// =====================================================
function handleLogin(data) {
  const { userId, passwordHash } = data;

  // マスターパスワードチェック
  if (passwordHash === MASTER_PASS_HASH) {
    recordLog('MASTER', 'マスター', 'login');
    return respond(true, 'マスターパスワードで認証しました', {
      userId:   'MASTER',
      userName: 'マスター'
    });
  }

  // 通常ユーザー照合
  const ss        = SpreadsheetApp.openById(SPREADSHEET_ID);
  const userSheet = ss.getSheetByName(USER_SHEET_NAME);

  if (!userSheet) return respond(false, 'ユーザーマスターシートが見つかりません');

  const users = userSheet.getDataRange().getValues();

  for (let i = 1; i < users.length; i++) {
    const [id, name, hash] = users[i];
    if (String(id).trim() === String(userId).trim() &&
        String(hash).trim() === String(passwordHash).trim()) {
      recordLog(id, name, 'login');
      return respond(true, 'ログイン成功', {
        userId:   id,
        userName: name
      });
    }
  }

  return respond(false, 'IDまたはパスワードが正しくありません');
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
// ログ記録
// =====================================================
function recordLog(userId, userName, action) {
  const ss       = SpreadsheetApp.openById(SPREADSHEET_ID);
  const logSheet = ss.getSheetByName(LOG_SHEET_NAME);

  if (!logSheet) {
    // シートがなければ自動作成
    const newSheet = ss.insertSheet(LOG_SHEET_NAME);
    newSheet.appendRow(['timestamp', 'user_id', 'user_name', 'action']);
  }

  ss.getSheetByName(LOG_SHEET_NAME)
    .appendRow([new Date(), userId, userName, action]);
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

// =====================================================
// Googleフォーム送信トリガー — パスワードをハッシュ化してマスターシートへ保存
// ※フォームのトリガーとして「onFormSubmit」を設定してください
// =====================================================
function onFormSubmit(e) {
  const res      = e.namedValues;
  const userId   = (res['ユーザーID']  || [''])[0].trim();
  const userName = (res['ユーザー名']  || [''])[0].trim();
  const password = (res['パスワード']  || [''])[0].trim();

  if (!userId || !password) return;

  const hashed    = hashPassword(password);
  const ss        = SpreadsheetApp.openById(SPREADSHEET_ID);
  const userSheet = ss.getSheetByName(USER_SHEET_NAME);

  // 既存ユーザーの更新チェック
  const data = userSheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]).trim() === userId) {
      userSheet.getRange(i + 1, 2).setValue(userName);
      userSheet.getRange(i + 1, 3).setValue(hashed);
      return;
    }
  }

  // 新規追加
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

  // ユーザーマスター
  let userSheet = ss.getSheetByName(USER_SHEET_NAME);
  if (!userSheet) {
    userSheet = ss.insertSheet(USER_SHEET_NAME);
    userSheet.appendRow(['user_id', 'user_name', 'hashed_password']);
    userSheet.setFrozenRows(1);
  }

  // 利用ログ
  let logSheet = ss.getSheetByName(LOG_SHEET_NAME);
  if (!logSheet) {
    logSheet = ss.insertSheet(LOG_SHEET_NAME);
    logSheet.appendRow(['timestamp', 'user_id', 'user_name', 'action']);
    logSheet.setFrozenRows(1);
  }

  Logger.log('セットアップ完了');
}
