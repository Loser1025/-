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

    // 最新の構造に合わせて範囲を取得 (A:L)
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: '個人別!A1:L200',
    });

    const rows = response.data.values || [];
    if (rows.length < 5) return NextResponse.json({ error: "Data not found" }, { status: 404 });

    // 最新の分析結果に基づく列インデックス
    // 1: UnitMen, 2: Men, 10: 受任日(受任数)
    let nameCol = 2;
    let countCol = 10;
    let unitCol = 1;
    let headerRowIndex = 3; 

    // ヘッダー行を動的に再確認（Menと受任日/受任数がある行を探す）
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

    // データ行の抽出
    const dataRows = rows.slice(headerRowIndex + 1).filter(row => {
      const name = row[nameCol]?.toString().trim();
      return name && name !== 'Men' && !name.includes('合計') && !name.includes('TOTAL') && name !== "";
    });

    // 個人の数値をパース
    const players = dataRows.map(row => {
      const name = row[nameCol]?.toString().trim();
      const countStr = row[countCol]?.toString().replace(/,/g, '') || "0";
      const count = parseInt(countStr) || 0;
      const unit = row[unitCol]?.toString().trim() || "無所属";
      return { name, count, unit };
    });

    // 別範囲（M列以降や上部）にある全体合計や目標値を取得
    const fullResponse = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: '個人別!A1:AZ50',
    });
    const fullRows = fullResponse.data.values || [];

    let totalCount = 0;
    let totalTarget = 1950;
    let inquiryCount = "0";
    const unitTargets = {};

    fullRows.forEach((row) => {
      row.forEach((cell, colIndex) => {
        const text = cell?.toString().trim();
        // 全体受任数
        if (text && (text.includes('受任数') && text.includes('ALL'))) {
          totalCount = parseInt(row[colIndex + 1]?.toString().replace(/,/g, '') || "0");
        }
        // 全体目標
        if (text === '現在\n必要数' || text === '目標' || text === '目標受任数') {
          const val = parseInt(row[colIndex + 1]?.toString().replace(/,/g, '') || "0");
          if (val > 100) totalTarget = val;
        }
        // 反響数
        if (text && text.includes('反響')) {
          const match = text.match(/\d+/);
          if (match) inquiryCount = match[0];
          else if (row[colIndex + 1]) {
             const nextMatch = row[colIndex + 1].toString().match(/\d+/);
             if (nextMatch) inquiryCount = nextMatch[0];
          }
        }
        // ユニット別目標（"ユニット名 目標" というセルを探す）
        if (text && text.includes('目標') && !text.includes('全体')) {
          const unitName = text.replace('目標', '').trim();
          if (unitName && row[colIndex + 1]) {
            unitTargets[unitName] = parseInt(row[colIndex + 1]?.toString().replace(/,/g, '') || "500");
          }
        }
      });
    });

    // ユニット別集計
    const unitMap = {};
    players.forEach(p => {
      const unitName = p.unit;
      if (!unitMap[unitName]) {
        unitMap[unitName] = { 
          name: unitName, 
          actual: 0, 
          target: unitTargets[unitName] || 500 
        };
      }
      unitMap[unitName].actual += p.count;
    });
    const units = Object.values(unitMap).sort((a, b) => b.actual - a.actual);

    // フォールバック
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
