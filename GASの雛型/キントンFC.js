/**
 * Kintoneアプリのフィールドコード一覧を取得し、スプレッドシートに出力する（Basic認証版）
 */
function writeFieldCodesToSheet() {
  // ▼▼▼ あなたの環境に合わせて設定してください ▼▼▼
  const appId = 170; // 対象のアプリID
  const domain = 'https://intershift.cybozu.com';
  
  // ✅ 認証情報をID/パスワードに変更
  const login = "廣田珠輝";
  const password = "akaisuisei1025";
  const token = Utilities.base64Encode(login + ":" + password, Utilities.Charset.UTF_8);
  // ▲▲▲ 設定はここまで ▲▲▲

  const url = `${domain}/k/v1/app/form/fields.json?app=${appId}`;

  const headers = {
    "X-Cybozu-Authorization": token
  };

  try {
    const res = UrlFetchApp.fetch(url, {
      method: "get",
      headers: headers
    });

    const json = JSON.parse(res.getContentText());
    const fields = json.properties;

    // --- スプレッドシートへの書き出し処理 ---
    
    const sheetName = "フィールドコード一覧";
    const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    let sheet = spreadsheet.getSheetByName(sheetName);

    // もしシートが存在しなければ、新しく作成する
    if (!sheet) {
      sheet = spreadsheet.insertSheet(sheetName);
    }

    // 書き出すための二次元配列を準備
    const outputData = [];
    // ヘッダー行を追加
    outputData.push(['フィールド名', 'フィールドコード', 'タイプ']);

    // オブジェクトのキー（フィールドコード）をループして情報を取得
    for (const fieldCode in fields) {
      const field = fields[fieldCode];
      const fieldLabel = field.label; // フィールド名（ラベル）
      const fieldType = field.type;   // フィールドタイプ
      outputData.push([fieldLabel, fieldCode, fieldType]);
    }
    
    // シートをクリアして、データを一括で書き込む
    if (outputData.length > 1) { // データが1行以上（ヘッダー以外）ある場合のみ実行
      sheet.clear();
      sheet.getRange(1, 1, outputData.length, outputData[0].length).setValues(outputData);
      Logger.log(`成功: フィールド一覧を「${sheetName}」シートに出力しました。`);
    } else {
      Logger.log("情報: 取得できるフィールドがありませんでした。");
    }

  } catch (e) {
    Logger.log("エラーが発生しました: " + e.toString());
    // エラー内容をスプレッドシートにも書き出す
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("フィールドコード一覧") || SpreadsheetApp.getActiveSpreadsheet().insertSheet("フィールドコード一覧");
    sheet.clear();
    sheet.getRange("A1").setValue("エラーが発生しました。");
    sheet.getRange("A2").setValue(e.toString());
  }
}