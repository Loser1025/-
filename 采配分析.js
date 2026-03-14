/* ======================================================================
 * 采配分析シート：自動生成スクリプト（新システム連携版）
 * * 機能：
 * BigQueryから集計データを取得し、以下のシートを作成します。
 * 1. 「世代」 2. 「滞納」 3. 「LP」 4. 「債務総額」 5. 「職業別」
 * ※新DB移行に伴い「L/シミュ」シートは廃止
 * * * * システム特徴：
 * - シート名形式：【YYYY/MM】シート名
 * - データソース：新システムDB（2026/2〜）
 * - 排他制御：多人数同時実行時のバッティング防止 (LockService)
 * - 動作安定化：データなし時の空シート作成、タイムアウト対策
 * - 軽量化：不要な行・列を削除
 * ====================================================================== */

// --- 1. 定数・設定定義 ---
const PROJECT_ID = 'se-saihai-looker';
// シートIDを動的に取得
const SPREADSHEET_ID = SpreadsheetApp.getActiveSpreadsheet().getId();

// 各シートの設定定義
const CONFIG = {
  GENERATION: {
    type: '世代',
    targets: ['20代', '30代', '40代', '50代', '60代', '70代', '80代'],
    colors: ["#fce5cd", "#fff2cc", "#d9ead3", "#d0e0e3", "#c9daf8", "#ead1dc", "#d9d2e9"],
    getDataFunc: getGenerationData
  },
  DELINQUENCY: {
    type: '滞納',
    header2: ['', 'あり', '', '', '', '', '', 'なし', '', '', '', '', ''],
    colors: ["#f4cccc", "#fce5cd"], 
    labels: ["あり", "なし"],
    getDataFunc: getDelinquencyData
  },
  LP: {
    type: 'LP',
    targets: ['saru', 'sp', 'rent', 'mp', 'seas', 'UPPGO', 'HD'],
    colors: ["#f4cccc", "#fce5cd", "#fff2cc", "#d9ead3", "#d0e0e3", "#c9daf8", "#ead1dc"],
    getDataFunc: (s, e) => getLPData(s, e, ['saru', 'sp', 'rent', 'mp', 'seas', 'UPPGO', 'HD'])
  },
  DEBT: {
    type: '債務総額',
    targets: ['0～49万円', '50万～99万円', '100万～149万円', '150万～199万円', '200万円～249万円', '250万円～'],
    colors: ["#f4cccc", "#fce5cd", "#fff2cc", "#d9ead3", "#d0e0e3", "#c9daf8"],
    getDataFunc: (s, e) => getTotalDebtData(s, e, ['0～49万円', '50万～99万円', '100万～149万円', '150万～199万円', '200万円～249万円', '250万円～'])
  },
  OCCUPATION: {
    type: '職業別',
    targets: ['アルバイト・パート', '正社員', '無職', '個人事業主', '派遣社員・契約社員', '専業主婦', '法人', 'その他'],
    colors: ["#f4cccc", "#fce5cd", "#fff2cc", "#d9ead3", "#d0e0e3", "#c9daf8", "#ead1dc", "#d9d2e9"],
    getDataFunc: (s, e) => getOccupationData(s, e, ['アルバイト・パート', '正社員', '無職', '個人事業主', '派遣社員・契約社員', '専業主婦', '法人', 'その他'])
  }
};

// --- 2. メニュー作成 ---
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('⚙️ シート作成・データ更新管理メニュー')
    // 今月分更新
    .addItem('▶ 【最新】世代 作成・更新 (今月分のみ)', 'update_GENERATION')
    .addItem('▶ 【最新】滞納 作成・更新 (今月分のみ)', 'update_DELINQUENCY')
    .addItem('▶ 【最新】LP 作成・更新 (今月分のみ)', 'update_LP')
    .addItem('▶ 【最新】債務 作成・更新 (今月分のみ)', 'update_DEBT')
    .addItem('▶ 【最新】職業 作成・更新 (今月分のみ)', 'update_OCCUPATION')
    .addSeparator()
    // 過去分一括作成（ここを修正：2026/2〜）
    .addItem('▶ 【一括】世代 過去分作成・更新 (2026/2〜)', 'generateBatch_GENERATION')
    .addItem('▶ 【一括】滞納 過去分作成・更新 (2026/2〜)', 'generateBatch_DELINQUENCY')
    .addItem('▶ 【一括】LP 過去分作成・更新 (2026/2〜)', 'generateBatch_LP')
    .addItem('▶ 【一括】債務総額 過去分作成・更新 (2026/2〜)', 'generateBatch_DEBT')
    .addItem('▶ 【一括】職業別 過去分作成・更新 (2026/2〜)', 'generateBatch_OCCUPATION')
    .addToUi();
}

