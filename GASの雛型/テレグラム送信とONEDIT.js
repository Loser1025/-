// === 構成概要 ===
// スプレッドシート「司令塔シート 2」の全体を監視し、関数エラーが出たらTelegramへ通知（重複通知防止付き）
// 通知にはスプレッドシート名、シート名、セル、エラー内容を含む

const TELEGRAM_TOKEN = '7589292246:AAFHXyeUmQHu6Qyz59FIxUfB5tc1Sb0Ar-g';
const CHAT_ID = '-4657721134';

// function onEdit(e) {
//   checkErrorsInSheet();
// }

function checkErrorsInSheet() {
  const start = new Date();

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const spreadsheetId = ss.getId();
  const spreadsheetName = ss.getName();
  const sheet = ss.getSheetByName('司令塔シート 2');
  if (!sheet) {
    Logger.log('シート「司令塔シート 2」が見つかりません');
    return;
  }

  const sheetName = sheet.getName();
  const scriptProperties = PropertiesService.getScriptProperties();
  let messages = [];

  const range = sheet.getRange('A3:IN3');
  const formulas = range.getFormulas();
  const values = range.getDisplayValues();

  Logger.log(`チェック開始: ${spreadsheetName} - ${sheetName}`);
  Logger.log(`セル範囲: ${range.getA1Notation()}`);
  Logger.log(`行数: ${formulas.length}, 列数: ${formulas[0].length}`);

  for (let r = 0; r < formulas.length; r++) {
    for (let c = 0; c < formulas[0].length; c++) {
      const value = values[r][c];
      const formula = formulas[r][c];
      const cell = range.getCell(r + 1, c + 1);
      const key = `${spreadsheetId}_${sheetName}!${cell.getA1Notation()}`;

      if (formula) Logger.log(`式あり: ${cell.getA1Notation()} = ${formula}`);

      if (typeof value === 'string' && value.startsWith('#')) {
        Logger.log(`エラー検出: ${cell.getA1Notation()} = ${value}`);
        const previous = scriptProperties.getProperty(key);
        if (!previous || previous !== value) {
          messages.push(`\u274c *スプレッドシート*: ${spreadsheetName}\n*シート*: ${sheetName}\n*セル*: ${cell.getA1Notation()}\n*エラー内容*: ${value}`);
          scriptProperties.setProperty(key, value);
        }
      } else {
        scriptProperties.deleteProperty(key);
      }
    }
  }

  if (messages.length > 0) {
    Logger.log(`送信メッセージ数: ${messages.length}`);
    sendTelegramMessage(messages.join('\n\n'));
  } else {
    Logger.log('エラーは検出されませんでした。');
  }

  const end = new Date();
  const duration = (end.getTime() - start.getTime()) / 1000;
  Logger.log(`チェック完了 - 処理時間: ${duration.toFixed(2)} 秒`);
}

function sendTelegramMessage(text) {
  const url = `https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`;
  const payload = {
    chat_id: CHAT_ID,
    text: text,
    parse_mode: 'Markdown'
  };
  const options = {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(payload)
  };
  UrlFetchApp.fetch(url, options);
  Logger.log('Telegramへ送信完了');
}

// === 時間トリガー・手動実行用関数 ===
function checkErrorsScheduled() {
  Logger.clear();
  checkErrorsInSheet();
}
function testCheckErrors() {
  Logger.clear();
  checkErrorsInSheet();
} // GASエディタから実行して、通知テスト＋ログ出力が可能です

/**
 * onEdit (インストール型) 統合版
 *
 * ▼機能A：提案者セルに「廣田珠輝」が入力されたら Telegram 通知
 *   - 対象シート: 『司令塔シート 2』
 *   - 条件: 1セル編集、編集セルの値が『廣田珠輝』、同列ヘッダー(1〜10行)のどこかが『提案者』
 *   - IDは編集セルの 15 列左 (col - 15) から取得
 *   - 送信文:  ✉️ *采配されました*\n*ID*: {ID}
 *
 * ▼機能B：『廣田珠輝』の左隣セルが編集されたら 速報シートE列を『空き』にし Telegram 通知
 *   - 対象シート: 『司令塔シート 2』
 *   - 条件: 1セル編集、編集セルの右隣の表示値が『TARGET_NAME』
 *   - 反映先: 別ブック(ID指定)『速報シート』の D 列を上から検索し、最初の一致行の E を『空き』に
 *   - 送信文:  『速報シート』の E{行} を「空き」に変更しました。
 *
 * ▼機能C（新）：ヘッダーが『結果』の列で値が『〇』になったら、右隣セルの内容をTelegramに送信
 *   - 対象シート: 『司令塔シート 2』
 *   - 条件: 1セル編集、同列ヘッダー(1〜10行)のどこかが『結果』、かつ編集後の表示値が『〇』
 *   - 送信文:  右隣セルの表示値そのもの（テキストのみ）
 *
 * 注意: UrlFetchApp / 別ブック操作があるため、必ずインストール型 onEdit で動かしてください。
 */

// ====== 固定設定 ======
const SRC_SHEET_NAME = '司令塔シート 2';
const TARGET_NAME = '廣田珠輝';
const DEST_SPREADSHEET_ID = '1SXM-kKPu1nuq0sZKrsl-m_O2vmNl-HyJ9TrYtRi2Xrs';
const DEST_SHEET_NAME = '速報シート';

