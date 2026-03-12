import { google } from 'googleapis';

export const maxDuration = 60;

const HIBIKI_BASE = 'https://hibiki.leaduplus.pro';
const SPREADSHEET_ID = '1qw_aL8B9aJ_7Ad58qNxjNexTT20UOKU4LuUsjf3c6eQ';
const SHEET_NAME = '流入ごと';
const ROW_START = 36;
const ROW_END = 100;

const BROWSER_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'ja,en-US;q=0.7,en;q=0.3',
};

// ── エントリポイント ────────────────────────────────────────────
export async function POST(request) {
  const secret = request.headers.get('x-trigger-secret');
  if (secret !== process.env.TRIGGER_SECRET) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const today = new Date().toLocaleDateString('ja-JP', {
    timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit'
  }).replace(/\//g, '/');
  const date = body.date || today;

  try {
    // 1. ログイン
    const cookie = await hibikiLogin(
      process.env.HIBIKI_LOGIN_ID,
      process.env.HIBIKI_LOGIN_PW,
    );

    // 2. CSVダウンロード
    const csvText = await downloadCsv(cookie, date, date);

    // 3. パース
    const rows = parseCsv(csvText);
    if (rows.length < 2) {
      return Response.json({ ok: true, count: 0, message: 'データなし' });
    }

    const headers = rows[0];
    const csvData = {};
    for (let i = 1; i < rows.length; i++) {
      const cspId = String(rows[i][0] || '').trim();
      if (cspId) csvData[cspId] = rows[i];
    }

    // 4. スプレッドシートに書き込み
    const count = await writeToSheet(headers, csvData);

    return Response.json({ ok: true, count, date });

  } catch (e) {
    console.error(e);
    return Response.json({ error: e.message }, { status: 500 });
  }
}

// ── hibikiログイン ────────────────────────────────────────────────
async function hibikiLogin(loginId, loginPw) {
  // ① ログインページをGETしてCSRFトークン取得
  const pageRes = await fetch(HIBIKI_BASE + '/debt/login', {
    headers: BROWSER_HEADERS,
  });
  const pageHtml = await pageRes.text();
  const tokenMatch = pageHtml.match(/name="_token"\s+value="([^"]+)"/);
  if (!tokenMatch) throw new Error('CSRFトークンの取得に失敗');
  const token = tokenMatch[1];
  const initCookie = extractCookies(pageRes.headers.getSetCookie?.() ?? []);

  // ② POST ログイン
  const params = new URLSearchParams({ '_token': token, 'name': loginId, 'password': loginPw });
  const loginRes = await fetch(HIBIKI_BASE + '/debt/login', {
    method: 'POST',
    headers: {
      ...BROWSER_HEADERS,
      'Cookie': initCookie,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params.toString(),
    redirect: 'manual',
  });

  if (loginRes.status !== 302) throw new Error(`ログイン失敗 (status: ${loginRes.status})`);
  return mergeCookies(initCookie, extractCookies(loginRes.headers.getSetCookie?.() ?? []));
}

// ── CSVダウンロード ──────────────────────────────────────────────
async function downloadCsv(cookie, dateFrom, dateTo) {
  // 検索ページからCSRFトークン取得
  const searchRes = await fetch(HIBIKI_BASE + '/debt/consulter/list/search', {
    headers: { ...BROWSER_HEADERS, 'Cookie': cookie },
  });
  const searchHtml = await searchRes.text();
  const tokenMatch = searchHtml.match(/name="_token"\s+value="([^"]+)"/);
  if (!tokenMatch) throw new Error('検索ページのCSRFトークン取得に失敗');
  const token = tokenMatch[1];
  const updatedCookie = mergeCookies(cookie, extractCookies(searchRes.headers.getSetCookie?.() ?? []));

  const params = new URLSearchParams({
    '_token': token,
    'first_call_date_from': dateFrom,
    'first_call_date_to': dateTo,
    'except_test_inquiry': '1',
    'limit': '500',
    'total_count': '0',
  });

  const csvRes = await fetch(HIBIKI_BASE + '/debt/consulter/list/outputContactHistoryCsv', {
    method: 'POST',
    headers: {
      ...BROWSER_HEADERS,
      'Cookie': updatedCookie,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params.toString(),
  });

  if (!csvRes.ok) throw new Error(`CSVダウンロード失敗 (status: ${csvRes.status})`);
  return csvRes.text();
}

// ── Cookie ───────────────────────────────────────────────────────
function extractCookies(setCookieArray) {
  return setCookieArray.map(c => c.split(';')[0]).filter(Boolean).join('; ');
}

function mergeCookies(base, incoming) {
  if (!incoming) return base;
  const map = {};
  (base + '; ' + incoming).split(';').forEach(part => {
    const idx = part.indexOf('=');
    if (idx > 0) {
      const k = part.slice(0, idx).trim();
      const v = part.slice(idx + 1).trim();
      if (k) map[k] = v;
    }
  });
  return Object.entries(map).map(([k, v]) => `${k}=${v}`).join('; ');
}

// ── CSVパーサー（改行・クォート対応）───────────────────────────
function parseCsv(text) {
  const rows = [];
  let row = [], field = '', inQuote = false, i = 0;
  if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);

  while (i < text.length) {
    const ch = text[i], next = text[i + 1];
    if (inQuote) {
      if (ch === '"' && next === '"') { field += '"'; i += 2; }
      else if (ch === '"') { inQuote = false; i++; }
      else { field += ch; i++; }
    } else {
      if (ch === '"') { inQuote = true; i++; }
      else if (ch === ',') { row.push(field); field = ''; i++; }
      else if (ch === '\r' && next === '\n') { row.push(field); rows.push(row); row = []; field = ''; i += 2; }
      else if (ch === '\n' || ch === '\r') { row.push(field); rows.push(row); row = []; field = ''; i++; }
      else { field += ch; i++; }
    }
  }
  if (row.length > 0 || field) { row.push(field); rows.push(row); }
  return rows.filter(r => r.some(c => c.trim() !== ''));
}

