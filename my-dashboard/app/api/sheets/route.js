import { google } from 'googleapis';
import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const auth = new google.auth.GoogleAuth({
      credentials: {
        client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
        private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      },
      scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
    });

    const sheets = google.sheets({ version: 'v4', auth });
    const spreadsheetId = process.env.SPREADSHEET_ID;

    // 「個人別」シートの広範囲を取得
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: '個人別!A:AZ',
    });

    const rows = response.data.values || [];
    if (rows.length < 5) return NextResponse.json({ error: "Data not found" }, { status: 404 });

    // 5行目以降のデータ行を抽出 (A列に名前がある行)
    const dataRows = rows.slice(4).filter(row => row[0] && row[0] !== 'Men' && row[0] !== 'UnitMen');

    // 個人の数値をパース
    const players = dataRows.map(row => ({
      name: row[0],
      count: parseInt(row[8] || "0"), // I列: 受任数
      unit: row[11] || "無所属"       // L列: UnitMen (Team)
    }));

    // 全体集計値と反響数の取得
    let totalCount = 0;
    let totalTarget = 1950;
    let inquiryCount = "0";
    const unitTargets = {};

    rows.forEach((row, rowIndex) => {
      row.forEach((cell, colIndex) => {
        const text = cell?.toString().trim();
        if (text === '受任数\nALL' || text === '受任数 ALL') {
          totalCount = parseInt(row[colIndex + 1] || "0");
        }
        if (text === '現在\n必要数') {
          totalTarget = parseInt(row[colIndex + 1] || "1950");
        }
        // 「反響」という文字を含むセルを探し、その中から数字を抽出する
        if (text && text.includes('反響')) {
          const match = text.match(/\d+/);
          if (match) {
            inquiryCount = match[0];
          } else {
            // セル自体に数字がない場合は隣のセルを確認
            const nextCell = row[colIndex + 1]?.toString() || "";
            const nextMatch = nextCell.match(/\d+/);
            if (nextMatch) inquiryCount = nextMatch[0];
          }
        }
        // 「ユニット名 目標」という形式のセルを探す (例: "東日本 目標")
        if (text && text.includes('目標') && !text.includes('全体')) {
          const unitName = text.replace('目標', '').trim();
          if (unitName) {
            unitTargets[unitName] = parseInt(row[colIndex + 1] || "500");
          }
        }
      });
    });

    // ユニット別集計
    const unitMap = {};
    players.forEach(p => {
      if (!unitMap[p.unit]) {
        unitMap[p.unit] = { 
          name: p.unit, 
          actual: 0, 
          target: unitTargets[p.unit] || 500 
        };
      }
      unitMap[p.unit].actual += p.count;
    });
    const units = Object.values(unitMap).sort((a, b) => b.actual - a.actual);

    // もし特定セルから取れなかった場合のフォールバック
    if (totalCount === 0) totalCount = players.reduce((sum, p) => sum + p.count, 0);

    const result = {
      totalCount,
      totalTarget,
      inquiryCount,
      ranking: [...players].sort((a, b) => b.count - a.count).slice(0, 10),
      units,
    };

    return NextResponse.json(result);
  } catch (error) {
    console.error('Sheets API Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