// ※ TELEGRAM_TOKEN / CHAT_ID は既存の定義を使用

/** メイン onEdit（インストール型で使用） */
function onEdit_Main(e) {
  if (!e) return; // 手動実行ガード

  const sheet = e.source.getActiveSheet();
  if (!sheet || sheet.getName() !== SRC_SHEET_NAME) return; // 対象シートのみ

  // 単一セルのみ対象
  if (e.range.getNumRows() !== 1 || e.range.getNumColumns() !== 1) return;

  const row = e.range.getRow();
  const col = e.range.getColumn();

  // ========= 機能A：提案者 + 廣田珠輝 で通知 =========
  try {
    maybeNotifyWhenProposalHirota_(sheet, row, col);
  } catch (err) {
    console.error('[機能Aエラー]', err);
  }

  // ========= 機能B：右隣が廣田珠輝 → 速報シートEを空き =========
  try {
    maybeMarkAkiWhenLeftNeighborOfHirota_(sheet, row, col);
  } catch (err) {
    console.error('[機能Bエラー]', err);
  }

}

/** 機能A: 『提案者』列で値が『廣田珠輝』になったら Telegram 通知 */
function maybeNotifyWhenProposalHirota_(sheet, row, col) {
  const value = sheet.getRange(row, col).getDisplayValue();
  if (value !== TARGET_NAME) return; // 値が一致しなければ終了

  // 上 1〜10 行のどこかに『提案者』ヘッダーがあるか
  let isProposalColumn = false;
  for (let r = 1; r <= 10; r++) {
    const hdr = sheet.getRange(r, col).getDisplayValue();
    if (hdr === '提案者') { isProposalColumn = true; break; }
  }
  if (!isProposalColumn) return;

  // ID は 15 列左
  const idCell = sheet.getRange(row, col - 15);
  const idValue = idCell.getDisplayValue();
  const message = `✉️ *采配されました*\n*ID*: ${idValue}`;
  sendTelegramMessage_(message);
}

/** 機能B: 編集セルの右隣が『廣田珠輝』なら、速報シートEを『空き』にして通知 */
function maybeMarkAkiWhenLeftNeighborOfHirota_(sheet, row, col) {
  if (col >= sheet.getMaxColumns()) return; // 右隣なし
  const rightValue = sheet.getRange(row, col + 1).getDisplayValue();
  if (rightValue !== TARGET_NAME) return;

  const destSs = SpreadsheetApp.openById(DEST_SPREADSHEET_ID);
  const destSheet = destSs.getSheetByName(DEST_SHEET_NAME);
  if (!destSheet) return;

  const lastRow = destSheet.getLastRow();
  if (lastRow < 1) return;

  // D列（4列目）を上から最初の一致まで検索
  const dVals = destSheet.getRange(1, 4, lastRow, 1).getValues();
  for (let i = 0; i < dVals.length; i++) {
    if (dVals[i][0] === TARGET_NAME) {
      const targetRow = i + 1; // 1-indexed
      destSheet.getRange(targetRow, 5).setValue('空き'); // E 列

      // 通知
      const cellA1 = `E${targetRow}`;
      const msg = `『${DEST_SHEET_NAME}』の ${cellA1} を「空き」に変更しました。`;
      sendTelegramMessage_(msg);
      break;
    }
  }
}

/** 機能C（新）: 『結果』列で『〇』が入ったら右隣セルの内容を送信 */
function maybeNotifyWhenResultCircle_(sheet, row, col) {
  // 同列ヘッダー(1〜10行)のどこかが『結果』か？
  let isResultColumn = false;
  for (let r = 1; r <= 10; r++) {
    const hdr = sheet.getRange(r, col).getDisplayValue();
    if (hdr === '結果') { isResultColumn = true; break; }
  }
  if (!isResultColumn) return;

  // 値が『〇』か？
  const editedVal = sheet.getRange(row, col).getDisplayValue();
  if (editedVal !== '〇') return;

  // 右隣セルを取得（存在チェック）
  if (col >= sheet.getMaxColumns()) return;
  const rightCellVal = sheet.getRange(row, col + 1).getDisplayValue().trim();

  // 空なら送らない
  if (!rightCellVal) return;

  // 「セル内容＋予約を取っています」という文章にして送信
  const msg = `${rightCellVal} が予約を取っています`;
  sendTelegramMessage_(msg);
}


/** Telegram 送信（Markdown不要の素朴な送信） */
function sendTelegramMessage_(text) {
  const url = `https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`;
  const params = {
    method: 'post',
    payload: { chat_id: CHAT_ID, text },
    muteHttpExceptions: true,
  };
  const res = UrlFetchApp.fetch(url, params);
  if (res.getResponseCode() !== 200) {
    console.error('Telegram API error:', res.getResponseCode(), res.getContentText());
  }
}

/**
 * 初回にこれを手動実行 -> 承認 -> インストール型 onEdit に紐付け
 */
function createInstallableOnEditTrigger_onEditMain() {
  const name = 'onEdit_Main';
  ScriptApp.getProjectTriggers()
    .filter(t => t.getHandlerFunction() === name)
    .forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger(name).forSpreadsheet(SpreadsheetApp.getActive()).onEdit().create();
}
