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

    // 1. 個人別データの取得 (A:L)
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: '個人別!A1:L200',
    });

    // 2. ユニット目標の取得 (AJ15:AK23)
    const targetResponse = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: '個人別!AJ15:AK30',
    });

    const rows = response.data.values || [];
    const targetRows = targetResponse.data.values || [];

    if (rows.length < 5) return NextResponse.json({ error: "Data not found" }, { status: 404 });

    // ユニット目標のマッピング
    const unitTargets = {};
    targetRows.forEach(row => {
      const uName = row[0]?.toString().trim();
      const uTarget = row[1]?.toString().replace(/,/g, '');
      if (uName && uTarget && !isNaN(parseInt(uTarget))) {
        unitTargets[uName] = parseInt(uTarget);
      }
    });

    // 個人別データの解析
    let nameCol = 2;
    let countCol = 10;
    let unitCol = 1;
    let headerRowIndex = 3; 

    for (let i = 0; i < Math.min(rows.length, 10); i++) {
      const row = rows[i];
      if (row.includes('Men') && (row.includes('受任数') || row.includes('受任日'))) {
        nameCol = row.indexOf('Men');
        countCol = row.indexOf('受任数') !== -1 ? row.indexOf('受任数') : row.indexOf('受任日');
        unitCol = row.indexOf('UnitMen') !== -1 ? row.indexOf('UnitMen') : 1;
        headerRowIndex = i;
        break;
      }
    }

    const dataRows = rows.slice(headerRowIndex + 1).filter(row => {
      const name = row[nameCol]?.toString().trim();
      return name && name !== 'Men' && !name.includes('合計') && !name.includes('TOTAL');
    });

    const players = dataRows.map(row => {
      const name = row[nameCol]?.toString().trim();
      const countStr = row[countCol]?.toString().replace(/,/g, '') || "0";
      const count = parseInt(countStr) || 0;
      const unit = row[unitCol]?.toString().trim() || "無所属";
      return { name, count, unit };
    });

    // 全体指標の取得
    const fullResponse = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: '個人別!A1:AZ50',
    });
    const fullRows = fullResponse.data.values || [];

    let totalCount = 0;
    let totalTarget = 1950;
    let inquiryCount = "0";

    fullRows.forEach((row) => {
      row.forEach((cell, colIndex) => {
        const text = cell?.toString().trim();
        if (text && (text.includes('受任数') && text.includes('ALL'))) {
          totalCount = parseInt(row[colIndex + 1]?.toString().replace(/,/g, '') || "0");
        }
        if (text === '現在\n必要数' || text === '目標' || text === '全体目標') {
          const val = parseInt(row[colIndex + 1]?.toString().replace(/,/g, '') || "0");
          if (val > 100) totalTarget = val;
        }
        if (text && text.includes('反響')) {
          const match = text.match(/\d+/);
          if (match) inquiryCount = match[0];
          else if (row[colIndex + 1]) {
             const nextMatch = row[colIndex + 1].toString().match(/\d+/);
             if (nextMatch) inquiryCount = nextMatch[0];
          }
        }
      });
    });

    // ユニット別集計（目標表に存在するユニットのみを対象にする）
    const unitMap = {};
    
    // まず目標表にあるユニットで初期化
    Object.keys(unitTargets).forEach(uName => {
      unitMap[uName] = { 
        name: uName, 
        actual: 0, 
        target: unitTargets[uName] 
      };
    });

    // プレイヤーの実績を加算（目標表にあるユニットのみ加算される）
    players.forEach(p => {
      if (unitMap[p.unit]) {
        unitMap[p.unit].actual += p.count;
      }
    });

    // units 配列を生成
    const units = Object.values(unitMap).sort((a, b) => b.actual - a.actual);

    if (totalCount === 0) totalCount = players.reduce((sum, p) => sum + p.count, 0);

    const result = {
      totalCount,
      totalTarget,
      inquiryCount,
      ranking: [...players].sort((a, b) => b.count - a.count).slice(0, 10),
      allPlayers: [...players].sort((a, b) => b.count - a.count),
      units,
    };

    return NextResponse.json(result);
  } catch (error) {
    console.error('Sheets API Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
