import React, { useState, useEffect, useMemo, useRef } from "react";
import {
  Phone, CheckCircle2, Clock, MessageSquare, ChevronRight,
  ExternalLink, LogOut, Calendar, AlertCircle,
  Sparkles, Send, X, LogIn
} from "lucide-react";
import accountList from '../アカウント.json';
const ACCOUNT_ID_MAP = Object.fromEntries(accountList.filter(a => a.id).map(a => [a.name, a.id]));
const findAccountId = (accountName) => {
  if (!accountName) return null;
  // 完全一致
  if (ACCOUNT_ID_MAP[accountName]) return ACCOUNT_ID_MAP[accountName];
  const norm = (s) => s.toLowerCase().replace(/\s/g, '').replace(/[／/]/g, '/');
  const n = norm(accountName);
  // 正規化後の完全一致・部分一致
  for (const [name, id] of Object.entries(ACCOUNT_ID_MAP)) {
    const nn = norm(name);
    if (nn === n || nn.includes(n) || n.includes(nn)) return id;
  }
  return null;
};

// --- Configuration ---
// TODO: おばシートのスプレッドシートIDとシート名を設定してください
const CLIENT_ID = "87533023495-hdt3pp8ujq3p60ptgl66nqaesnli802v.apps.googleusercontent.com";
const SS_ID = "1NQU2SGVykYL3n35NgzL78R0fszK0vt5yacNSV151wYI";
const SHEET_NAME = "2026.03 阻止＆処理リスト";

const DEFAULT_RESULT_COL_IDX = 4;

const RESULT_OPTIONS = ["アポ不通", "不在", "解決済み", "通話アポ獲得"];
const TERMINAL_RESULTS = ["解決済み"];
const NA_CONTENT_OPTIONS = ["アポ", "フォロー１", "フォロー２", "フォロー３", "フォロー４", "フォロー５", "フォロー６", "フォロー７", "完了"];
const NA_CONTENT_COLORS = {
  "アポ":     { bg: "bg-[#FFF7ED]", text: "text-[#EA580C]", border: "border-[#FFEDD5]" },
  "フォロー１": { bg: "bg-[#EFF6FF]", text: "text-[#2563EB]", border: "border-[#BFDBFE]" },
  "フォロー２": { bg: "bg-[#F5F3FF]", text: "text-[#7C3AED]", border: "border-[#DDD6FE]" },
  "フォロー３": { bg: "bg-[#ECFDF5]", text: "text-[#059669]", border: "border-[#A7F3D0]" },
  "フォロー４": { bg: "bg-[#FFFBEB]", text: "text-[#D97706]", border: "border-[#FDE68A]" },
  "フォロー５": { bg: "bg-[#F0FDFA]", text: "text-[#0D9488]", border: "border-[#99F6E4]" },
  "フォロー６": { bg: "bg-[#FFF1F2]", text: "text-[#E11D48]", border: "border-[#FECDD3]" },
  "フォロー７": { bg: "bg-[#F8FAFC]", text: "text-[#334155]", border: "border-[#CBD5E1]" },
  "完了":     { bg: "bg-[#F1F5F9]", text: "text-[#64748B]", border: "border-[#E2E8F0]" },
};

const EMPTY_FORM = {
  result: "", note: "", initialResponseDate: "",
  cancelStopDate: "", refundAmount: "", landingAmount: "",
  cancelProcess: false, naContent: "", naCallDate: "", naCallTime: "",
  cancelReason: "", passToProcess: false,
};

// --- Helper Functions ---
const idxToCol = (idx) => {
  let s = '', n = idx + 1;
  while (n > 0) { const r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = Math.floor((n - 1) / 26); }
  return s;
};

// 架電結果セルから NA 情報とログを分離
// フォーマット:
//   [NA:アポ|2026-03-20 14:00]  ← 先頭行（NA管理行）
//   3/10 不在
//   3/12 通話アポ獲得
const parseCallResult = (raw) => {
  if (!raw) return { naContent: null, naDate: null, callLogs: [] };
  const lines = raw.split('\n').map(l => l.trim()).filter(Boolean);
  let naContent = null, naDate = null;
  let logLines = lines;

  const naMatch = lines[0]?.match(/^\[NA:([^|\]]+)(?:\|([^\]]+))?\]$/);
  if (naMatch) {
    naContent = naMatch[1].trim();
    naDate = naMatch[2]?.trim() || null;
    logLines = lines.slice(1);
  }
  return { naContent, naDate, callLogs: logLines.map(l => ({ result: l })) };
};

// col3複合フィールドから名前・LステURL・アカウントを抽出
// フォーマット例:
//   ID：458870 松本 悟
//   https://rakkar.pro/...
//   Lステ：https://manager.linestep.net/...
//   アカウント：AC
const parseRakkarCell = (raw) => {
  if (!raw) return { name: '', lstepUrl: '', account: '' };
  const lines = raw.split('\n').map(l => l.trim()).filter(Boolean);
  let name = '', lstepUrl = '', account = '';
  for (const line of lines) {
    if (!name && (line.startsWith('ID：') || line.startsWith('ID:'))) {
      const m = line.match(/ID[：:]\S+\s+(.+)/);
      if (m) name = m[1].trim();
    } else if (line.match(/^アカウント[：:]/)) {
      account = line.replace(/^アカウント[：:]/, '').trim();
    } else if (line.startsWith('http') || line.match(/^Lステ[：:]/)) {
      const urlM = line.match(/https?:\/\/\S+/);
      if (urlM && !lstepUrl) lstepUrl = urlM[0];
    } else if (!account && name && !line.startsWith('http')) {
      // 名前の次にくる非URLの行をアカウント名として扱う（【Lステアカウント名】形式）
      account = line;
    }
  }
  // name が取れなかった場合、最初の行をそのまま使う
  if (!name && lines.length > 0 && !lines[0].startsWith('http')) name = lines[0];
  return { name, lstepUrl, account };
};

const detectCol = (values, keywords, fallback) => {
  for (let ri = 0; ri <= 2 && ri < values.length; ri++) {
    const row = values[ri];
    const found = row.findIndex(cell => cell && keywords.some(kw => cell.toString().includes(kw)));
    if (found !== -1) return found;
  }
  return fallback;
};

