// ===== 設定 =====
const CONFIG = {
  projectId: 'consulting-report',
  datasetId: 'consulting_report_alloffices',
  viewId: '01C_alloffiices_summaryA',
  sheetName: 'BQ_同期データ', // 書き込み先シート名
};

// ===== メイン同期関数（手動・トリガー共用）=====
function syncBigQueryData() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(CONFIG.sheetName);

  // シートがなければ作成
  if (!sheet) {
    sheet = ss.insertSheet(CONFIG.sheetName);
  }

  try {
    const data = fetchBigQueryData();

    if (!data || data.length === 0) {
      Logger.log('データが0件でした。');
      updateStatusCell(sheet, 'データ0件 - ' + formatNow());
      return;
    }

    writeToSheet(sheet, data);
    updateStatusCell(sheet, '最終同期: ' + formatNow() + '  (' + (data.length - 1) + '行)');
    Logger.log('同期完了: ' + (data.length - 1) + '行');

  } catch (e) {
    Logger.log('エラー: ' + e.message);
    updateStatusCell(sheet, 'エラー: ' + e.message + ' - ' + formatNow());
    throw e;
  }
}

// ===== BigQueryからデータ取得 =====
function fetchBigQueryData() {
  // load_timestamp が100日以内のデータのみ取得（コスト削減）
  const query = 'SELECT * FROM `' + CONFIG.projectId + '.' + CONFIG.datasetId + '.' + CONFIG.viewId + '`'
    + ' WHERE load_timestamp >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 100 DAY)';

  // Jobs.insert を使う方が安定（Jobs.query は30秒タイムアウト制限あり）
  const jobConfig = {
    configuration: {
      query: {
        query: query,
        useLegacySql: false,
      },
    },
  };

  let job = BigQuery.Jobs.insert(jobConfig, CONFIG.projectId);
  const jobId = job.jobReference.jobId;
  const location = job.jobReference.location; // リージョンを取得（必須）

  // ジョブ完了を待機
  let status = job.status.state;
  let attempts = 0;
  while (status !== 'DONE' && attempts < 60) {
    Utilities.sleep(2000);
    job = BigQuery.Jobs.get(CONFIG.projectId, jobId, { location: location });
    status = job.status.state;
    attempts++;
  }

  if (status !== 'DONE') {
    throw new Error('BigQueryジョブがタイムアウトしました。');
  }

  // エラーチェック
  if (job.status.errorResult) {
    throw new Error('BigQueryエラー: ' + job.status.errorResult.message);
  }

  // ページネーション対応（大量データ）
  let results = BigQuery.Jobs.getQueryResults(CONFIG.projectId, jobId, { maxResults: 10000, location: location });
  let rows = results.rows || [];

  while (results.pageToken) {
    results = BigQuery.Jobs.getQueryResults(CONFIG.projectId, jobId, {
      pageToken: results.pageToken,
      maxResults: 10000,
      location: location,
    });
    rows = rows.concat(results.rows || []);
  }

  if (!results.schema || rows.length === 0) return [];

  // ヘッダー行
  const headers = results.schema.fields.map(function(f) { return f.name; });

  // データ行変換
  const dataRows = rows.map(function(row) {
    return row.f.map(function(cell) { return cell.v === null ? '' : cell.v; });
  });

  return [headers].concat(dataRows);
}

// ===== スプレッドシートへの書き込み =====
function writeToSheet(sheet, data) {
  sheet.clearContents();

  const numRows = data.length;
  const numCols = data[0].length;

  sheet.getRange(1, 1, numRows, numCols).setValues(data);

  // ヘッダー行を装飾
  const headerRange = sheet.getRange(1, 1, 1, numCols);
  headerRange.setBackground('#4A90D9');
  headerRange.setFontColor('#FFFFFF');
  headerRange.setFontWeight('bold');

  // 列幅を自動調整
  sheet.autoResizeColumns(1, numCols);

  // フィルター設定
  sheet.getRange(1, 1, numRows, numCols).createFilter();
}

// ===== ステータスセルの更新 =====
function updateStatusCell(sheet, message) {
  // シートの最終行+2にステータスを記録
  const lastRow = sheet.getLastRow();
  const statusRow = lastRow + 2;
  const cell = sheet.getRange(statusRow, 1);
  cell.setValue(message);
  cell.setFontColor('#888888');
  cell.setFontStyle('italic');
}

// ===== 15分ごとのトリガーを設定 =====
function setupTrigger() {
  // 既存の同名トリガーを削除
  deleteTrigger('syncBigQueryData');

  ScriptApp.newTrigger('syncBigQueryData')
    .timeBased()
    .everyMinutes(15)
    .create();

  Logger.log('15分ごとのトリガーを設定しました。');
  SpreadsheetApp.getUi().alert('トリガーを設定しました。\n15分ごとに自動同期されます。');
}

// ===== トリガーを削除 =====
function deleteTrigger(functionName) {
  ScriptApp.getProjectTriggers()
    .filter(function(t) { return t.getHandlerFunction() === functionName; })
    .forEach(function(t) { ScriptApp.deleteTrigger(t); });
}

// ===== トリガーを解除 =====
function removeTrigger() {
  deleteTrigger('syncBigQueryData');
  Logger.log('トリガーを解除しました。');
  SpreadsheetApp.getUi().alert('自動同期のトリガーを解除しました。');
}

// ===== メニューをスプレッドシートに追加 =====
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('BigQuery同期')
    .addItem('今すぐ同期', 'syncBigQueryData')
    .addSeparator()
    .addItem('自動同期を開始（15分ごと）', 'setupTrigger')
    .addItem('自動同期を停止', 'removeTrigger')
    .addToUi();
}

// ===== ユーティリティ =====
function formatNow() {
  return Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy/MM/dd HH:mm:ss');
}