// --- 3. トリガー関数（ラッパー） ---
function update_GENERATION() { updateSheetWrapper(CONFIG.GENERATION); }
function update_DELINQUENCY() { updateSheetWrapper(CONFIG.DELINQUENCY); }
function update_LP() { updateSheetWrapper(CONFIG.LP); }
function update_DEBT() { updateSheetWrapper(CONFIG.DEBT); }
function update_OCCUPATION() { updateSheetWrapper(CONFIG.OCCUPATION); }

function generateBatch_GENERATION() { generateHistoryBatch(CONFIG.GENERATION); }
function generateBatch_DELINQUENCY() { generateHistoryBatch(CONFIG.DELINQUENCY); }
function generateBatch_LP() { generateHistoryBatch(CONFIG.LP); }
function generateBatch_DEBT() { generateHistoryBatch(CONFIG.DEBT); }
function generateBatch_OCCUPATION() { generateHistoryBatch(CONFIG.OCCUPATION); }


// --- 4. 共通処理ロジック ---

// 最新月更新の共通処理
function updateSheetWrapper(config) {
  const today = new Date();
  processSheetCommon(today.getFullYear(), today.getMonth() + 1, config);
  SpreadsheetApp.getActiveSpreadsheet().toast(`今月分の${config.type}更新が完了しました`, '完了');
}

// 一括更新の共通処理
function generateHistoryBatch(config) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const today = new Date();
  const currentYear = today.getFullYear();
  const currentMonth = today.getMonth() + 1;

  // ▼▼▼ 修正箇所：開始年月を2026年2月に変更 ▼▼▼
  let targetYear = 2026;
  let targetMonth = 2;

  while (true) {
    if (targetYear > currentYear || (targetYear === currentYear && targetMonth > currentMonth)) break;

    const mm = ('0' + targetMonth).slice(-2);
    ss.toast(`${targetYear}年${mm}月分の ${config.type} シートを作成中...`, '進行中');

    processSheetCommon(targetYear, targetMonth, config);

    targetMonth++;
    if (targetMonth > 12) { targetMonth = 1; targetYear++; }
    Utilities.sleep(1000); 
  }
  ss.toast(`${config.type} の一括作成が完了しました`, '全完了');
}

// メイン処理関数
function processSheetCommon(year, month, config) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const mm = ('0' + month).slice(-2);
  const sheetName = `【${year}/${mm}】${config.type}`;
  const dateLabel = `集計対象期間：${year}年${month}月`;
  const {startDateStr, endDateStr} = getPeriodDates(year, month);

  // ヘッダー行の準備
  let headerRow2, headerRow3;
  if (config.targets) {
    // targets配列から動的にヘッダー生成 (世代, LP, 債務, 職業)
    headerRow2 = ['']; 
    headerRow3 = ['']; 
    config.targets.forEach(label => {
      headerRow2.push(label, '', '', '', '', '');
      headerRow3.push('ALL', '', '男性', '', '女性', '');
    });
  } else {
    // 固定ヘッダー使用 (滞納のみ)
    headerRow2 = config.header2;
    headerRow3 = ['', 'ALL', '', '男性', '', '女性', '', 'ALL', '', '男性', '', '女性', ''];
  }

  // シート作成・初期化
  const sheet = getOrCreateSheet(ss, sheetName);
  resetSheet(sheet);
  writeSheetData(sheet, dateLabel, headerRow2, headerRow3, []);

  // データ取得
  const matrixData = config.getDataFunc(startDateStr, endDateStr);

  // データなし時の処理
  if (!matrixData || matrixData.length <= 1) { 
    handleNoData(sheet);
    applyStyles(sheet, 3, headerRow2.length, config);
    adjustSheetSize(sheet, 10, headerRow2.length);
    return; 
  }

  // データ書き込み
  const bodyData = matrixData.slice(1);
  if (bodyData.length > 0) {
    sheet.getRange(4, 1, bodyData.length, bodyData[0].length).setValues(bodyData);
  }

  // デザイン適用
  applyStyles(sheet, bodyData.length + 3, headerRow2.length, config);
}

// デザイン適用分岐
function applyStyles(sheet, lastRow, lastCol, config) {
  if (config.targets) {
    // 繰り返しパターン (世代, LPなど)
    applyMultiColumnStyles(sheet, lastRow, lastCol, config.targets, config.colors);
  } else {
    // 2ブロック固定パターン (滞納)
    applyRichStyles(sheet, lastRow, lastCol, config.labels[0], config.colors[0], config.labels[1], config.colors[1]);
  }
}