// ── スプレッドシートへの書き込み ────────────────────────────────
async function writeToSheet(headers, csvData) {
  const auth = new google.auth.GoogleAuth({
    credentials: {
      client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    },
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  const sheets = google.sheets({ version: 'v4', auth });

  // ヘッダーから対応者N・備考Nのインデックスを収集
  const tantoMap = {}, bikoMap = {};
  headers.forEach((h, i) => {
    const tm = h.match(/^対応者(\d+)$/);
    const bm = h.match(/^備考(\d+)$/);
    if (tm) tantoMap[parseInt(tm[1])] = i;
    if (bm) bikoMap[parseInt(bm[1])] = i;
  });
  const maxN = Math.max(...Object.keys(bikoMap).map(Number));

  // シートのA36:G100を取得
  const range = `'${SHEET_NAME}'!A${ROW_START}:G${ROW_END}`;
  const getRes = await sheets.spreadsheets.values.get({ spreadsheetId: SPREADSHEET_ID, range });
  const sheetRows = getRes.data.values || [];

  const updates = [];
  sheetRows.forEach((row, i) => {
    const cspId = String(row[0] ?? '').trim();
    const tantoName = String(row[4] ?? '').trim();
    if (!cspId || !/^\d+$/.test(cspId) || !csvData[cspId]) return;

    const biko = getLatestBiko(csvData[cspId], bikoMap, tantoMap, maxN, tantoName);
    if (biko) {
      updates.push({
        range: `'${SHEET_NAME}'!G${ROW_START + i}`,
        values: [[biko]],
      });
    }
  });

  if (updates.length > 0) {
    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId: SPREADSHEET_ID,
      requestBody: { valueInputOption: 'RAW', data: updates },
    });
  }

  return updates.length;
}

// ── 最新備考を取得 ──────────────────────────────────────────────
function getLatestBiko(csvRow, bikoMap, tantoMap, maxN, tantoName) {
  for (let n = maxN; n >= 1; n--) {
    const bi = bikoMap[n], ti = tantoMap[n];
    if (bi === undefined || bi >= csvRow.length) continue;
    const biko = (csvRow[bi] || '').trim();
    if (!biko) continue;
    if (ti !== undefined && ti < csvRow.length && (csvRow[ti] || '').trim() === tantoName) return biko;
  }
  for (let n = maxN; n >= 1; n--) {
    const bi = bikoMap[n];
    if (bi === undefined || bi >= csvRow.length) continue;
    const biko = (csvRow[bi] || '').trim();
    if (biko) return biko;
  }
  return '';
}
