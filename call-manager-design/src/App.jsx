import React, { useState, useEffect, useMemo, useRef } from "react";
import {
  Phone, CheckCircle2, Clock, MessageSquare, ChevronRight,
  ExternalLink, LogOut, MapPin, Calendar, AlertCircle,
  Sparkles, Send, X, LogIn
} from "lucide-react";

// --- Configuration ---
const CLIENT_ID = "87533023495-hdt3pp8ujq3p60ptgl66nqaesnli802v.apps.googleusercontent.com";
const SS_IDS = {
  EAST: "1aU5_kB3GJx4EmdcgkZ71pJseQoscv0xY502fiW1LVI0",
  WEST: "1y0nCiLHCnIQKb8BcoUjYTiIcqUGdjRYnSFMvk1jBuhY",
  ATOM: "12fjFyhZ9vkYV_-KDMHH4O3mBRN8e6HZ9FXBLMREVSkQ",
};
const SHEETS = {
  EAST: 'Lステ連携',
  WEST: 'Lステ連携',
  ATOM: '★新★Lステ連携',
};
const DEFAULT_RESULT_COL_IDX = 22;

const RESULT_OPTIONS = ["アポ不通", "不在", "解決済み", "通話アポ獲得"];
const TERMINAL_RESULTS = ["解決済み"];
const NA_CONTENT_OPTIONS = ["アポ", "フォロー１", "フォロー２", "フォロー３", "完了"];
const NA_CONTENT_COLORS = {
  "アポ":     { bg: "bg-[#FFF7ED]", text: "text-[#EA580C]", border: "border-[#FFEDD5]" },
  "フォロー１": { bg: "bg-[#EFF6FF]", text: "text-[#2563EB]", border: "border-[#BFDBFE]" },
  "フォロー２": { bg: "bg-[#F5F3FF]", text: "text-[#7C3AED]", border: "border-[#DDD6FE]" },
  "フォロー３": { bg: "bg-[#ECFDF5]", text: "text-[#059669]", border: "border-[#A7F3D0]" },
  "完了":     { bg: "bg-[#F1F5F9]", text: "text-[#64748B]", border: "border-[#E2E8F0]" },
};
const TYPE_COLORS = {
  A: { bg: "bg-[#FEE2E2]", text: "text-[#991B1B]", border: "border-[#FECACA]" },
  B: { bg: "bg-[#FEF3C7]", text: "text-[#92400E]", border: "border-[#FDE68A]" },
  C: { bg: "bg-[#D1FAE5]", text: "text-[#065F46]", border: "border-[#A7F3D0]" },
};

const EMPTY_FORM = {
  result: "", note: "", team: "", initialResponseDate: "",
  assignee1: "", assignee2: "", cancelStopDate: "", refundAmount: "",
  landingAmount: "", cancelProcess: false, naContent: "", naCallDate: "", naCallTime: "",
  laccarURL: "", template: "", vip: false, ltvReservation: false,
  reservationDate: "", reservationClinic: "", reservationDay: "", reservationTime: "",
  desiredTreatment: "", visit: false, contract: false, contractContent: "",
  contractAmount1: "", contractAmount2: "",
};

// --- Helper Functions ---
const idxToCol = (idx) => {
  let s = '', n = idx + 1;
  while (n > 0) { const r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = Math.floor((n - 1) / 26); }
  return s;
};

// naCall列を解析 → { naContent, naDate }
const parseNaCall = (raw) => {
  if (!raw) return { naContent: null, naDate: null };
  const s = raw.trim();
  if (s === '完了') return { naContent: '完了', naDate: null };
  const pipeIdx = s.indexOf('|');
  if (pipeIdx !== -1) {
    return { naContent: s.slice(0, pipeIdx).trim(), naDate: s.slice(pipeIdx + 1).trim() };
  }
  if (['TRUE', 'FALSE'].includes(s.toUpperCase())) return { naContent: null, naDate: null };
  // パイプなし・完了でない → 旧形式の生日時文字列（アポ扱い）
  return { naContent: null, naDate: s };
};

const parseCallLogs = (text) => {
  if (!text) return [];
  return text.split('\n').filter(l => l.trim()).map(l => ({ result: l.trim() }));
};

const extractType = (level) => { const m = level.match(/【阻止T】([ABC])/); return m ? m[1] : null; };