/* ======================================================================
 * 5. データ取得・整形関数群 (BigQuery)
 * ====================================================================== */

function getDelinquencyData(startDate, endDate) {
  return fetchAndMapData(startDate, endDate,
    `delinquency_type IN ('あり', 'なし')`,
    ['あり', 'なし'],
    (row) => row[1],
    'delinquency_type'
  );
}

function getGenerationData(startDate, endDate) {
  return fetchAndMapData(startDate, endDate,
    `age_label IN ('20代', '30代', '40代', '50代', '60代', '70代', '80代')`,
    ['20代', '30代', '40代', '50代', '60代', '70代', '80代'],
    (row) => row[1],
    'age_label'
  );
}

function getLPData(startDate, endDate, targetLPs) {
  const inClause = targetLPs.map(lp => `'${lp.toLowerCase()}'`).join(',');
  return fetchAndMapData(startDate, endDate,
    `LOWER(TRIM(lp)) IN (${inClause})`, 
    targetLPs,
    (row) => {
      if (row[1] === null) return null;
      const dbVal = row[1].toString().trim().toLowerCase();
      const match = targetLPs.find(lp => lp.toLowerCase() === dbVal);
      return match || row[1]; 
    },
    'lp'
  );
}

function getTotalDebtData(startDate, endDate, targetDebts) {
  const inClause = targetDebts.map(d => `'${d}'`).join(',');
  return fetchAndMapData(startDate, endDate,
    `total_debt_amount IN (${inClause})`, 
    targetDebts,
    (row) => row[1], 
    'total_debt_amount'
  );
}

function getOccupationData(startDate, endDate, targetOccupations) {
  return fetchAndMapData(startDate, endDate,
    `job_category IS NOT NULL`,
    targetOccupations,
    (row) => {
      const val = row[1];
      if (!val || val === '(未選択)') return null;
      if (val === 'アルバイト・パート' || val === 'アルバイト') return 'アルバイト・パート';
      if (val === '正社員') return '正社員';
      if (val === '無職') return '無職';
      if (val === '自営業（個人事業主）' || val === '個人事業主' || val === '自営') return '個人事業主';
      if (val === '派遣社員' || val === '契約社員') return '派遣社員・契約社員';
      if (val === '専業主婦') return '専業主婦';
      if (val === '自営業（法人経営）' || val === '法人経営' || val === '法人') return '法人';
      return 'その他';
    },
    'job_category'
  );
}

// 汎用データ取得関数
function fetchAndMapData(startDate, endDate, whereClause, targetKeys, keyMapper, groupColumn) {
  
  // ▼▼▼ 修正箇所：新環境用のテーブル名に変更（_dbを付与） ▼▼▼
  // ※BigQuery側で保存したテーブル名と一致させてください
  const tableName = "`" + PROJECT_ID + ".saihai_dashboard.assignment_system_source_db`";

  let sql = `
    SELECT proposer, ${groupColumn}, gender, SUM(result_count), SUM(total_count)
    FROM ${tableName}
    WHERE ${whereClause}
    AND cdr_date BETWEEN '${startDate}' AND '${endDate}'
    AND proposer IS NOT NULL AND proposer != ''
    GROUP BY proposer, ${groupColumn}, gender
  `;
  const rawRows = executeBigQuery(sql);
  if (!rawRows || rawRows.length === 0) return [];

  const dataMap = {};
  const proposers = new Set();
  const grandTotal = {}; 

  rawRows.forEach(row => {
    const p = row[0];
    const t = keyMapper(row);
    if (!t) return; 
    if (!targetKeys.includes(t)) return;

    const g = row[2] || '不明'; 
    const r = Number(row[3]); const c = Number(row[4]);
    
    proposers.add(p);
    
    if (!dataMap[p]) dataMap[p] = {};
    if (!dataMap[p][t]) dataMap[p][t] = {};
    if (!dataMap[p][t][g]) dataMap[p][t][g] = {res: 0, tot: 0};
    dataMap[p][t][g].res += r; dataMap[p][t][g].tot += c;

    if (!grandTotal[t]) grandTotal[t] = {};
    if (!grandTotal[t][g]) grandTotal[t][g] = {res: 0, tot: 0};
    grandTotal[t][g].res += r; grandTotal[t][g].tot += c;
  });
  
  const output = [['header_placeholder']];
  const sortedProposers = Array.from(proposers).sort();
  const targets = targetKeys.map(k => ({key: k}));
  const genders = [{key: 'ALL'}, {key: '男性'}, {key: '女性'}];

  const totalRow = ['合計'];
  targets.forEach(t => {
    let t_res = 0; let t_tot = 0;
    const typeData = grandTotal[t.key] || {};
    Object.keys(typeData).forEach(gKey => { t_res += typeData[gKey].res; t_tot += typeData[gKey].tot; });
    genders.forEach(g => {
      let res = 0; let tot = 0;
      if (g.key === 'ALL') { res = t_res; tot = t_tot; } 
      else if (typeData[g.key]) { res = typeData[g.key].res; tot = typeData[g.key].tot; }
      totalRow.push(`${res}/${tot}`); totalRow.push(tot > 0 ? (res / tot) : 0);
    });
  });
  output.push(totalRow);

  sortedProposers.forEach(p => {
    const row = [p];
    targets.forEach(t => {
      const pData = dataMap[p] || {};
      const typeData = pData[t.key] || {};
      let t_res = 0; let t_tot = 0;
      Object.keys(typeData).forEach(gKey => { t_res += typeData[gKey].res; t_tot += typeData[gKey].tot; });
      genders.forEach(g => {
        let res = 0; let tot = 0;
        if (g.key === 'ALL') { res = t_res; tot = t_tot; } 
        else if (typeData[g.key]) { res = typeData[g.key].res; tot = typeData[g.key].tot; }
        row.push(`${res}/${tot}`); row.push(tot > 0 ? (res / tot) : 0);
      });
    });
    output.push(row);
  });
  return output;
}