const parseSheetRows = (values, cols) => {
  const result = [];
  for (let i = 2; i < values.length; i++) {
    const row = values[i];
    const get = (idx) => idx >= 0 ? (row[idx] || '').toString().trim() : '';

    const cancelStopDate = get(cols.cancelStopDate);
    const processStartDate = get(cols.processStartDate);
    const passToProcess = get(cols.passToProcess).toUpperCase() === 'TRUE';
    if (cancelStopDate !== '' || processStartDate !== '') continue;

    const { name, lstepUrl, account } = parseRakkarCell(get(cols.rakkar));
    if (!name) continue; // 名前がない行はスキップ

    const callResultRaw = get(cols.result);
    const { naContent, naDate, callLogs } = parseCallResult(callResultRaw);

    // 旧フォーマット（[NA:...]なし）の場合、不在/不通の回数でフォローレベルを推定
    let legacyFollowLevel = null;
    if (!naContent && !naDate && callResultRaw) {
      const absentCount = (callResultRaw.match(/不在|不通/g) || []).length;
      legacyFollowLevel = Math.min(absentCount + 1, 7);
    }

    result.push({
      id: i,
      rowIndex: i + 1,
      date: get(cols.date).slice(0, 10).replace(/\//g, '-'),
      name,
      account,
      product: get(cols.product),
      author: get(cols.author),
      lstepUrl,
      callResultRaw,
      callLogs,
      naContent,
      naDate,
      legacyFollowLevel,
      appoDateVal: get(cols.appoDate),
      firstResponseDate: get(cols.firstResponseDate),
      initialResponseDate: get(cols.initialResponseDate),
      cancelStopDate,
      passToProcess,
      refundAmount: get(cols.refundAmount),
      landingAmount: get(cols.landingAmount),
      cancelReason: get(cols.cancelReason),
      sharedMemo: get(cols.sharedMemo),
    });
  }
  return result;
};

// --- Main App ---
export default function App() {
  const [token, setToken] = useState(() => {
    const t = localStorage.getItem('gtoken');
    const exp = localStorage.getItem('gtoken_expiry');
    if (t && exp && Date.now() < parseInt(exp)) return t;
    localStorage.removeItem('gtoken');
    localStorage.removeItem('gtoken_expiry');
    return null;
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [records, setRecords] = useState([]);
  const lastSubmitRef = useRef(0);
  const [activeTab, setActiveTab] = useState(() => parseInt(localStorage.getItem('oba_tab') || '1'));
  const [dateFrom, setDateFrom] = useState(() => localStorage.getItem('oba_dateFrom') || '');
  const [dateTo, setDateTo] = useState(() => localStorage.getItem('oba_dateTo') || '');
  const [naDateFrom, setNaDateFrom] = useState(() => localStorage.getItem('oba_naDateFrom') || '');
  const [naDateTo, setNaDateTo] = useState(() => localStorage.getItem('oba_naDateTo') || '');
  const [showFilter, setShowFilter] = useState(false);
  const [cols, setCols] = useState({
    date: 0, product: 1, author: 2, rakkar: 3, result: 4,
    firstResponseDate: 5, appoDate: 6, initialResponseDate: -1, cancelStopDate: 7,
    refundAmount: 8, landingAmount: 9, cancelReason: 10, passToProcess: 11,
    processStartDate: 12, sharedMemo: 24,
  });
  const [sheetGid, setSheetGid] = useState(null);

  const [modalRecord, setModalRecord] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [lstepConfirm, setLstepConfirm] = useState(null);
  const [toast, setToast] = useState(null);

  const [sortOrder, setSortOrder] = useState(null);
  const [sortOpen, setSortOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [chatMessages, setChatMessages] = useState([]);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const [apoSortMap, setApoSortMap] = useState({});
  const [sortLoading, setSortLoading] = useState(false);

  const setField = (key, val) => setForm(f => ({ ...f, [key]: val }));
  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(null), 3000); };

  const switchTab = (tab) => {
    setActiveTab(tab);
    setSortOrder(null);
    setSortOpen(false);
    localStorage.setItem('oba_tab', String(tab));
    if (Date.now() - lastSubmitRef.current >= 5000) fetchRecords();
  };

  // --- Auth (PKCE) ---
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    if (!code) return;
    const verifier = sessionStorage.getItem('pkce_verifier');
    if (!verifier) return;
    sessionStorage.removeItem('pkce_verifier');
    window.history.replaceState(null, '', window.location.pathname);
    setLoading(true);
    fetch('/api/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, code_verifier: verifier, redirect_uri: window.location.origin + '/' }),
    })
      .then(r => r.json())
      .then(data => {
        if (data.error) throw new Error(data.error);
        localStorage.setItem('gtoken', data.access_token);
        localStorage.setItem('gtoken_expiry', String(Date.now() + 55 * 60 * 1000));
        setToken(data.access_token);
        setLoading(false);
      })
      .catch(e => { setError(`ログインエラー: ${e.message}`); setLoading(false); });
  }, []);

  const login = async () => {
    try {
      const array = new Uint8Array(32);
      crypto.getRandomValues(array);
      const verifier = btoa(String.fromCharCode(...array)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
      const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
      const challenge = btoa(String.fromCharCode(...new Uint8Array(digest))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
      sessionStorage.setItem('pkce_verifier', verifier);
      const p = new URLSearchParams({
        client_id: CLIENT_ID,
        redirect_uri: window.location.origin + '/',
        response_type: 'code',
        scope: 'https://www.googleapis.com/auth/spreadsheets',
        code_challenge: challenge,
        code_challenge_method: 'S256',
        prompt: 'select_account',
      });
      window.location.href = `https://accounts.google.com/o/oauth2/v2/auth?${p}`;
    } catch (e) {
      setError(`ログインエラー: ${e.message || String(e)}`);
    }
  };

  useEffect(() => { if (token) fetchRecords(); }, [token]);

  // --- Fetch ---
  const fetchRecords = async () => {
    if (!SS_ID || !SHEET_NAME) {
      showToast("SS_ID と SHEET_NAME を設定してください（App.jsx 上部）");
      return;
    }
    setLoading(true);
    try {
      fetch(`https://sheets.googleapis.com/v4/spreadsheets/${SS_ID}?fields=sheets.properties`, { headers: { Authorization: `Bearer ${token}` } })
        .then(r => r.json()).then(data => { const s = (data.sheets || []).find(s => s.properties?.title === SHEET_NAME); if (s) setSheetGid(s.properties.sheetId); }).catch(() => {});

      const res = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${SS_ID}/values/${encodeURIComponent(SHEET_NAME + '!A:AC')}`, { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      if (data.error) {
        if (data.error.status === 'UNAUTHENTICATED' || data.error.code === 401) { setToken(null); localStorage.removeItem('gtoken'); localStorage.removeItem('gtoken_expiry'); }
        throw new Error(data.error.message);
      }
      const values = data.values || [];
      const detectedCols = {
        date:                detectCol(values, ['キャンセル申告日', '日付'], 0),
        product:             detectCol(values, ['商材'], 1),
        author:              detectCol(values, ['記入者'], 2),
        account:             detectCol(values, ['アカウント'], 3),
        rakkar:              detectCol(values, ['rakkar', 'Lステ', '顧客'], 4),
        result:              detectCol(values, ['架電結果'], DEFAULT_RESULT_COL_IDX),
        firstResponseDate:   detectCol(values, ['架電開始日'], -1),
        appoDate:            detectCol(values, ['アポ日時'], 6),
        initialResponseDate: detectCol(values, ['初回対応日'], -1),
        cancelStopDate:      detectCol(values, ['解約阻止日', '解約阻止'], 7),
        refundAmount:        detectCol(values, ['損害金見込み'], 8),
        landingAmount:       detectCol(values, ['着地の損害金', '着地損害金'], 9),
        cancelReason:        detectCol(values, ['解約理由'], 10),
        passToProcess:       detectCol(values, ['処理Tへパス', '処理T'], 11),
        processStartDate:    detectCol(values, ['処理開始日'], 12),
        sharedMemo:          24, // Y列（25列目）を一時メモ専用列として固定使用
      };
      // 重複列インデックスを解決：result列を最優先にし、他が同じindexになったら-1にする
      const usedIdx = new Set([detectedCols.result]);
      for (const key of ['rakkar','date','product','author','appoDate','cancelStopDate','passToProcess','initialResponseDate','firstResponseDate','refundAmount','landingAmount','cancelReason','processStartDate']) {
        const v = detectedCols[key];
        if (v >= 0 && usedIdx.has(v)) {
          detectedCols[key] = -1;
        } else if (v >= 0) {
          usedIdx.add(v);
        }
      }
      setCols(detectedCols);
      setRecords(parseSheetRows(values, detectedCols));
    } catch (e) {
      console.error(e);
      showToast(`データの取得に失敗: ${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleSharedMemoSave = async (r, text) => {
    if (cols.sharedMemo < 0) return;
    try {
      const range = encodeURIComponent(`${SHEET_NAME}!${idxToCol(cols.sharedMemo)}${r.rowIndex}`);
      await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${SS_ID}/values/${range}?valueInputOption=USER_ENTERED`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ values: [[text]] })
      });
      setRecords(prev => prev.map(item => item.id === r.id ? { ...item, sharedMemo: text } : item));
    } catch (e) { console.error(e); }
  };

  // --- Submit ---
  const handleSubmit = async () => {
    if (!form.result || !form.naContent || !modalRecord) return;
    if (form.naContent !== '完了' && !form.naCallDate) return;
    const rec = modalRecord;
    const now = new Date();
    const dateStr = `${now.getMonth() + 1}/${now.getDate()}`;
    const terminal = TERMINAL_RESULTS.includes(form.result);
    const apoMiss = form.result === "アポ不通";
    const apoGet = form.result === "通話アポ獲得";
    const apoGetDateStr = apoGet && form.naCallDate
      ? ` ${form.naCallDate}${form.naCallTime ? ' ' + form.naCallTime : ''}`
      : '';
    const newLine = apoMiss
      ? `${dateStr}アポ不通${form.note ? ' ' + form.note : ''}`
      : apoGet
        ? `${dateStr} 通話アポ獲得${apoGetDateStr}`
        : terminal
          ? `${dateStr}${form.result}${form.note ? ' ' + form.note : ''}`
          : `${dateStr} ${form.result}${form.note ? ' ' + form.note : ''}`;

    // 架電結果セルに NA 情報を埋め込む
    const naLine = form.naContent === '完了'
      ? '[NA:完了]'
      : `[NA:${form.naContent}|${form.naCallDate}${form.naCallTime ? ' ' + form.naCallTime : ''}]`;
    const existingLogs = rec.callLogs.map(l => l.result).join('\n');
    const newResultValue = [naLine, existingLogs, newLine].filter(Boolean).join('\n');

    try {
      setLoading(true);
      const put = async (colIdx, val) => {
        if (colIdx < 0) return;
        const range = encodeURIComponent(`${SHEET_NAME}!${idxToCol(colIdx)}${rec.rowIndex}`);
        const r = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${SS_ID}/values/${range}?valueInputOption=USER_ENTERED`, {
          method: 'PUT', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ values: [[val]] }),
        });
        if (!r.ok) { const err = await r.json(); throw new Error(err.error?.message || '書き込み失敗'); }
      };

      await put(cols.result, newResultValue);
      if (!rec.firstResponseDate && cols.firstResponseDate >= 0) {
        await put(cols.firstResponseDate, now.toISOString().slice(0, 10));
      }
      if (form.naContent === 'アポ' && form.naCallDate && cols.appoDate >= 0) {
        await put(cols.appoDate, `${form.naCallDate}${form.naCallTime ? ' ' + form.naCallTime : ''}`);
      } else if (cols.appoDate >= 0) {
        await put(cols.appoDate, '');
      }
      if (form.naContent === '完了' && activeTab === 8 && cols.passToProcess >= 0) {
        await put(cols.passToProcess, 'TRUE');
      }
      if (form.initialResponseDate && cols.initialResponseDate >= 0) await put(cols.initialResponseDate, form.initialResponseDate);
      if (form.cancelStopDate) await put(cols.cancelStopDate, form.cancelStopDate);
      if (form.refundAmount && cols.refundAmount >= 0) await put(cols.refundAmount, form.refundAmount);
      if (form.landingAmount && cols.landingAmount >= 0) await put(cols.landingAmount, form.landingAmount);
      if (cols.sharedMemo >= 0) await put(cols.sharedMemo, "");
      if (form.cancelReason && cols.cancelReason >= 0) await put(cols.cancelReason, form.cancelReason);
      if (form.passToProcess && cols.passToProcess >= 0) await put(cols.passToProcess, "TRUE");

      const { naContent: newNaContent, naDate: newNaDate, callLogs: newCallLogs } = parseCallResult(newResultValue);
      setRecords(prev => prev.map(r => {
        if (r.id !== rec.id) return r;
        return {
          ...r,
          callResultRaw: newResultValue,
          callLogs: newCallLogs,
          naContent: newNaContent,
          naDate: newNaDate,
          appoDateVal: form.naContent === 'アポ' && form.naCallDate
            ? `${form.naCallDate}${form.naCallTime ? ' ' + form.naCallTime : ''}`
            : '',
          cancelStopDate: form.cancelStopDate || r.cancelStopDate,
          cancelReason: form.cancelReason || r.cancelReason,
          sharedMemo: "",
        };
      }));
      lastSubmitRef.current = Date.now();
      showToast("架電結果を記録しました");
      setModalRecord(null);
    } catch (e) {
      showToast(`エラー: ${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  // --- Chat ---
  const sendChat = async () => {
    const text = chatInput.trim();
    if (!text || chatLoading) return;
    const newMessages = [...chatMessages, { role: 'user', content: text }];
    setChatMessages(newMessages);
    setChatInput('');
    setChatLoading(true);
    try {
      const res = await fetch('/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ messages: newMessages }) });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setChatMessages(prev => [...prev, { role: 'assistant', content: data.content }]);
    } catch (e) {
      setChatMessages(prev => [...prev, { role: 'assistant', content: `エラー: ${e.message}` }]);
    } finally {
      setChatLoading(false);
    }
  };

  // --- 判定関数 ---
  const getNaHour = (naDate) => { if (!naDate) return null; const m = naDate.match(/(\d{2}):\d{2}$/); return m ? m[1] : null; };
  const isTerminal  = (r) => TERMINAL_RESULTS.some(t => r.callResultRaw?.includes(t));
  const isDealDone  = (r) => !!r.cancelStopDate;
  const isComplete  = (r) => isTerminal(r) || isDealDone(r) || r.naContent === '完了' || r.passToProcess;
  const isApoTabFn  = (r) => !isComplete(r) && !!r.appoDateVal;
  // 旧フォーマット案件はlegacyFollowLevelで振り分け、新フォーマットはnaDateの時刻で振り分け
  const getFollowLevel = (r) => {
    if (r.legacyFollowLevel !== null) return r.legacyFollowLevel;
    const h = getNaHour(r.naDate);
    if (h === '02') return 2;
    if (h === '03') return 3;
    if (h === '04') return 4;
    if (h === '05') return 5;
    if (h === '06') return 6;
    if (h === '07') return 7;
    return 1;
  };
  const isFollow1Fn = (r) => !isComplete(r) && !r.appoDateVal && getFollowLevel(r) === 1;
  const isFollow2Fn = (r) => !isComplete(r) && !r.appoDateVal && getFollowLevel(r) === 2;
  const isFollow3Fn = (r) => !isComplete(r) && !r.appoDateVal && getFollowLevel(r) === 3;
  const isFollow4Fn = (r) => !isComplete(r) && !r.appoDateVal && getFollowLevel(r) === 4;
  const isFollow5Fn = (r) => !isComplete(r) && !r.appoDateVal && getFollowLevel(r) === 5;
  const isFollow6Fn = (r) => !isComplete(r) && !r.appoDateVal && getFollowLevel(r) === 6;
  const isFollow7Fn = (r) => !isComplete(r) && !r.appoDateVal && getFollowLevel(r) === 7;

  // --- AI Sort ---
  const handleAISort = async (order) => {
    setSortOrder(order);
    if (activeTab !== 1 || sortLoading) return;
    const apoRecs = records.filter(r => isApoTabFn(r) && r.naDate);
    const newMap = { ...apoSortMap };
    const needsAI = [];
    apoRecs.forEach(r => {
      if (r.naDate in newMap) return;
      const d = new Date(r.naDate);
      if (!isNaN(d.getTime())) { newMap[r.naDate] = d.toISOString().slice(0, 16); }
      else { needsAI.push(r.naDate); }
    });
    setApoSortMap(newMap);
    if (needsAI.length === 0) return;
    setSortLoading(true);
    try {
      const res = await fetch('/api/chat', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: [{ role: 'user', content: `以下のNA日時の値をそれぞれ日時として解釈し、ISO 8601形式（YYYY-MM-DDTHH:mm）のJSON配列のみで返してください。解析できない場合は"9999-12-31T00:00"にしてください。他の文字は一切含めないでください。\n${needsAI.map((v, i) => `${i}: ${v}`).join('\n')}` }] }),
      });
      const data = await res.json();
      const parsed = JSON.parse(data.content);
      setApoSortMap(prev => { const next = { ...prev }; needsAI.forEach((v, i) => { next[v] = parsed[i] || '9999-12-31T00:00'; }); return next; });
    } catch (e) { } finally { setSortLoading(false); }
  };

  const applyDateFilter = (list) => {
    if (dateFrom || dateTo) list = list.filter(r => {
      if (dateFrom && r.date < dateFrom) return false;
      if (dateTo && r.date > dateTo) return false;
      return true;
    });
    if (naDateFrom || naDateTo) list = list.filter(r => {
      const nd = r.naDate ? r.naDate.slice(0, 10) : '';
      if (naDateFrom && nd < naDateFrom) return false;
      if (naDateTo && nd > naDateTo) return false;
      return true;
    });
    return list;
  };

  const filteredRecords = useMemo(() => {
    let list;
    if (activeTab === 1)      list = records.filter(isApoTabFn);
    else if (activeTab === 2) list = records.filter(isFollow1Fn);
    else if (activeTab === 3) list = records.filter(isFollow2Fn);
    else if (activeTab === 4) list = records.filter(isFollow3Fn);
    else if (activeTab === 5) list = records.filter(isFollow4Fn);
    else if (activeTab === 6) list = records.filter(isFollow5Fn);
    else if (activeTab === 7) list = records.filter(isFollow6Fn);
    else if (activeTab === 8) list = records.filter(isFollow7Fn);
    else                      list = records.filter(isComplete);

    if (activeTab >= 2 && activeTab <= 8) list = applyDateFilter(list);

    if (sortOrder) {
      list = [...list].sort((a, b) => {
        if (activeTab === 1) {
          const da = new Date(apoSortMap[a.naDate] || '9999-12-31');
          const db = new Date(apoSortMap[b.naDate] || '9999-12-31');
          return sortOrder === 'asc' ? da - db : db - da;
        }
        const da = new Date(a.naDate || '9999-12-31');
        const db = new Date(b.naDate || '9999-12-31');
        return sortOrder === 'asc' ? da - db : db - da;
      });
    }
    return list;
  }, [records, activeTab, sortOrder, apoSortMap, dateFrom, dateTo, naDateFrom, naDateTo]);

  const tabCounts = useMemo(() => ({
    apo:  records.filter(isApoTabFn).length,
    f1:   applyDateFilter(records.filter(isFollow1Fn)).length,
    f2:   applyDateFilter(records.filter(isFollow2Fn)).length,
    f3:   applyDateFilter(records.filter(isFollow3Fn)).length,
    f4:   applyDateFilter(records.filter(isFollow4Fn)).length,
    f5:   applyDateFilter(records.filter(isFollow5Fn)).length,
    f6:   applyDateFilter(records.filter(isFollow6Fn)).length,
    f7:   applyDateFilter(records.filter(isFollow7Fn)).length,
    done: records.filter(isComplete).length,
  }), [records, dateFrom, dateTo, naDateFrom, naDateTo]);

  const nameCounts = useMemo(() => records.reduce((acc, r) => { acc[r.name] = (acc[r.name] || 0) + 1; return acc; }, {}), [records]);
  const duplicateNames = useMemo(() => new Set(Object.keys(nameCounts).filter(n => nameCounts[n] > 1)), [nameCounts]);

  const inputCls = "w-full bg-[#F8FAFC] border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-300 transition-all";
  const labelCls = "block text-[11px] font-bold text-slate-500 mb-1";
  const sectionHeadCls = "text-[10px] font-black text-indigo-500 uppercase tracking-[0.15em] mb-3 bg-indigo-50 px-3 py-1.5 rounded-lg inline-block";
  const isFormValid = !!form.result && !!form.naContent && (form.naContent === '完了' || !!form.naCallDate);

  // --- Login Screen ---
  if (!token) {
    return (
      <div className="min-h-screen bg-[#F8FAFC] flex flex-col items-center justify-center p-6 font-sans text-slate-900">
        <style>{`@import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;600;700;800;900&family=Noto+Sans+JP:wght@400;700;900&display=swap'); :root { font-family: 'Plus Jakarta Sans', 'Noto Sans JP', sans-serif; }`}</style>
        <div className="w-[80px] h-[80px] bg-[#4F46E5] rounded-[28px] flex items-center justify-center shadow-2xl shadow-indigo-200 mb-8 animate-bounce">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="fill-white text-white"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" /></svg>
        </div>
        <h1 className="text-5xl font-[900] mb-2 tracking-tighter">架電リスト管理</h1>
        <p className="text-[#94A3B8] font-bold text-xs uppercase tracking-[0.4em] mb-16">Call Management System</p>
        <button onClick={login} className="flex items-center gap-5 bg-white border border-slate-200 px-12 py-6 rounded-[28px] shadow-2xl hover:shadow-indigo-100 hover:border-indigo-400 transition-all active:scale-95 group">
          <div className="w-10 h-10 bg-slate-50 rounded-full flex items-center justify-center group-hover:bg-indigo-50 transition-colors">
            <LogIn className="text-slate-400 group-hover:text-indigo-600" size={20} />
          </div>
          <span className="font-[900] text-lg text-slate-800">Google Login</span>
        </button>
        {error && <p className="mt-6 text-red-500 text-sm font-bold text-center max-w-xs">{error}</p>}
        {loading && <p className="mt-6 text-slate-400 text-sm">認証中...</p>}
        <p className="mt-12 text-[10px] text-slate-300 font-black uppercase tracking-[0.2em]">架電リスト管理 PRODUCTION v3.0.0</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F8FAFC] flex font-sans text-slate-900 overflow-x-hidden">
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;600;700;800;900&family=Noto+Sans+JP:wght@400;700;900&display=swap'); :root { font-family: 'Plus Jakarta Sans', 'Noto Sans JP', sans-serif; } .custom-scrollbar::-webkit-scrollbar{width:4px} .custom-scrollbar::-webkit-scrollbar-track{background:transparent} .custom-scrollbar::-webkit-scrollbar-thumb{background:#E2E8F0;border-radius:9999px}`}</style>

      {/* Sidebar */}
      <aside className="w-64 bg-white border-r border-slate-200 flex flex-col fixed h-full z-20 shadow-sm overflow-y-auto">
        <div className="pl-5 pr-4 pt-7 pb-5 flex items-center gap-3">
          <div className="w-[52px] h-[52px] bg-[#4F46E5] rounded-[20px] flex items-center justify-center shadow-lg shadow-indigo-100 flex-shrink-0 text-white">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="fill-current"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" /></svg>
          </div>
          <div className="flex flex-col min-w-0">
            <span className="font-[900] text-[22px] tracking-tighter text-slate-900 leading-tight truncate">架電リスト管理</span>
            <span className="text-[8px] font-extrabold text-[#94A3B8] uppercase tracking-[0.05em] truncate mt-1">CALL MANAGEMENT SYSTEM</span>
          </div>
        </div>

        <nav className="flex-1 px-3 space-y-0.5 mt-1">
          <div className="pb-1.5 px-2 text-[9px] font-bold text-[#94A3B8] uppercase tracking-[0.2em]">LIST MENU</div>
          <NavItem icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.22 4.22l2.12 2.12M17.66 17.66l2.12 2.12M2 12h3M19 12h3M4.22 19.78l2.12-2.12M17.66 6.34l2.12-2.12"/></svg>} label="アポ" active={activeTab === 1} onClick={() => switchTab(1)} count={tabCounts.apo} />
          <NavItem icon={<Phone size={18} />} label="フォロー１" active={activeTab === 2} onClick={() => switchTab(2)} count={tabCounts.f1} />
          <NavItem icon={<Phone size={18} />} label="フォロー２" active={activeTab === 3} onClick={() => switchTab(3)} count={tabCounts.f2} />
          <NavItem icon={<Phone size={18} />} label="フォロー３" active={activeTab === 4} onClick={() => switchTab(4)} count={tabCounts.f3} />
          <NavItem icon={<Phone size={18} />} label="フォロー４" active={activeTab === 5} onClick={() => switchTab(5)} count={tabCounts.f4} />
          <NavItem icon={<Phone size={18} />} label="フォロー５" active={activeTab === 6} onClick={() => switchTab(6)} count={tabCounts.f5} />
          <NavItem icon={<Phone size={18} />} label="フォロー６" active={activeTab === 7} onClick={() => switchTab(7)} count={tabCounts.f6} />
          <NavItem icon={<Phone size={18} />} label="フォロー７" active={activeTab === 8} onClick={() => switchTab(8)} count={tabCounts.f7} />
          <NavItem icon={<CheckCircle2 size={18} />} label="完了済み" active={activeTab === 9} onClick={() => switchTab(9)} count={tabCounts.done} />

          <div className="pt-4 mt-2 border-t border-slate-100 px-1">
            <button onClick={() => setShowFilter(true)}
              className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl font-bold text-[13px] transition-all border ${(dateFrom || dateTo || naDateFrom || naDateTo) ? 'bg-indigo-50 text-indigo-600 border-indigo-200' : 'bg-slate-50 text-slate-600 border-slate-200 hover:border-indigo-300 hover:text-indigo-500'}`}>
              <span className="flex items-center gap-2">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M3 6h18M7 12h10M11 18h2"/></svg>
                絞り込み
              </span>
              {(dateFrom || dateTo || naDateFrom || naDateTo) && <span className="text-[10px] bg-indigo-500 text-white px-1.5 py-0.5 rounded-full font-black">ON</span>}
            </button>
          </div>
        </nav>

        <div className="p-6 border-t border-slate-100 mt-auto flex-shrink-0">
          <button onClick={() => { setToken(null); localStorage.removeItem('gtoken'); localStorage.removeItem('gtoken_expiry'); }}
            className="w-full flex items-center justify-center gap-2 text-sm font-bold text-[#94A3B8] hover:text-rose-500 transition-all py-3 rounded-xl hover:bg-rose-50">
            <LogOut size={18} /> ログアウト
          </button>
        </div>
      </aside>

      {/* Filter Panel */}
      {showFilter && (
        <div className="fixed inset-0 z-30 flex" onClick={() => setShowFilter(false)}>
          <div className="w-64 flex-shrink-0" />
          <div className="w-72 bg-white h-full shadow-2xl border-r border-slate-200 flex flex-col overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 pt-8 pb-4 border-b border-slate-100">
              <span className="font-[900] text-[16px] tracking-tight text-slate-900">絞り込み</span>
              <button onClick={() => setShowFilter(false)} className="p-2 hover:bg-slate-100 rounded-full text-slate-400"><X size={18} /></button>
            </div>
            <div className="flex-1 px-6 py-6 space-y-6">
              <div>
                <div className="text-[11px] font-black text-slate-500 uppercase tracking-widest mb-3">キャンセル申告日</div>
                <div className="space-y-2">
                  <div>
                    <label className="text-[11px] text-slate-400 font-bold">開始日</label>
                    <input type="date" value={dateFrom} onChange={e => { setDateFrom(e.target.value); localStorage.setItem('oba_dateFrom', e.target.value); }}
                      className="w-full mt-1 px-3 py-2 text-[13px] font-bold text-slate-700 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-indigo-400 focus:bg-white transition-all" />
                  </div>
                  <div>
                    <label className="text-[11px] text-slate-400 font-bold">終了日</label>
                    <input type="date" value={dateTo} onChange={e => { setDateTo(e.target.value); localStorage.setItem('oba_dateTo', e.target.value); }}
                      className="w-full mt-1 px-3 py-2 text-[13px] font-bold text-slate-700 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-indigo-400 focus:bg-white transition-all" />
                  </div>
                </div>
              </div>
              <div>
                <div className="text-[11px] font-black text-slate-500 uppercase tracking-widest mb-3">NA日時</div>
                <div className="space-y-2">
                  <div>
                    <label className="text-[11px] text-slate-400 font-bold">開始日</label>
                    <input type="date" value={naDateFrom} onChange={e => { setNaDateFrom(e.target.value); localStorage.setItem('oba_naDateFrom', e.target.value); }}
                      className="w-full mt-1 px-3 py-2 text-[13px] font-bold text-slate-700 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-indigo-400 focus:bg-white transition-all" />
                  </div>
                  <div>
                    <label className="text-[11px] text-slate-400 font-bold">終了日</label>
                    <input type="date" value={naDateTo} onChange={e => { setNaDateTo(e.target.value); localStorage.setItem('oba_naDateTo', e.target.value); }}
                      className="w-full mt-1 px-3 py-2 text-[13px] font-bold text-slate-700 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-indigo-400 focus:bg-white transition-all" />
                  </div>
                </div>
              </div>
            </div>
            <div className="px-6 pb-8 space-y-2">
              {(dateFrom || dateTo || naDateFrom || naDateTo) && (
                <button onClick={() => { setDateFrom(''); setDateTo(''); setNaDateFrom(''); setNaDateTo(''); ['oba_dateFrom','oba_dateTo','oba_naDateFrom','oba_naDateTo'].forEach(k => localStorage.removeItem(k)); }}
                  className="w-full py-3 rounded-2xl font-bold text-[13px] text-rose-500 hover:bg-rose-50 border border-rose-100 transition-all">
                  すべて解除
                </button>
              )}
              <button onClick={() => setShowFilter(false)}
                className="w-full py-3 rounded-2xl font-bold text-[13px] bg-[#4F46E5] text-white hover:bg-indigo-700 transition-all">
                適用して閉じる
              </button>
            </div>
          </div>
          <div className="flex-1 bg-slate-900/30 backdrop-blur-sm" />
        </div>
      )}

      {/* Main Content */}
      <main className="ml-64 flex-1 p-6 pb-32 max-w-[calc(100vw-16rem)] overflow-x-hidden">
        <header className="flex items-center justify-between mb-10 flex-wrap gap-y-4">
          <div className="flex items-center gap-6">
            <div>
              <h1 className="text-3xl font-[900] tracking-tight text-slate-900 mb-1 whitespace-nowrap">
                {['', 'アポ', 'フォロー１', 'フォロー２', 'フォロー３', 'フォロー４', 'フォロー５', 'フォロー６', 'フォロー７', '完了済み'][activeTab]}
              </h1>
              <div className="flex items-center gap-2">
                <span className={`flex h-1.5 w-1.5 rounded-full ${loading ? 'bg-amber-500' : 'bg-emerald-500'} animate-pulse`}></span>
                <span className="text-[9px] font-bold text-[#94A3B8] uppercase tracking-widest">
                  {loading ? 'Syncing...' : 'Live Sync Active'} · {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-2 border-l border-slate-200 pl-8 h-10">
              <div className="flex items-center gap-2 px-4 py-2 rounded-[14px] bg-[#0F172A] text-white min-w-[70px] justify-center shadow-md shadow-slate-200">
                <span className="text-[11px] font-[800] opacity-70 tracking-widest">TOTAL</span>
                <span className="text-[15px] font-[900]">{filteredRecords.length}</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {!sortOpen ? (
              <button onClick={() => setSortOpen(true)} className="flex items-center gap-2.5 px-6 py-2.5 bg-gradient-to-r from-[#4F46E5] to-[#7C3AED] text-white rounded-[16px] font-[800] shadow-lg shadow-indigo-100 hover:shadow-indigo-200 hover:scale-[1.02] transition-all active:scale-95 text-[13px] tracking-tight">
                並び替え <span className="text-white">✨</span>
              </button>
            ) : (
              <div className="flex items-center bg-white border border-slate-200 p-1.5 rounded-[18px] shadow-xl">
                <button onClick={() => handleAISort('asc')} className={`flex items-center gap-1.5 px-5 py-2 rounded-[12px] text-[11px] font-black transition-all ${sortOrder === 'asc' ? 'bg-[#4F46E5] text-white shadow-md' : 'text-slate-500 hover:bg-slate-50'}`}>
                  昇順 ▲ {sortLoading && activeTab === 1 && "..."}
                </button>
                <button onClick={() => handleAISort('desc')} className={`flex items-center gap-1.5 px-5 py-2 rounded-[12px] text-[11px] font-black transition-all ${sortOrder === 'desc' ? 'bg-[#4F46E5] text-white shadow-md' : 'text-slate-500 hover:bg-slate-50'}`}>
                  降順 ▼ {sortLoading && activeTab === 1 && "..."}
                </button>
                <div className="w-px h-6 bg-slate-100 mx-2"></div>
                <button onClick={() => { setSortOpen(false); setSortOrder(null); }} className="p-2.5 text-slate-300 hover:text-rose-500 hover:bg-rose-50 rounded-xl transition-all"><X size={16} /></button>
              </div>
            )}
          </div>
        </header>

        <div className="space-y-3.5">
          {loading && records.length === 0 ? (
            <div className="py-24 text-center">
              <div className="w-12 h-12 border-4 border-[#4F46E5] border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
              <p className="text-[#94A3B8] font-bold text-sm tracking-widest">CONNECTING TO SHEETS...</p>
            </div>
          ) : filteredRecords.length === 0 ? (
            <div className="bg-white rounded-[32px] p-24 border-2 border-dashed border-slate-200 text-center text-[#94A3B8] font-bold">
              現在、対応が必要な案件はありません
            </div>
          ) : (
            filteredRecords.map(r => (
              <RecordCard
                key={r.id}
                record={r}
                isDuplicate={duplicateNames.has(r.name)}
                onSharedMemoSave={(text) => handleSharedMemoSave(r, text)}
                onClick={() => {
                  const today = new Date().toISOString().slice(0, 10);
                  const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
                  const followDefaults = {
                    2: { naContent: 'フォロー２', naCallDate: today,    naCallTime: '02:00' },
                    3: { naContent: 'フォロー３', naCallDate: today,    naCallTime: '03:00' },
                    4: { naContent: 'フォロー４', naCallDate: tomorrow, naCallTime: '04:00' },
                    5: { naContent: 'フォロー５', naCallDate: today,    naCallTime: '05:00' },
                    6: { naContent: 'フォロー６', naCallDate: tomorrow, naCallTime: '06:00' },
                    7: { naContent: 'フォロー７', naCallDate: today,    naCallTime: '07:00' },
                    8: { naContent: '完了',       naCallDate: '',       naCallTime: '', passToProcess: true },
                  };
                  setModalRecord(r);
                  setForm({ ...EMPTY_FORM, ...(followDefaults[activeTab] || {}) });
                }}
                onLstep={() => setLstepConfirm({ url: r.lstepUrl, account: r.account })}
              />
            ))
          )}
        </div>
      </main>

      {/* Chat FAB */}
      <div className="fixed bottom-10 right-10 z-40 flex flex-col items-end gap-3">
        {chatOpen && (
          <div className="w-80 h-[420px] bg-white border border-slate-200 rounded-[24px] shadow-2xl flex flex-col overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-3 bg-gradient-to-r from-[#4F46E5] to-[#7C3AED]">
              <span className="text-white text-base">✨</span>
              <span className="text-white font-bold text-sm flex-1">AIアシスタント</span>
              <button onClick={() => setChatOpen(false)} className="text-white/70 hover:text-white transition-colors"><X size={18} /></button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-2 custom-scrollbar">
              {chatMessages.length === 0 && <p className="text-[#94A3B8] text-xs text-center mt-8">なんでも質問してください</p>}
              {chatMessages.map((m, i) => (
                <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[80%] px-3 py-2 rounded-2xl text-xs leading-relaxed whitespace-pre-wrap ${m.role === 'user' ? 'bg-[#4F46E5] text-white rounded-br-sm' : 'bg-[#F1F5F9] text-slate-800 rounded-bl-sm'}`}>{m.content}</div>
                </div>
              ))}
              {chatLoading && <div className="flex justify-start"><div className="bg-[#F1F5F9] rounded-2xl rounded-bl-sm px-3 py-2 text-xs text-slate-400">考え中...</div></div>}
            </div>
            <div className="p-3 border-t border-slate-100 flex gap-2">
              <input value={chatInput} onChange={e => setChatInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && !e.shiftKey && sendChat()}
                placeholder="質問を入力..." className="flex-1 bg-[#F8FAFC] border border-slate-200 rounded-xl px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-300" />
              <button onClick={sendChat} disabled={!chatInput.trim() || chatLoading}
                className="w-9 h-9 flex items-center justify-center bg-[#4F46E5] text-white rounded-xl disabled:opacity-40 hover:bg-indigo-700 transition-colors flex-shrink-0">
                <Send size={15} />
              </button>
            </div>
          </div>
        )}
        <button onClick={() => setChatOpen(o => !o)} className="w-16 h-16 bg-[#4F46E5] text-white rounded-[24px] shadow-2xl shadow-indigo-200 flex items-center justify-center hover:scale-110 transition-transform active:scale-95">
          <Sparkles className="fill-current w-6 h-6" />
        </button>
      </div>

      {/* Detail Modal */}
      {modalRecord && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-50 flex items-center justify-center p-6" onClick={() => setModalRecord(null)}>
          <div className="bg-white w-full max-w-2xl rounded-[40px] shadow-2xl overflow-hidden flex flex-col max-h-[95vh]" onClick={e => e.stopPropagation()}>
            {/* Modal Header */}
            <div className="p-8 pb-5 border-b border-slate-100 flex justify-between items-start flex-shrink-0">
              <div className="flex gap-5">
                <div className="w-14 h-14 bg-[#4F46E5] text-white rounded-[20px] flex items-center justify-center font-black text-xl shadow-xl shadow-indigo-100 flex-shrink-0">
                  {modalRecord.name.charAt(0)}
                </div>
                <div>
                  <div className="flex items-center gap-3 flex-wrap">
                    <h2 className="text-2xl font-[900] tracking-tight text-slate-900">{modalRecord.name}</h2>
                    {sheetGid !== null && (
                      <a href={`https://docs.google.com/spreadsheets/d/${SS_ID}/edit#gid=${sheetGid}&range=A${modalRecord.rowIndex}`}
                        target="_blank" rel="noopener noreferrer"
                        className="text-[10px] bg-emerald-50 border border-emerald-200 text-emerald-700 px-2.5 py-1 rounded-lg font-black hover:bg-emerald-100 transition-colors">
                        シートで開く ↗
                      </a>
                    )}
                    {modalRecord.lstepUrl && (
                      <button onClick={() => setLstepConfirm({ url: modalRecord.lstepUrl, account: modalRecord.account })}
                        className="text-[10px] bg-[#ECFDF5] border border-[#A7F3D0] text-[#059669] px-2.5 py-1 rounded-lg font-black hover:bg-[#A7F3D0] transition-colors">
                        Lステ ↗
                      </button>
                    )}
                  </div>
                  <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                    {modalRecord.account && <span className="text-[10px] bg-[#F1F5F9] text-[#64748B] px-2.5 py-1 rounded-lg font-black border border-slate-200">{modalRecord.account}</span>}
                    {modalRecord.product && <span className="text-[10px] bg-[#EEF2FF] text-[#4F46E5] px-2.5 py-1 rounded-lg font-black border border-indigo-100">{modalRecord.product}</span>}
                    {modalRecord.naContent && (
                      <span className={`text-[10px] font-black px-2.5 py-1 rounded-lg border ${NA_CONTENT_COLORS[modalRecord.naContent]?.bg} ${NA_CONTENT_COLORS[modalRecord.naContent]?.text} ${NA_CONTENT_COLORS[modalRecord.naContent]?.border}`}>
                        現在: {modalRecord.naContent}
                      </span>
                    )}
                  </div>
                  {modalRecord.cancelReason && (
                    <div className="mt-2 text-[11px] text-rose-600 bg-rose-50 border border-rose-100 px-3 py-1.5 rounded-lg font-medium">
                      解約理由: {modalRecord.cancelReason}
                    </div>
                  )}
                </div>
              </div>
              <button onClick={() => setModalRecord(null)} className="p-3 hover:bg-slate-100 rounded-full transition-all text-slate-400 flex-shrink-0"><X size={22} /></button>
            </div>

            {/* Modal Body */}
            <div className="p-8 pt-5 overflow-y-auto flex-1 space-y-6 custom-scrollbar">

              {/* 架電結果 */}
              <div>
                <div className={sectionHeadCls}>架電結果 *</div>
                <div className="grid grid-cols-4 gap-3 mb-4">
                  {RESULT_OPTIONS.map(opt => (
                    <button key={opt} onClick={() => setField("result", opt)}
                      className={`py-3.5 rounded-[14px] text-sm font-bold border-2 transition-all ${form.result === opt ? 'bg-[#4F46E5] text-white border-[#4F46E5] shadow-lg shadow-indigo-100' : 'bg-white border-slate-100 text-slate-600 hover:border-indigo-200'}`}>
                      {opt}
                    </button>
                  ))}
                </div>
                <label className={labelCls}>架電メモ</label>
                <textarea value={form.note} onChange={e => setField("note", e.target.value)}
                  className={`${inputCls} resize-none`} rows={2} placeholder="例：折り返し希望・午後以降" />
              </div>

              {/* NA内容 + NA日時 */}
              <div>
                <div className={sectionHeadCls}>NA内容 *</div>
                <div className="grid grid-cols-3 gap-3 mb-4">
                  {NA_CONTENT_OPTIONS.map(opt => (
                    <button key={opt} onClick={() => { setField("naContent", opt); setField("naCallDate", ""); setField("naCallTime", ""); }}
                      className={`py-3.5 rounded-[14px] text-sm font-bold border-2 transition-all ${form.naContent === opt ? 'bg-[#4F46E5] text-white border-[#4F46E5] shadow-lg shadow-indigo-100' : 'bg-white border-slate-100 text-slate-600 hover:border-indigo-200'}`}>
                      {opt}
                    </button>
                  ))}
                </div>
                {form.naContent && form.naContent !== '完了' && (
                  <>
                    <div className={sectionHeadCls}>NA日時 *</div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className={labelCls}>日付</label>
                        <input type="date" value={form.naCallDate} onChange={e => setField("naCallDate", e.target.value)} className={inputCls} />
                      </div>
                      <div>
                        <label className={labelCls}>時間</label>
                        <input type="time" value={form.naCallTime} onChange={e => setField("naCallTime", e.target.value)} className={inputCls} />
                      </div>
                    </div>
                  </>
                )}
              </div>

              {/* 対応情報 */}
              <div>
                <div className={sectionHeadCls}>対応情報</div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={labelCls}>初回対応日</label>
                    <input type="date" value={form.initialResponseDate} onChange={e => setField("initialResponseDate", e.target.value)} className={inputCls} />
                  </div>
                </div>
                <p className="text-[10px] text-slate-400 mt-2">※ 対応開始日は結果登録時に自動入力されます（未入力時のみ）</p>
              </div>

              {/* 解約関連 */}
              <div>
                <div className={sectionHeadCls}>解約関連</div>
                <div className="mb-3">
                  <label className={labelCls}>解約理由</label>
                  <textarea value={form.cancelReason} onChange={e => setField("cancelReason", e.target.value)}
                    className={`${inputCls} resize-none`} rows={2}
                    placeholder={modalRecord?.cancelReason || "解約理由を入力"}
                  />
                </div>
                <div className="mb-3">
                  <label className={labelCls}>処理Tへパス</label>
                  <button type="button" onClick={() => setField("passToProcess", !form.passToProcess)}
                    className={`w-full py-3 rounded-[14px] text-sm font-bold border-2 transition-all ${form.passToProcess ? 'bg-indigo-600 text-white border-indigo-600 shadow-lg' : 'bg-white border-slate-100 text-slate-600 hover:border-indigo-300'}`}>
                    {form.passToProcess ? '処理Tへパス ☑' : '処理Tへパス'}
                  </button>
                </div>
                <div className="mb-3">
                  <label className={labelCls}>解約阻止日</label>
                  <input type="date" value={form.cancelStopDate} onChange={e => setField("cancelStopDate", e.target.value)} className={inputCls} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={labelCls}>損害金見込み</label>
                    <input type="number" value={form.refundAmount} onChange={e => setField("refundAmount", e.target.value)} className={inputCls} placeholder="0" />
                  </div>
                  <div>
                    <label className={labelCls}>着地の損害金</label>
                    <input type="number" value={form.landingAmount} onChange={e => setField("landingAmount", e.target.value)} className={inputCls} placeholder="0" />
                  </div>
                </div>
              </div>

            </div>

            {/* Modal Footer */}
            <div className="p-8 pt-5 border-t border-slate-100 flex gap-4 flex-shrink-0">
              <button onClick={() => setModalRecord(null)} className="flex-1 py-4 rounded-[20px] font-bold text-[#94A3B8] hover:bg-slate-50 transition-all">キャンセル</button>
              <button onClick={handleSubmit} disabled={!isFormValid || loading}
                className="flex-[2] py-4 bg-[#4F46E5] text-white rounded-[20px] font-bold shadow-2xl shadow-indigo-200 active:scale-95 transition-all disabled:opacity-50">
                {loading ? '更新中...' : '記録を保存'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Lステップ確認モーダル */}
      {lstepConfirm && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm z-[100] flex items-center justify-center p-6" onClick={() => setLstepConfirm(null)}>
          <div className="bg-white rounded-[32px] p-10 max-w-sm w-full text-center shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="w-16 h-16 bg-amber-50 text-amber-500 rounded-[20px] flex items-center justify-center mx-auto mb-6">
              <AlertCircle size={32} />
            </div>
            <h3 className="text-lg font-[900] mb-3 tracking-tighter text-slate-900">アカウント切替確認</h3>
            <p className="text-[#64748B] text-sm mb-6 leading-relaxed">Lステップで以下のアカウントに切り替えてください</p>
            <div className="bg-[#EEF2FF] text-[#4F46E5] font-[900] py-4 rounded-[18px] mb-6 text-base border border-indigo-100">
              {lstepConfirm.account || '（アカウント不明）'}
              {findAccountId(lstepConfirm.account) && (
                <div className="text-[12px] font-black text-[#6366F1] mt-1 tracking-widest">ID: {findAccountId(lstepConfirm.account)}</div>
              )}
            </div>
            <div className="flex gap-3">
              <button onClick={() => setLstepConfirm(null)} className="flex-1 py-3.5 font-bold text-[#94A3B8] hover:bg-slate-50 rounded-2xl transition-all border border-slate-100">戻る</button>
              <a href={lstepConfirm.url} target="_blank" rel="noopener noreferrer" onClick={() => setLstepConfirm(null)}
                className="flex-[2] bg-[#4F46E5] text-white py-3.5 rounded-2xl font-bold shadow-lg shadow-indigo-100 flex items-center justify-center hover:bg-indigo-700 transition-all">
                切替済み · 開く →
              </a>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-10 left-1/2 -translate-x-1/2 bg-[#0F172A] text-white px-8 py-4 rounded-[20px] shadow-2xl z-[200] flex items-center gap-4 font-bold text-sm">
          <CheckCircle2 className="text-[#10B981]" size={18} /> {toast}
        </div>
      )}
    </div>
  );
}