const detectCol = (values, keywords, fallback) => {
  for (let ri = 0; ri <= 2 && ri < values.length; ri++) {
    const row = values[ri];
    const found = row.findIndex(cell => cell && keywords.some(kw => cell.toString().includes(kw)));
    if (found !== -1) return found;
  }
  return fallback;
};
const detectColExact = (values, keyword, fallback) => {
  for (let ri = 0; ri <= 2 && ri < values.length; ri++) {
    const row = values[ri];
    const found = row.findIndex(cell => cell && cell.toString().trim() === keyword);
    if (found !== -1) return found;
  }
  return fallback;
};
const detectLevelCol = (values, fallback) => {
  for (let i = 3; i < values.length; i++) {
    const row = values[i];
    for (let j = 0; j < row.length; j++) {
      if (row[j] && row[j].toString().includes('阻止T')) return j;
    }
  }
  return fallback;
};

const parseSheetRows = (values, cols) => {
  const result = [];
  for (let i = 3; i < values.length; i++) {
    const row = values[i];
    const get = (idx) => idx >= 0 ? (row[idx] || '').toString().trim() : '';
    const levelM = get(cols.level);
    if (!levelM.includes('阻止T')) continue;
    const callResultRaw = get(cols.result);
    const naCallRaw = get(cols.naCall);
    const { naContent, naDate } = parseNaCall(naCallRaw);
    result.push({
      id: i,
      rowIndex: i + 1,
      date: get(cols.date).slice(0, 10),
      name: get(cols.name),
      clinic: get(cols.clinic),
      account: get(cols.account),
      content: get(cols.content),
      memo: get(cols.memo),
      assignee: get(cols.assignee),
      level: levelM,
      type: extractType(levelM),
      lstepUrl: cols.lstep >= 0 ? get(cols.lstep) : '',
      callResultRaw,
      callLogs: parseCallLogs(callResultRaw),
      team: get(cols.team),
      firstResponseDate: get(cols.firstResponseDate),
      initialResponseDate: get(cols.initialResponseDate),
      cancelStopDate: get(cols.cancelStopDate),
      refundAmount: get(cols.refundAmount),
      landingAmount: get(cols.landingAmount),
      naCall: naCallRaw,
      naContent,
      naDate,
      time: get(cols.time),
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
  const lastSubmitRef = useRef(0); // 最終登録時刻（ms）
  const [region, setRegion] = useState(() => localStorage.getItem('cm_region') || 'EAST');
  const [activeTab, setActiveTab] = useState(() => parseInt(localStorage.getItem('cm_tab') || '1'));
  const [cols, setCols] = useState({ date: 0, time: -1, name: 3, clinic: 5, account: 6, content: 7, memo: 8, assignee: 11, level: 12, result: DEFAULT_RESULT_COL_IDX, lstep: -1, naCall: -1, team: -1, firstResponseDate: -1, initialResponseDate: -1, cancelStopDate: -1, refundAmount: -1, landingAmount: -1 });
  const [sheetGid, setSheetGid] = useState(null);
  const [accountIdMap, setAccountIdMap] = useState({});

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
    localStorage.setItem('cm_tab', String(tab));
    // 登録直後5秒以内は自動リロードをスキップ（楽観更新を保護）
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

  useEffect(() => { if (token) fetchRecords(); }, [token, region]);

  // --- Fetch ---
  const fetchRecords = async () => {
    setLoading(true);
    const ssId = SS_IDS[region];
    const sheetName = SHEETS[region];
    try {
      fetch(`https://sheets.googleapis.com/v4/spreadsheets/${ssId}?fields=sheets.properties`, { headers: { Authorization: `Bearer ${token}` } })
        .then(r => r.json()).then(data => { const s = (data.sheets || []).find(s => s.properties?.title === sheetName); if (s) setSheetGid(s.properties.sheetId); }).catch(() => {});
      fetch(`https://sheets.googleapis.com/v4/spreadsheets/${ssId}/values/${encodeURIComponent('各アカウント一覧!A:Z')}`, { headers: { Authorization: `Bearer ${token}` } })
        .then(r => r.json()).then(data => {
          if (data.error || !data.values) return;
          const map = {};
          data.values.forEach(row => {
            const atIdx = row.findIndex(cell => cell && cell.toString().trim().startsWith('@'));
            if (atIdx === -1) return;
            const lineId = row[atIdx].toString().trim();
            for (let idx = 0; idx < atIdx; idx++) { const name = (row[idx] || '').toString().trim(); if (name) map[name] = lineId; }
          });
          setAccountIdMap(map);
        }).catch(() => {});

      const res = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${ssId}/values/${encodeURIComponent(sheetName + '!A:AC')}`, { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      if (data.error) {
        if (data.error.status === 'UNAUTHENTICATED' || data.error.code === 401) { setToken(null); localStorage.removeItem('gtoken'); localStorage.removeItem('gtoken_expiry'); }
        throw new Error(data.error.message);
      }
      const values = data.values || [];
      const detectedCols = {
        date:                detectCol(values, ['日付'], 0),
        name:                detectCol(values, ['名前', '顧客名'], 3),
        clinic:              detectCol(values, ['クリニック', '院'], 5),
        account:             detectCol(values, ['アカウント'], 6),
        content:             detectCol(values, ['内容', 'コンテンツ'], 7),
        memo:                detectCol(values, ['備考', 'メモ'], 8),
        assignee:            detectCol(values, ['担当者', '対応者'], 11),
        level:               detectLevelCol(values, 12),
        result:              detectCol(values, ['架電結果'], DEFAULT_RESULT_COL_IDX),
        lstep:               detectCol(values, ['Lステップ'], -1),
        team:                detectCol(values, ['対応チーム'], -1),
        firstResponseDate:   detectCol(values, ['対応開始日'], -1),
        initialResponseDate: detectCol(values, ['初回対応日'], -1),
        cancelStopDate:      detectCol(values, ['解約阻止日', '解約阻止'], -1),
        refundAmount:        detectCol(values, ['損害金見込み'], -1),
        landingAmount:       detectCol(values, ['着地の損害金', '着地損害金'], -1),
        naCall:              detectCol(values, ['NA架電'], -1),
        time:                detectColExact(values, '時間', -1),
        sharedMemo:          detectCol(values, ['備考（自由記述）'], -1),
      };
      setCols(detectedCols);
      setRecords(parseSheetRows(values, detectedCols));
    } catch (e) {
      console.error(e);
      showToast("データの取得に失敗しました");
    } finally {
      setLoading(false);
    }
  };

  const handleSharedMemoSave = async (r, text) => {
    if (cols.sharedMemo < 0) return;
    const ssId = SS_IDS[region];
    const sheetName = SHEETS[region];
    try {
      const range = encodeURIComponent(`${sheetName}!${idxToCol(cols.sharedMemo)}${r.rowIndex}`);
      await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${ssId}/values/${range}?valueInputOption=USER_ENTERED`, {
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
    const ssId = SS_IDS[region];
    const sheetName = SHEETS[region];
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
    const newRaw = rec.callResultRaw ? `${rec.callResultRaw}\n${newLine}` : newLine;

    // naCall書き込み値
    const naVal = form.naContent === '完了'
      ? '完了'
      : `${form.naContent}|${form.naCallDate}${form.naCallTime ? ' ' + form.naCallTime : ''}`;

    try {
      setLoading(true);
      const put = async (colIdx, val) => {
        if (colIdx < 0) return;
        const range = encodeURIComponent(`${sheetName}!${idxToCol(colIdx)}${rec.rowIndex}`);
        const r = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${ssId}/values/${range}?valueInputOption=USER_ENTERED`, {
          method: 'PUT', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ values: [[val]] }),
        });
        if (!r.ok) { const err = await r.json(); throw new Error(err.error?.message || '書き込み失敗'); }
      };

      await put(cols.result, newRaw);
      if (form.team && cols.team >= 0) await put(cols.team, form.team);
      if (!rec.firstResponseDate && cols.firstResponseDate >= 0) {
        await put(cols.firstResponseDate, now.toISOString().slice(0, 10));
      }
      if (form.initialResponseDate && cols.initialResponseDate >= 0) await put(cols.initialResponseDate, form.initialResponseDate);
      if (form.cancelStopDate) await put(cols.cancelStopDate, form.cancelStopDate);
      if (form.cancelProcess && cols.team >= 0) await put(cols.team, '解約処理');
      if (form.refundAmount && cols.refundAmount >= 0) await put(cols.refundAmount, form.refundAmount);
      if (form.landingAmount && cols.landingAmount >= 0) await put(cols.landingAmount, form.landingAmount);
      if (cols.naCall >= 0) await put(cols.naCall, naVal);
      // 共有メモ（備考（自由記述））をリセット
      if (cols.sharedMemo >= 0) await put(cols.sharedMemo, "");

      const { naContent: newNaContent, naDate: newNaDate } = parseNaCall(naVal);
      setRecords(prev => prev.map(r => {
        if (r.id !== rec.id) return r;
        return {
          ...r,
          callResultRaw: newRaw,
          callLogs: [...r.callLogs, { result: newLine }],
          cancelStopDate: form.cancelStopDate || r.cancelStopDate,
          team: form.cancelProcess ? '解約処理' : (form.team || r.team),
          naCall: naVal,
          naContent: newNaContent,
          naDate: newNaDate,
          sharedMemo: "", // アプリ側の表示もリセット
        };
      }));
      lastSubmitRef.current = Date.now(); // 登録時刻を記録
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
  const isTerminal  = (r) => TERMINAL_RESULTS.some(t => r.callResultRaw?.includes(t));
  const isDealDone  = (r) => !!(r.cancelStopDate || r.team?.includes('解約処理'));
  const isComplete  = (r) => isTerminal(r) || isDealDone(r) || r.naContent === '完了';
  const isApoTabFn  = (r) => !isComplete(r) && (r.naContent === 'アポ' || (r.naContent === null && !!r.naDate));
  const isFollow1Fn = (r) => !isComplete(r) && (r.naContent === 'フォロー１' || (r.naContent === null && !r.naDate));
  const isFollow2Fn = (r) => !isComplete(r) && r.naContent === 'フォロー２';
  const isFollow3Fn = (r) => !isComplete(r) && r.naContent === 'フォロー３';

  // --- AI Sort (アポタブのみ) ---
  const handleAISort = async (order) => {
    setSortOrder(order);
    if (activeTab !== 1 || sortLoading) return;
    const apoRecs = records.filter(r => isApoTabFn(r) && r.naDate);
    // 直接パースできるものはキャッシュへ、できないものはAIへ
    const newMap = { ...apoSortMap };
    const needsAI = [];
    apoRecs.forEach(r => {
      if (r.naDate in newMap) return;
      const d = new Date(r.naDate);
      if (!isNaN(d.getTime())) {
        newMap[r.naDate] = d.toISOString().slice(0, 16);
      } else {
        needsAI.push(r.naDate);
      }
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

  const filteredRecords = useMemo(() => {
    let list;
    if (activeTab === 1)      list = records.filter(isApoTabFn);
    else if (activeTab === 2) list = records.filter(isFollow1Fn);
    else if (activeTab === 3) list = records.filter(isFollow2Fn);
    else if (activeTab === 4) list = records.filter(isFollow3Fn);
    else                      list = records.filter(isComplete);

    if (sortOrder) {
      list = [...list].sort((a, b) => {
        if (activeTab === 1) {
          // アポ: AI解析結果を使用
          const da = new Date(apoSortMap[a.naDate] || '9999-12-31');
          const db = new Date(apoSortMap[b.naDate] || '9999-12-31');
          return sortOrder === 'asc' ? da - db : db - da;
        }
        // フォロー1〜3: naDateを直接パース
        const da = new Date(a.naDate || '9999-12-31');
        const db = new Date(b.naDate || '9999-12-31');
        return sortOrder === 'asc' ? da - db : db - da;
      });
    }
    return list;
  }, [records, activeTab, sortOrder, apoSortMap]);

  const counts = useMemo(() => ({
    total: filteredRecords.length,
    A: filteredRecords.filter(r => r.type === 'A').length,
    B: filteredRecords.filter(r => r.type === 'B').length,
    C: filteredRecords.filter(r => r.type === 'C').length,
  }), [filteredRecords]);

  const nameCounts = useMemo(() => records.reduce((acc, r) => { acc[r.name] = (acc[r.name] || 0) + 1; return acc; }, {}), [records]);
  const duplicateNames = useMemo(() => new Set(Object.keys(nameCounts).filter(n => nameCounts[n] > 1)), [nameCounts]);

  const tabCounts = useMemo(() => ({
    apo:  records.filter(isApoTabFn).length,
    f1:   records.filter(isFollow1Fn).length,
    f2:   records.filter(isFollow2Fn).length,
    f3:   records.filter(isFollow3Fn).length,
    done: records.filter(isComplete).length,
  }), [records]);

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
        <p className="mt-12 text-[10px] text-slate-300 font-black uppercase tracking-[0.2em]">架電リスト管理 PRODUCTION v2.0.0</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F8FAFC] flex font-sans text-slate-900 overflow-x-hidden">
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;600;700;800;900&family=Noto+Sans+JP:wght@400;700;900&display=swap'); :root { font-family: 'Plus Jakarta Sans', 'Noto Sans JP', sans-serif; } .custom-scrollbar::-webkit-scrollbar{width:4px} .custom-scrollbar::-webkit-scrollbar-track{background:transparent} .custom-scrollbar::-webkit-scrollbar-thumb{background:#E2E8F0;border-radius:9999px}`}</style>

      {/* Sidebar */}
      <aside className="w-64 bg-white border-r border-slate-200 flex flex-col fixed h-full z-20 shadow-sm">
        <div className="pl-6 pr-4 pt-10 pb-8 flex items-center gap-4">
          <div className="w-[52px] h-[52px] bg-[#4F46E5] rounded-[20px] flex items-center justify-center shadow-lg shadow-indigo-100 flex-shrink-0 text-white">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="fill-current"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" /></svg>
          </div>
          <div className="flex flex-col min-w-0">
            <span className="font-[900] text-[24px] tracking-tighter text-slate-900 leading-tight truncate">架電リスト管理</span>
            <span className="text-[8px] font-extrabold text-[#94A3B8] uppercase tracking-[0.05em] truncate mt-1">CALL MANAGEMENT SYSTEM</span>
          </div>
        </div>

        <div className="px-6 py-4">
          <div className="text-[10px] font-bold text-[#94A3B8] uppercase tracking-[0.2em] mb-3 ml-1">BRANCH</div>
          <div className="bg-[#F1F5F9] p-1 rounded-[14px] flex border border-slate-100">
            {['EAST', 'WEST', 'ATOM'].map(r => (
              <button key={r} onClick={() => { setRegion(r); localStorage.setItem('cm_region', r); setRecords([]); switchTab(1); }}
                className={`flex-1 py-1.5 rounded-[10px] text-[10px] font-black transition-all ${region === r ? 'bg-white text-[#4F46E5] shadow-sm' : 'text-[#94A3B8] hover:text-slate-600'}`}>
                {r}
              </button>
            ))}
          </div>
        </div>

        <nav className="flex-1 px-4 space-y-1 mt-4">
          <div className="pb-2 px-3 text-[10px] font-bold text-[#94A3B8] uppercase tracking-[0.2em]">LIST MENU</div>
          <NavItem icon={<MapPin size={18} />}      label="アポ"     active={activeTab === 1} onClick={() => switchTab(1)} count={tabCounts.apo} />
          <NavItem icon={<Phone size={18} />}       label="フォロー１" active={activeTab === 2} onClick={() => switchTab(2)} count={tabCounts.f1} />
          <NavItem icon={<Phone size={18} />}       label="フォロー２" active={activeTab === 3} onClick={() => switchTab(3)} count={tabCounts.f2} />
          <NavItem icon={<Phone size={18} />}       label="フォロー３" active={activeTab === 4} onClick={() => switchTab(4)} count={tabCounts.f3} />
          <NavItem icon={<CheckCircle2 size={18} />} label="完了済み"  active={activeTab === 5} onClick={() => switchTab(5)} count={tabCounts.done} />
        </nav>

        <div className="p-6 mt-auto border-t border-slate-100">
          <button onClick={() => { setToken(null); localStorage.removeItem('gtoken'); localStorage.removeItem('gtoken_expiry'); }}
            className="w-full flex items-center justify-center gap-2 text-sm font-bold text-[#94A3B8] hover:text-rose-500 transition-all py-3 rounded-xl hover:bg-rose-50">
            <LogOut size={18} /> ログアウト
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="ml-64 flex-1 p-8 pb-32">
        <header className="flex items-center justify-between mb-10 flex-wrap gap-y-4">
          <div className="flex items-center gap-6">
            <div>
              <h1 className="text-3xl font-[900] tracking-tight text-slate-900 mb-1 whitespace-nowrap">
                {['', 'アポ', 'フォロー１', 'フォロー２', 'フォロー３', '完了済み'][activeTab]}
              </h1>
              <div className="flex items-center gap-2">
                <span className={`flex h-1.5 w-1.5 rounded-full ${loading ? 'bg-amber-500' : 'bg-emerald-500'} animate-pulse`}></span>
                <span className="text-[9px] font-bold text-[#94A3B8] uppercase tracking-widest">
                  {loading ? 'Syncing...' : 'Live Sync Active'} · {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-2 border-l border-slate-200 pl-8 h-10">
              <StatBadge label="TOTAL" value={counts.total} color="bg-[#0F172A] text-white shadow-md shadow-slate-200" />
              <StatBadge label="A" value={counts.A} color={`${TYPE_COLORS.A.bg} ${TYPE_COLORS.A.text}`} />
              <StatBadge label="B" value={counts.B} color={`${TYPE_COLORS.B.bg} ${TYPE_COLORS.B.text}`} />
              <StatBadge label="C" value={counts.C} color={`${TYPE_COLORS.C.bg} ${TYPE_COLORS.C.text}`} />
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
                onClick={() => { setModalRecord(r); setForm(EMPTY_FORM); }}
                onLstep={() => setLstepConfirm({ url: r.lstepUrl, account: r.account, lineId: accountIdMap[r.account] || null })}
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
                      <a href={`https://docs.google.com/spreadsheets/d/${SS_IDS[region]}/edit#gid=${sheetGid}&range=A${modalRecord.rowIndex}`}
                        target="_blank" rel="noopener noreferrer"
                        className="text-[10px] bg-emerald-50 border border-emerald-200 text-emerald-700 px-2.5 py-1 rounded-lg font-black hover:bg-emerald-100 transition-colors">
                        シートで開く ↗
                      </a>
                    )}
                  </div>
                  <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                    <span className={`text-[10px] font-black px-2.5 py-1 rounded-lg border ${TYPE_COLORS[modalRecord.type]?.bg} ${TYPE_COLORS[modalRecord.type]?.text} ${TYPE_COLORS[modalRecord.type]?.border}`}>{modalRecord.type}</span>
                    <span className="text-sm font-bold text-[#94A3B8]">{modalRecord.clinic} / {modalRecord.account}</span>
                    {modalRecord.naContent && (
                      <span className={`text-[10px] font-black px-2.5 py-1 rounded-lg border ${NA_CONTENT_COLORS[modalRecord.naContent]?.bg} ${NA_CONTENT_COLORS[modalRecord.naContent]?.text} ${NA_CONTENT_COLORS[modalRecord.naContent]?.border}`}>
                        現在: {modalRecord.naContent}
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <button onClick={() => setModalRecord(null)} className="p-3 hover:bg-slate-100 rounded-full transition-all text-slate-400 flex-shrink-0"><X size={22} /></button>
            </div>

            {/* Modal Body */}
            <div className="p-8 pt-5 overflow-y-auto flex-1 space-y-6 custom-scrollbar">

              {/* 架電結果 */}
              <div>
                <div className={sectionHeadCls}>架電結果 *</div>
                <div className="grid grid-cols-3 gap-3 mb-4">
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
                <div className="grid grid-cols-2 gap-3 mb-3">
                  <div>
                    <label className={labelCls}>対応チーム</label>
                    <input value={form.team} onChange={e => setField("team", e.target.value)} className={inputCls} placeholder="チーム名" />
                  </div>
                  <div>
                    <label className={labelCls}>初回対応日</label>
                    <input type="date" value={form.initialResponseDate} onChange={e => setField("initialResponseDate", e.target.value)} className={inputCls} />
                  </div>
                </div>
                <p className="text-[10px] text-slate-400 mb-3">※ 対応開始日は結果登録時に自動入力されます（未入力時のみ）</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={labelCls}>対応者①</label>
                    <input value={form.assignee1} onChange={e => setField("assignee1", e.target.value)} className={inputCls} placeholder="担当者名" />
                  </div>
                  <div>
                    <label className={labelCls}>対応者②</label>
                    <input value={form.assignee2} onChange={e => setField("assignee2", e.target.value)} className={inputCls} placeholder="担当者名" />
                  </div>
                </div>
              </div>

              {/* 解約関連 */}
              <div>
                <div className={sectionHeadCls}>解約関連</div>
                <div className="mb-3">
                  <label className={labelCls}>解約阻止日</label>
                  <input type="date" value={form.cancelStopDate} onChange={e => setField("cancelStopDate", e.target.value)} className={inputCls} />
                </div>
                <div className="mb-3">
                  <label className={labelCls}>解約処理</label>
                  <button
                    type="button"
                    onClick={() => setField("cancelProcess", !form.cancelProcess)}
                    className={`w-full py-3 rounded-[14px] text-sm font-bold border-2 transition-all ${form.cancelProcess ? 'bg-rose-500 text-white border-rose-500 shadow-lg' : 'bg-white border-slate-100 text-slate-600 hover:border-rose-300'}`}
                  >
                    {form.cancelProcess ? '解約処理する ✓' : '解約処理する'}
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-3 mb-3">
                  <div>
                    <label className={labelCls}>損害金見込み</label>
                    <input type="number" value={form.refundAmount} onChange={e => setField("refundAmount", e.target.value)} className={inputCls} placeholder="0" />
                  </div>
                  <div>
                    <label className={labelCls}>着地の損害金</label>
                    <input type="number" value={form.landingAmount} onChange={e => setField("landingAmount", e.target.value)} className={inputCls} placeholder="0" />
                  </div>
                </div>
                <div className="mb-3">
                  <label className={labelCls}>ラッカルURL</label>
                  <input value={form.laccarURL} onChange={e => setField("laccarURL", e.target.value)} className={inputCls} placeholder="https://..." />
                </div>
                <div className="flex gap-6">
                  <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
                    <input type="checkbox" checked={form.vip} onChange={e => setField("vip", e.target.checked)} className="w-4 h-4 rounded accent-indigo-600" /> VIP
                  </label>
                  <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
                    <input type="checkbox" checked={form.ltvReservation} onChange={e => setField("ltvReservation", e.target.checked)} className="w-4 h-4 rounded accent-indigo-600" /> LTV予約
                  </label>
                </div>
              </div>

              {/* 予約・来店・契約 */}
              <div>
                <div className={sectionHeadCls}>予約・来店・契約</div>
                <div className="grid grid-cols-2 gap-3 mb-3">
                  <div>
                    <label className={labelCls}>予約獲得日</label>
                    <input type="date" value={form.reservationDate} onChange={e => setField("reservationDate", e.target.value)} className={inputCls} />
                  </div>
                  <div>
                    <label className={labelCls}>予約院</label>
                    <input value={form.reservationClinic} onChange={e => setField("reservationClinic", e.target.value)} className={inputCls} placeholder="クリニック名" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3 mb-3">
                  <div>
                    <label className={labelCls}>予約日</label>
                    <input type="date" value={form.reservationDay} onChange={e => setField("reservationDay", e.target.value)} className={inputCls} />
                  </div>
                  <div>
                    <label className={labelCls}>予約時間</label>
                    <input type="time" value={form.reservationTime} onChange={e => setField("reservationTime", e.target.value)} className={inputCls} />
                  </div>
                </div>
                <div className="mb-3">
                  <label className={labelCls}>希望施術</label>
                  <input value={form.desiredTreatment} onChange={e => setField("desiredTreatment", e.target.value)} className={inputCls} placeholder="施術名" />
                </div>
                <div className="flex gap-6 mb-3">
                  <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
                    <input type="checkbox" checked={form.visit} onChange={e => setField("visit", e.target.checked)} className="w-4 h-4 rounded accent-indigo-600" /> 来店
                  </label>
                  <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
                    <input type="checkbox" checked={form.contract} onChange={e => setField("contract", e.target.checked)} className="w-4 h-4 rounded accent-indigo-600" /> 契約
                  </label>
                </div>
                {form.contract && (
                  <>
                    <div className="mb-3">
                      <label className={labelCls}>契約内容</label>
                      <input value={form.contractContent} onChange={e => setField("contractContent", e.target.value)} className={inputCls} placeholder="施術・コース名" />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className={labelCls}>契約金額①</label>
                        <input type="number" value={form.contractAmount1} onChange={e => setField("contractAmount1", e.target.value)} className={inputCls} placeholder="0" />
                      </div>
                      <div>
                        <label className={labelCls}>契約金額②</label>
                        <input type="number" value={form.contractAmount2} onChange={e => setField("contractAmount2", e.target.value)} className={inputCls} placeholder="0" />
                      </div>
                    </div>
                  </>
                )}
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
            <div className="bg-[#EEF2FF] text-[#4F46E5] font-[900] py-4 rounded-[18px] mb-2 text-base border border-indigo-100">{lstepConfirm.account}</div>
            {lstepConfirm.lineId && (
              <div className="bg-[#F5F3FF] text-[#6D28D9] font-[900] py-2 rounded-[14px] mb-6 text-sm border border-purple-100">{lstepConfirm.lineId}</div>
            )}
            {!lstepConfirm.lineId && <div className="mb-6"></div>}
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
    <button onClick={onClick} className={`w-full flex items-center justify-between px-4 py-3.5 rounded-[16px] transition-all ${active ? "bg-[#4F46E5] text-white shadow-xl shadow-indigo-100 font-bold scale-[1.02]" : "text-[#64748B] hover:bg-slate-50 hover:text-slate-900"}`}>
      <div className="flex items-center gap-3">{icon}<span className="text-[13px] tracking-tight font-bold">{label}</span></div>
      {count !== undefined && (
        <span className={`text-[11px] font-black px-2 py-0.5 rounded-[8px] ${active ? "bg-white/20 text-white" : "bg-[#F1F5F9] text-[#64748B]"}`}>{count}</span>
      )}
    </button>
  );
}

function StatBadge({ label, value, color }) {
  return (
    <div className={`flex items-center gap-2 px-4 py-2 rounded-[14px] ${color} min-w-[70px] justify-center`}>
      <span className="text-[11px] font-[800] opacity-70 tracking-widest">{label}</span>
      <span className="text-[15px] font-[900]">{value}</span>
    </div>
  );
}

function RecordCard({ record, isDuplicate, onClick, onLstep, onSharedMemoSave }) {
  const naColor = NA_CONTENT_COLORS[record.naContent] || { bg: "bg-[#F1F5F9]", text: "text-[#64748B]", border: "border-[#E2E8F0]" };
  const naLabel = record.naContent || "未設定";

  return (
    <div
      className={`p-5 rounded-[28px] border hover:shadow-xl transition-all cursor-pointer flex items-center gap-8 group ${isDuplicate ? 'bg-[#FFF5F5] border-[#FCA5A5] hover:border-red-400' : 'bg-white border-slate-200 hover:border-indigo-400 hover:shadow-indigo-50/20'}`}
      onClick={onClick}
    >
      <div className={`w-16 h-14 rounded-[18px] flex items-center justify-center font-[900] text-[11px] flex-shrink-0 border text-center px-1 ${naColor.bg} ${naColor.text} ${naColor.border}`}>
        {naLabel}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-3 mb-1.5 flex-wrap">
          <span className={`text-[17px] font-[800] tracking-tight truncate ${isDuplicate ? 'text-red-700' : 'text-slate-900'}`}>{record.name}</span>
          {isDuplicate && <span className="text-[9px] bg-red-100 text-red-600 border border-red-200 px-2 py-0.5 rounded-lg font-black">重複</span>}
          {record.lstepUrl && (
            <button onClick={e => { e.stopPropagation(); onLstep(); }}
              className="text-[10px] bg-[#ECFDF5] text-[#059669] border border-[#A7F3D0] px-3 py-1 rounded-[10px] font-black hover:bg-[#A7F3D0] transition-colors shadow-sm">
              Lステ  ↗
            </button>
          )}
          {record.type && (
            <span className={`text-[10px] px-3 py-1 rounded-[10px] font-black ${TYPE_COLORS[record.type]?.bg} ${TYPE_COLORS[record.type]?.text} border ${TYPE_COLORS[record.type]?.border}`}>{record.type}</span>
          )}
          {record.account && <span className="text-[10px] bg-[#F1F5F9] text-[#64748B] px-3 py-1 rounded-[10px] font-black border border-slate-200">{record.account}</span>}
          {record.content && <span className="text-[10px] bg-[#EEF2FF] text-[#4F46E5] px-3 py-1 rounded-[10px] font-black border border-indigo-100">{record.content}</span>}
        </div>
        <div className="text-[13px] text-[#64748B] flex items-center gap-2 font-medium">
          <MessageSquare size={14} className="opacity-40 flex-shrink-0" />
          <span className="truncate max-w-[420px]">{record.memo || "メモはありません"}</span>
        </div>

        {/* 共有メモ（スプレッドシート保存） */}
        <div className="mt-2.5" onClick={e => e.stopPropagation()}>
          <input
            key={record.id + (record.sharedMemo || '')}
            defaultValue={record.sharedMemo || ''}
            onBlur={e => { if(e.target.value !== (record.sharedMemo || '')) onSharedMemoSave(e.target.value); }}
            placeholder="共有メモ（全員に見れます・自動保存）"
            className="w-full bg-sky-50/50 border border-sky-100 rounded-lg px-3 py-1.5 text-[11px] text-sky-900 placeholder:text-sky-300 focus:outline-none focus:bg-sky-50 focus:border-sky-200 transition-all"
          />
        </div>

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
          <Calendar size={13} /> {record.date}{record.time ? ` ${record.time}` : ''}
        </div>
        <button className="flex items-center gap-2 px-5 py-2.5 bg-[#0F172A] text-white rounded-[14px] text-xs font-black shadow-lg group-hover:bg-[#4F46E5] transition-all active:scale-95">
          結果入力 <ChevronRight size={13} />
        </button>
      </div>
    </div>
  );
}