/* ======================================================================
 * 6. デザイン・補助関数群
 * ====================================================================== */

function applyRichStyles(sheet, lastRow, lastCol, label1, color1, label2, color2) {
  applyBaseStyles(sheet);
  sheet.getRange("B2:G2").setBackground(color1);
  sheet.getRange(2, 2, 1, 6).merge().setHorizontalAlignment("center").setFontWeight("bold").setValue(label1);
  sheet.getRange("H2:M2").setBackground(color2);
  sheet.getRange(2, 8, 1, 6).merge().setHorizontalAlignment("center").setFontWeight("bold").setValue(label2);
  applyHeaderAndBorders(sheet, lastRow, lastCol);
  adjustSheetSize(sheet, lastRow, lastCol);
}

function applyMultiColumnStyles(sheet, lastRow, lastCol, labels, colors) {
  applyBaseStyles(sheet);
  labels.forEach((label, index) => {
    const startCol = 2 + (index * 6);
    sheet.getRange(2, startCol, 1, 6).merge().setHorizontalAlignment("center").setFontWeight("bold").setValue(label).setBackground(colors[index % colors.length]);
  });
  applyHeaderAndBorders(sheet, lastRow, lastCol);
  for (let c = 2; c < lastCol; c += 6) {
    sheet.getRange(2, c + 5, lastRow - 1, 1).setBorder(null, null, null, true, null, null, "black", SpreadsheetApp.BorderStyle.SOLID_MEDIUM);
  }
  adjustSheetSize(sheet, lastRow, lastCol);
}

function applyBaseStyles(sheet) {
  sheet.getRange("A2:A3").merge().setVerticalAlignment("middle").setHorizontalAlignment("center")
    .setBackground("white").setFontWeight("bold").setValue("氏名");
}

function applyHeaderAndBorders(sheet, lastRow, lastCol) {
  sheet.getRange(3, 2, 1, lastCol - 1).setBackground("white").setFontWeight("bold").setHorizontalAlignment("center").setVerticalAlignment("middle");
  for (let c = 2; c < lastCol; c += 6) {
    sheet.getRange(3, c, 1, 2).merge().setValue("ALL").setFontColor("black");
    sheet.getRange(3, c + 2, 1, 2).merge().setValue("男性").setFontColor("blue");
    sheet.getRange(3, c + 4, 1, 2).merge().setValue("女性").setFontColor("red");
  }

  // データがある場合
  if (lastRow > 3) {
    if (lastRow >= 5) sheet.getRange(5, 1, lastRow - 4, 1).setBackground("#cfe2f3");
    const tableRange = sheet.getRange(2, 1, lastRow - 1, lastCol);
    tableRange.setBorder(true, true, true, true, true, true);
    sheet.getRange(2, 1, lastRow - 1, 1).setBorder(null, null, null, true, null, null, "black", SpreadsheetApp.BorderStyle.SOLID_MEDIUM);
    sheet.getRange(4, 1, 1, lastCol).setFontWeight("bold").setBackground("white").setBorder(null, null, true, null, null, null, "black", SpreadsheetApp.BorderStyle.DOUBLE);
    for (let c = 2; c <= lastCol; c++) {
      const dataRange = sheet.getRange(4, c, lastRow - 3, 1);
      dataRange.setHorizontalAlignment("center");
      if ((c - 2) % 2 !== 0) dataRange.setNumberFormat("0.00%");
    }
    const ranges = [];
    for (let c = 3; c <= lastCol; c += 2) ranges.push(sheet.getRange(4, c, lastRow - 3, 1));
    if (ranges.length > 0) {
      const rule = SpreadsheetApp.newConditionalFormatRule().setGradientMinpoint('#ffffff').setGradientMaxpoint('#4a86e8').setRanges(ranges).build();
      sheet.setConditionalFormatRules([rule]);
    }
    sheet.setColumnWidth(1, 100); 
    if (lastCol >= 2) sheet.setColumnWidths(2, lastCol - 1, 85); 
    if (sheet.getFilter()) sheet.getFilter().remove();
    sheet.getRange(4, 1, lastRow - 3, lastCol).createFilter();
    sheet.setFrozenRows(4); sheet.setFrozenColumns(1);
  } else {
    // データなし時
    sheet.getRange(2, 1, 2, lastCol).setBorder(true, true, true, true, true, true);
    sheet.setColumnWidth(1, 100);
    if (lastCol >= 2) sheet.setColumnWidths(2, lastCol - 1, 85); 
  }
}