// --- Subcomponents ---
function NavItem({ icon, label, count, active, onClick }) {
  return (
    <button onClick={onClick} className={`w-full flex items-center justify-between px-3 py-2 rounded-[12px] transition-all ${active ? "bg-[#4F46E5] text-white shadow-lg shadow-indigo-100 font-bold" : "text-[#64748B] hover:bg-slate-50 hover:text-slate-900"}`}>
      <div className="flex items-center gap-2.5">{icon}<span className="text-[12px] tracking-tight font-bold">{label}</span></div>
      {count !== undefined && (
        <span className={`text-[10px] font-black px-1.5 py-0.5 rounded-[6px] ${active ? "bg-white/20 text-white" : "bg-[#F1F5F9] text-[#64748B]"}`}>{count}</span>
      )}
    </button>
  );
}

function RecordCard({ record, isDuplicate, onClick, onLstep, onSharedMemoSave }) {
  const naColor = NA_CONTENT_COLORS[record.naContent] || { bg: "bg-[#F1F5F9]", text: "text-[#64748B]", border: "border-[#E2E8F0]" };
  const naLabel = record.naContent || "未設定";

  return (
    <div
      className={`p-5 rounded-[28px] border hover:shadow-xl transition-all cursor-pointer flex items-center gap-4 group w-full min-w-0 ${isDuplicate ? 'bg-[#FFF5F5] border-[#FCA5A5] hover:border-red-400' : 'bg-white border-slate-200 hover:border-indigo-400 hover:shadow-indigo-50/20'}`}
      onClick={onClick}
    >
      <div className={`w-16 h-14 rounded-[18px] flex items-center justify-center font-[900] text-[11px] flex-shrink-0 border text-center px-1 ${naColor.bg} ${naColor.text} ${naColor.border}`}>
        {naLabel}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-3 mb-1.5 flex-wrap">
          <span className={`text-[17px] font-[800] tracking-tight truncate ${isDuplicate ? 'text-red-700' : 'text-slate-900'}`}>{record.name}</span>
          {isDuplicate && <span className="text-[9px] bg-red-100 text-red-600 border border-red-200 px-2 py-0.5 rounded-lg font-black">重複</span>}
          {record.account && <span className="text-[10px] bg-[#F1F5F9] text-[#64748B] px-2 py-0.5 rounded-[8px] font-black border border-slate-200 truncate max-w-[80px]">{record.account}</span>}
          {record.product && <span className="text-[10px] bg-[#EEF2FF] text-[#4F46E5] px-2 py-0.5 rounded-[8px] font-black border border-indigo-100 truncate max-w-[80px]">{record.product}</span>}
          {record.lstepUrl && (
            <button onClick={e => { e.stopPropagation(); onLstep(); }}
              className="text-[10px] bg-[#ECFDF5] text-[#059669] border border-[#A7F3D0] px-2 py-0.5 rounded-[8px] font-black hover:bg-[#A7F3D0] transition-colors flex-shrink-0">
              Lステ ↗
            </button>
          )}
        </div>

        {record.cancelReason && (
          <div className="text-[12px] text-rose-600 font-medium mb-1 flex items-center gap-1.5">
            <AlertCircle size={12} className="flex-shrink-0" />
            <span className="truncate max-w-[360px]">{record.cancelReason}</span>
          </div>
        )}

        {/* 共有メモ */}
        <div className="mt-2" onClick={e => e.stopPropagation()}>
          <input
            key={record.id + (record.sharedMemo || '')}
            defaultValue={record.sharedMemo || ''}
            onBlur={e => { if (e.target.value !== (record.sharedMemo || '')) onSharedMemoSave(e.target.value); }}
            placeholder="共有メモ（全員に見れます・自動保存）"
            className="w-full bg-sky-50/50 border border-sky-100 rounded-lg px-3 py-1.5 text-[11px] text-sky-900 placeholder:text-sky-300 focus:outline-none focus:bg-sky-50 focus:border-sky-200 transition-all"
          />
        </div>

        {record.appoDateVal && (
          <div className="mt-2 inline-flex items-center gap-2 bg-[#FFF7ED] text-[#EA580C] px-3 py-1.5 rounded-[12px] border border-[#FFEDD5] text-[11px] font-[900]">
            <Calendar size={13} /> アポ日時: {record.appoDateVal}
          </div>
        )}
        {record.naDate && (
          <div className="mt-2 inline-flex items-center gap-2 bg-[#FFF7ED] text-[#EA580C] px-3 py-1.5 rounded-[12px] border border-[#FFEDD5] text-[11px] font-[900]">
            <Clock size={13} /> NA: {record.naDate}
          </div>
        )}
        {record.callLogs.length > 0 && (
          <div className="mt-2 flex gap-2 flex-wrap">
            {record.callLogs.slice(-3).map((l, idx) => (
              <span key={idx} className="text-[10px] bg-[#F9FAFB] border border-slate-200 rounded-lg px-2 py-0.5 text-[#6B7280]">{l.result}</span>
            ))}
          </div>
        )}
      </div>

      <div className="flex flex-col items-end gap-3 flex-shrink-0">
        <div className="text-[11px] font-bold text-[#94A3B8] flex items-center gap-1.5">
          <Calendar size={13} /> {record.date}
        </div>
        <button className="flex items-center gap-2 px-5 py-2.5 bg-[#0F172A] text-white rounded-[14px] text-xs font-black shadow-lg group-hover:bg-[#4F46E5] transition-all active:scale-95">
          結果入力 <ChevronRight size={13} />
        </button>
      </div>
    </div>
  );
}
