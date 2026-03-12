// ================================================================
// 統合スクリプト
//   1. hibiki 相談者対応履歴 → スプレッドシート 備考転記（Vercel経由）
//   2. BigQuery データ取得
// ================================================================
// 【初期設定】
// スクリプトエディタ → プロジェクトの設定 → スクリプトプロパティ に以下を追加:
//   TRIGGER_SECRET : chatwork-trigger-2026
// ================================================================

const VERCEL_URL = 'https://my-dashboard-murex-five.vercel.app';

// ── カスタムメニュー ──────────────────────────────────────────────
function onOpen() {
  const ui = SpreadsheetApp.getUi();

  ui.createMenu('備考転記')
    .addItem('今日分を転記', 'runTransfer')
    .addItem('日付を指定して転記', 'runTransferWithDate')
    .addToUi();

  ui.createMenu('📊 BigQuery')
    .addItem('データ更新', 'fetchBigQueryData')
    .addToUi();
}


// ================================================================
// 備考転記（Vercel API を呼び出す）
// ================================================================

function runTransfer() {
  const today = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy/MM/dd');
  _callTransferApi(today);
}

function runTransferWithDate() {
  const ui = SpreadsheetApp.getUi();
  const res = ui.prompt(
    '日付を入力',
    '形式: 2026/03/12（省略すると今日）',
    ui.ButtonSet.OK_CANCEL
  );
  if (res.getSelectedButton() !== ui.Button.OK) return;

  const input = res.getResponseText().trim();
  const date = input || Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy/MM/dd');
  _callTransferApi(date);
}

function _callTransferApi(date) {
  const ui = SpreadsheetApp.getUi();
  try {
    const props = PropertiesService.getScriptProperties();
    const secret = props.getProperty('TRIGGER_SECRET');

    const res = UrlFetchApp.fetch(VERCEL_URL + '/api/transfer-biko', {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify({ date }),
      headers: { 'x-trigger-secret': secret },
      muteHttpExceptions: true,
    });

    const status = res.getResponseCode();
    const json = JSON.parse(res.getContentText());

    if (status === 200 && json.ok) {
      ui.alert('完了', `${json.count}件の備考を書き込みました（${date}）`, ui.ButtonSet.OK);
    } else {
      ui.alert('エラー', json.error || `status: ${status}`, ui.ButtonSet.OK);
    }
  } catch (e) {
    ui.alert('エラー', e.message, ui.ButtonSet.OK);
  }
}


// ================================================================
// BigQuery データ取得
// ================================================================

function fetchBigQueryData() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const configSheet = ss.getSheetByName('アポ隊ランキング');
  const outputSheet = ss.getSheetByName('データ出力');

  const targetDate = configSheet.getRange('A1').getValue();

  let targetDateValue;
  if (targetDate instanceof Date) {
    const baseDate = new Date('1899-12-30');
    targetDateValue = Math.floor((targetDate - baseDate) / (1000 * 60 * 60 * 24));
  } else if (typeof targetDate === 'number') {
    targetDateValue = targetDate;
  } else {
    throw new Error('target_dateは日付または数値で指定してください');
  }

  const projectId = 'consulting-report';
  const query = `
    SELECT *
    FROM \`consulting-report.consulting_report_alloffices.01C_alloffiices_summary\`
    WHERE
      \`初回通話日\` >= DATE_ADD(DATE '1899-12-30', INTERVAL CAST(${targetDateValue} AS INT64) DAY)
      OR \`初期ヒア日\` >= DATE_ADD(DATE '1899-12-30', INTERVAL CAST(${targetDateValue} AS INT64) DAY)
      OR \`提案アポ日\` >= DATE_ADD(DATE '1899-12-30', INTERVAL CAST(${targetDateValue} AS INT64) DAY)
      OR \`提案日\` >= DATE_ADD(DATE '1899-12-30', INTERVAL CAST(${targetDateValue} AS INT64) DAY)
      OR \`面談予約日\` >= DATE_ADD(DATE '1899-12-30', INTERVAL CAST(${targetDateValue} AS INT64) DAY)
      OR \`面談日\` >= DATE_ADD(DATE '1899-12-30', INTERVAL CAST(${targetDateValue} AS INT64) DAY)
      OR \`書戻り日\` >= DATE_ADD(DATE '1899-12-30', INTERVAL CAST(${targetDateValue} AS INT64) DAY)
      OR \`受任日\` >= DATE_ADD(DATE '1899-12-30', INTERVAL CAST(${targetDateValue} AS INT64) DAY)
  `;

  try {
    const request = { query: query, useLegacySql: false };
    let queryResults = BigQuery.Jobs.query(request, projectId);
    const jobId = queryResults.jobReference.jobId;
    const location = queryResults.jobReference.location;

    let sleepTimeMs = 500;
    while (!queryResults.jobComplete) {
      Utilities.sleep(sleepTimeMs);
      sleepTimeMs = Math.min(sleepTimeMs * 2, 10000);
      queryResults = BigQuery.Jobs.getQueryResults(projectId, jobId, { location: location });
    }

    let rows = queryResults.rows;
    const headers = queryResults.schema.fields.map(field => field.name);

    let pageToken = queryResults.pageToken;
    while (pageToken) {
      const nextResults = BigQuery.Jobs.getQueryResults(projectId, jobId, {
        pageToken: pageToken,
        location: location
      });
      if (nextResults.rows) rows = rows.concat(nextResults.rows);
      pageToken = nextResults.pageToken;
    }

    outputSheet.clear();
    outputSheet.getRange(1, 1, 1, headers.length).setValues([headers]);

    if (rows && rows.length > 0) {
      const data = rows.map(row => row.f.map(cell => cell.v || ''));
      outputSheet.getRange(2, 1, data.length, headers.length).setValues(data);
      configSheet.getRange('B1').setValue('最終更新: ' + Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy/MM/dd HH:mm:ss'));
      Logger.log(`${data.length}行のデータを出力しました`);
    } else {
      Logger.log('データが見つかりませんでした');
      configSheet.getRange('B1').setValue('最終更新: データなし ' + Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy/MM/dd HH:mm:ss'));
    }

  } catch (error) {
    Logger.log('エラー: ' + error.toString());
    configSheet.getRange('B1').setValue('エラー発生: ' + Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy/MM/dd HH:mm:ss'));
    throw error;
  }
}