function adjustSheetSize(sheet, lastRow, lastCol) {
  const currentMaxRows = sheet.getMaxRows();
  const currentMaxCols = sheet.getMaxColumns();
  const targetRows = Math.max(lastRow + 5, 20);
  const targetCols = Math.max(lastCol + 2, 10);
  if (currentMaxRows > targetRows) sheet.deleteRows(targetRows + 1, currentMaxRows - targetRows);
  if (currentMaxCols > targetCols) sheet.deleteColumns(targetCols + 1, currentMaxCols - targetCols);
}

function getPeriodDates(year, month) {
  const startDateObj = new Date(year, month - 1, 1);
  const endDateObj   = new Date(year, month, 0);
  return { startDateStr: formatDate(startDateObj), endDateStr: formatDate(endDateObj) };
}

function formatDate(dt) {
  const y = dt.getFullYear(); const m = ('00' + (dt.getMonth()+1)).slice(-2); const d = ('00' + dt.getDate()).slice(-2);
  return `${y}-${m}-${d}`;
}

function executeBigQuery(sql) {
  const lock = LockService.getScriptLock();
  if (lock.tryLock(30000)) { 
    try {
      const request = { query: sql, useLegacySql: false, location: 'asia-northeast1' };
      let finalResults = BigQuery.Jobs.query(request, PROJECT_ID);
      const jobId = finalResults.jobReference.jobId;
      let sleepTimeMs = 500;
      while (!finalResults.jobComplete) {
        Utilities.sleep(sleepTimeMs);
        finalResults = BigQuery.Jobs.getQueryResults(PROJECT_ID, jobId, { location: 'asia-northeast1' });
        if (sleepTimeMs < 5000) sleepTimeMs *= 2;
      }
      return finalResults.rows ? finalResults.rows.map(row => row.f.map(cell => cell.v)) : [];
    } catch (e) { 
      console.error('BigQueryエラー:', e); 
      throw e; 
    } finally { 
      lock.releaseLock(); 
    }
  } else {
    const msg = '⚠️ 他のユーザーが更新処理中のため実行できませんでした。しばらく待ってから再度実行してください。';
    SpreadsheetApp.getActiveSpreadsheet().toast(msg, '同時実行エラー', 10);
    throw new Error(msg);
  }
}

function getOrCreateSheet(ss, sheetName) {
  let sheet = ss.getSheetByName(sheetName);
  if (!sheet) sheet = ss.insertSheet(sheetName, 0);
  return sheet;
}

function resetSheet(sheet) {
  if (sheet.getFilter()) sheet.getFilter().remove();
  sheet.clearConditionalFormatRules();
  sheet.clear();
  sheet.clearFormats();
}

function writeSheetData(sheet, dateLabel, h2, h3, body) {
  sheet.getRange("A1").setValue(dateLabel).setFontWeight("bold").setHorizontalAlignment("left").setWrap(true);
  sheet.getRange(2, 1, 1, h2.length).setValues([h2]);
  sheet.getRange(3, 1, 1, h3.length).setValues([h3]);
  if (body.length > 0) sheet.getRange(4, 1, body.length, body[0].length).setValues(body);
}

function handleNoData(sheet) {
  sheet.getRange("A4").setValue("※ 集計期間内の対象データがありません")
       .setFontColor("red").setFontWeight("bold");
}