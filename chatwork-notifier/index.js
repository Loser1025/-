const { google } = require('googleapis');
const { chromium } = require('playwright');

const SPREADSHEET_ID = '1g0RjsqSkSRmBzdLyjhNzhV9oE1AHRe2GBf2RAURLkxY';
const RANGE = '行動量!AG2:AX61';
const CHATWORK_ROOM_ID = '424170453';

async function getSheetData() {
  const auth = new google.auth.GoogleAuth({
    credentials: {
      client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    },
    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
  });

  const sheets = google.sheets({ version: 'v4', auth });
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: RANGE,
  });
  return response.data.values || [];
}

function pad(str, len, right = false) {
  const s = String(str ?? '');
  if (right) return s.padEnd(len);
  return s.padStart(len);
}

function buildTeamSection(teamName, rows, nameCol, dataCols, colLabels) {
  const validRows = rows.filter(row => (row[nameCol] ?? '').toString().trim() !== '');
  if (validRows.length === 0) return `■ ${teamName}\nデータなし`;

  const header = `■ ${teamName}`;
  const divider = '─'.repeat(40);
  const colHead = pad('名前', 8, true) + ' ' + colLabels.map(l => pad(l, 5)).join(' ');

  const lines = validRows.map(row => {
    const name = pad((row[nameCol] ?? '').toString().trim(), 8, true);
    const vals = dataCols.map(c => pad((row[c] ?? '0').toString().trim(), 5));
    return name + ' ' + vals.join(' ');
  });

  const totals = dataCols.map(c => {
    const sum = validRows.reduce((acc, row) => acc + (parseInt(row[c]) || 0), 0);
    return pad(sum, 5);
  });
  const totalLine = pad('【合計】', 8, true) + ' ' + totals.join(' ');

  return [header, divider, colHead, ...lines, divider, totalLine].join('\n');
}

function formatMessage(rows) {
  if (rows.length < 3) return null;

  // rows[0] = チーム名行, rows[1] = 列ヘッダー行, rows[2:] = データ
  const leftTeamName  = (rows[0][0]  ?? '弁護団アポ隊').toString().trim()  || '弁護団アポ隊';
  const rightTeamName = (rows[0][9]  ?? '弁護団提案者').toString().trim() || '弁護団提案者';

  const dataRows = rows.slice(2);

  // 左チーム: cols 0-8  (所属=0, 名前=1, 内線=2, コール=3, 対応=4, アポ=5, 提案=6, 予約=7, KDR=8)
  // 右チーム: cols 9-17 (所属=9, 名前=10, 内線=11, コール=12, 対応=13, アポ=14, 提案=15, 予約=16, KDR=17)
  const leftSection  = buildTeamSection(leftTeamName,  dataRows, 1,  [3, 4, 5, 6, 7, 8],  ['コール', '対応', 'アポ', '提案', '予約', 'KDR']);
  const rightSection = buildTeamSection(rightTeamName, dataRows, 10, [12,13,14,15,16,17], ['コール', '対応', 'アポ', '提案', '予約', 'KDR']);

  const now = new Date();
  // JST変換 (UTC+9)
  const jst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const dateStr = `${jst.getUTCMonth() + 1}/${jst.getUTCDate()} ${String(jst.getUTCHours()).padStart(2,'0')}:00`;

  return `[info][title]📊 行動量レポート ${dateStr}[/title]\n${leftSection}\n\n${rightSection}\n[/info]`;
}

async function sendToChatwork(message) {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    console.log('Chatworkにログイン中...');
    await page.goto('https://kcw.kddi.ne.jp/', { waitUntil: 'domcontentloaded' });

    // Step1: メールアドレス入力 (Auth0 ULP: #username)
    await page.waitForSelector('#username', { timeout: 15000 });
    await page.fill('#username', process.env.CHATWORK_EMAIL);
    await page.click('button[type="submit"]');
    console.log('メール入力完了、パスワード待機中...');

    // Step2: パスワード入力
    await page.waitForSelector('input[type="password"]', { timeout: 15000 });
    await page.fill('input[type="password"]', process.env.CHATWORK_PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForNavigation({ waitUntil: 'networkidle', timeout: 30000 });
    console.log('ログイン完了');

    console.log('ルームに移動中...');
    await page.goto(`https://kcw.kddi.ne.jp/#!rid${CHATWORK_ROOM_ID}`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);

    // メッセージ入力エリア
    const textarea = await page.waitForSelector('#_chatText, [data-testid="message-input"], textarea.chatInput', { timeout: 15000 });
    await textarea.click();
    await textarea.fill(message);

    // 送信 (Ctrl+Enter or Enter)
    await page.keyboard.press('Enter');
    await page.waitForTimeout(2000);

    console.log('送信完了');
  } finally {
    await browser.close();
  }
}

async function main() {
  console.log('=== Chatwork行動量レポート送信 開始 ===');

  const rows = await getSheetData();
  console.log(`スプレッドシートから ${rows.length} 行取得`);

  const message = formatMessage(rows);
  if (!message) {
    console.error('メッセージ生成失敗: データ不足');
    process.exit(1);
  }

  console.log('--- 送信メッセージ ---');
  console.log(message);
  console.log('--------------------');

  await sendToChatwork(message);
  console.log('=== 完了 ===');
}

main().catch(err => {
  console.error('エラー:', err.message);
  process.exit(1);
});
