import { useState, useEffect } from "react";

const CLIENT_ID = "87533023495-hdt3pp8ujq3p60ptgl66nqaesnli802v.apps.googleusercontent.com";
const SS_IDS = {
  EAST: "1aU5_kB3GJx4EmdcgkZ71pJseQoscv0xY502fiW1LVI0",
  WEST: "1y0nCiLHCnIQKb8BcoUjYTiIcqUGdjRYnSFMvk1jBuhY",
};
const SHEET = 'Lステ連携';
const DEFAULT_RESULT_COL_IDX = 22; // デフォルトW列（自動検出できなかった場合のフォールバック）
const idxToCol = (idx) => {
  let s = '', n = idx + 1;
  while (n > 0) { const r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = Math.floor((n - 1) / 26); }
  return s;
};

const countCalls = (text) => {
  if (!text) return 0;
  return (text.match(/架電[①②③]/g) || []).length;
};

const parseCallLogs = (text) => {
  if (!text) return [];
  return text.split('\n').filter(l => l.trim()).reduce((acc, line) => {
    const m = line.match(/架電([①②③])\s*(.+)/);
    if (m) acc.push({ round: {'①':1,'②':2,'③':3}[m[1]]||1, result: m[2].trim(), note: '', date: '' });
    return acc;
  }, []);
};

const extractType = (level) => {
  const m = level.match(/【阻止T】([ABC])/);
  return m ? m[1] : null;
};

// ヘッダー行からキーワードで列インデックスを検出
const detectCol = (values, keywords, fallback) => {
  for (let ri = 0; ri <= 2 && ri < values.length; ri++) {
    const row = values[ri];
    const found = row.findIndex(cell => cell && keywords.some(kw => cell.toString().includes(kw)));
    if (found !== -1) return found;
  }
  return fallback;
};

// excludeKeywordsを含む列を除外して検出
const detectColExclude = (values, keywords, excludeKeywords, fallback) => {
  for (let ri = 0; ri <= 2 && ri < values.length; ri++) {
    const row = values[ri];
    const found = row.findIndex(cell =>
      cell &&
      keywords.some(kw => cell.toString().includes(kw)) &&
      !excludeKeywords.some(ex => cell.toString().includes(ex))
    );
    if (found !== -1) return found;
  }
  return fallback;
};

// データ行から阻止T列を検出（ヘッダーではなく値でスキャン）
const detectLevelCol = (values, fallback) => {
  for (let i = 3; i < Math.min(values.length, 30); i++) {
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
    const callCount = countCalls(callResultRaw);
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
      callCount,
      callLogs: parseCallLogs(callResultRaw),
      completed: get(cols.completed).toUpperCase() === 'TRUE',
      cancelStopDate: get(cols.cancelStopDate),
      cancelDate: get(cols.cancelDate),
    });
  }
  return result;
};

const TYPE_COLORS = {
  A: { bg: "#FEE2E2", text: "#991B1B" },
  B: { bg: "#FEF3C7", text: "#92400E" },
  C: { bg: "#D1FAE5", text: "#065F46" },
};

const RESULT_OPTIONS = ["不在", "折り返し待ち", "対応中", "解決済み", "再架電不要"];
const TERMINAL_RESULTS = ["対応中", "解決済み", "再架電不要"];
const BADGE_COLORS = {
  "クレーム": { bg: "#FEE2E2", text: "#991B1B" },
  "キャンセル(クレーム)": { bg: "#FEF3C7", text: "#92400E" },
  "キャンセル・CO": { bg: "#E0E7FF", text: "#3730A3" },
};

const EMPTY_FORM = {
  result: "",
  note: "",
  team: "",
  firstResponseDate: "",
  assignee1: "",
  assignee2: "",
  cancelStopDate: "",
  refundAmount: "",
  landingAmount: "",
  cancelDate: "",
  laccarURL: "",
  template: "",
  vip: false,
  ltvReservation: false,
  reservationDate: "",
  reservationClinic: "",
  reservationDay: "",
  reservationTime: "",
  desiredTreatment: "",
  visit: false,
  contract: false,
  contractContent: "",
  contractAmount1: "",
  contractAmount2: "",
  refusalMenu: "",
  refusalReasonCount: "",
  refusalReasonSub: "",
  freeNotes: "",
};

const inputStyle = {
  width: "100%", background: "#F9FAFB", border: "1px solid #E5E7EB",
  borderRadius: 8, padding: "8px 12px", color: "#1F2937", fontSize: 13,
  outline: "none", boxSizing: "border-box", fontFamily: "'Noto Sans JP', sans-serif",
};

const labelStyle = { fontSize: 12, color: "#6B7280", marginBottom: 4, display: "block", fontWeight: 500 };
const sectionStyle = { marginBottom: 20 };
const sectionTitleStyle = {
  fontSize: 12, fontWeight: 700, color: "#4F46E5", background: "#EEF2FF",
  borderRadius: 6, padding: "4px 10px", marginBottom: 12, display: "inline-block",
};
const rowStyle = { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 };

export default function App() {
  return <CallManager />;
}

function CallManager() {
  const [token, setToken] = useState(() => {
    const t = localStorage.getItem('gtoken');
    const exp = localStorage.getItem('gtoken_expiry');
    if (t && exp && Date.now() < parseInt(exp)) return t;
    localStorage.removeItem('gtoken');
    localStorage.removeItem('gtoken_expiry');
    return null;
  });
  const [records, setRecords] = useState([]);
  const [cols, setCols] = useState({ date:0, name:3, clinic:5, account:6, content:7, memo:8, assignee:11, level:12, result:DEFAULT_RESULT_COL_IDX, completed:13, lstep:-1 });
  const [sheetGid, setSheetGid] = useState(null);
  const [region, setRegion] = useState('EAST');
  const ssId = SS_IDS[region];
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState(1);
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [toast, setToast] = useState(null);
  const [lstepConfirm, setLstepConfirm] = useState(null); // { url, account, lineId }
  const [accountIdMap, setAccountIdMap] = useState({});
  const [chatOpen, setChatOpen] = useState(false);
  const [chatMessages, setChatMessages] = useState([]);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);

  // PKCEコード交換（リダイレクト後）
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    if (!code) return;
    const verifier = sessionStorage.getItem('pkce_verifier');
    if (!verifier) return;
    sessionStorage.removeItem('pkce_verifier');
    window.history.replaceState(null, '', window.location.pathname);
    setLoading(true);
    const redirectUri = window.location.origin + '/';
    fetch('/api/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, code_verifier: verifier, redirect_uri: redirectUri }),
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
      const redirectUri = window.location.origin + '/';
      const p = new URLSearchParams({
        client_id: CLIENT_ID,
        redirect_uri: redirectUri,
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

  useEffect(() => {
    if (!token) return;
    setLoading(true);
    setError(null);
    const range = encodeURIComponent(`${SHEET}!A:AZ`);
    fetch(`https://sheets.googleapis.com/v4/spreadsheets/${ssId}?fields=sheets.properties`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.json())
      .then(data => {
        const sheet = (data.sheets || []).find(s => s.properties?.title === SHEET);
        if (sheet) setSheetGid(sheet.properties.sheetId);
      })
      .catch(() => {});
    // 各アカウント一覧シートから@IDマッピングを取得
    const accountRange = encodeURIComponent('各アカウント一覧!A:Z');
    fetch(`https://sheets.googleapis.com/v4/spreadsheets/${ssId}/values/${accountRange}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.json())
      .then(data => {
        if (data.error || !data.values) return;
        const map = {};
        data.values.forEach(row => {
          const atIdx = row.findIndex(cell => cell && cell.toString().trim().startsWith('@'));
          if (atIdx === -1) return;
          const lineId = row[atIdx].toString().trim();
          // @IDより前の列のみをアカウント名として登録（後ろの「広告など」列は除外）
          for (let idx = 0; idx < atIdx; idx++) {
            const name = (row[idx] || '').toString().trim();
            if (name) map[name] = lineId;
          }
        });
        setAccountIdMap(map);
      })
      .catch(() => {});

    fetch(`https://sheets.googleapis.com/v4/spreadsheets/${ssId}/values/${range}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.json())
      .then(data => {
        if (data.error) throw new Error(data.error.message);
        const values = data.values || [];
        const detectedCols = {
          date:      detectCol(values, ['日付'], 0),
          name:      detectCol(values, ['名前', '顧客名'], 3),
          clinic:    detectCol(values, ['クリニック', '院'], 5),
          account:   detectCol(values, ['アカウント'], 6),
          content:   detectCol(values, ['内容', 'コンテンツ'], 7),
          memo:      detectCol(values, ['備考', 'メモ'], 8),
          assignee:  detectCol(values, ['担当者', '対応者'], 11),
          level:     detectLevelCol(values, 12),
          result:          detectCol(values, ['架電結果'], DEFAULT_RESULT_COL_IDX),
          completed:       detectCol(values, ['対応完了'], 13),
          lstep:           detectCol(values, ['Lステップ'], -1),
          cancelStopDate:  detectCol(values, ['解約阻止'], -1),
          cancelDate:      detectColExclude(values, ['解約'], ['阻止'], -1),
        };
        setCols(detectedCols);
        setRecords(parseSheetRows(values, detectedCols));
        setLoading(false);
      })
      .catch(e => {
        setError(e.message);
        setLoading(false);
      });
  }, [token, region]);

  const isTerminal = (r) => r.callLogs.some(l => TERMINAL_RESULTS.includes(l.result));
  const isDealDone = (r) => !!(r.cancelStopDate || r.cancelDate);
  const filtered = (count) => records.filter(r => r.callCount === count - 1 && count <= 3 && !isTerminal(r) && !isDealDone(r));
  const completed = records.filter(r => r.callCount >= 3 || isTerminal(r) || isDealDone(r));

  const openModal = (id) => { setModal({ id }); setForm(EMPTY_FORM); };
  const closeModal = () => setModal(null);
  const setField = (key, val) => setForm(f => ({ ...f, [key]: val }));

  const handleSubmit = async () => {
    if (!form.result) return;
    const today = new Date().toLocaleDateString("ja-JP");
    const terminal = TERMINAL_RESULTS.includes(form.result);
    const callNum = ['①', '②', '③'][rec.callCount] || '③';
    const newLine = terminal
      ? `${form.result}${form.note ? ' ' + form.note : ''}`
      : `架電${callNum} ${form.result}${form.note ? ' ' + form.note : ''}`;
    const newRaw = rec.callResultRaw ? `${rec.callResultRaw}\n${newLine}` : newLine;

    const willComplete = terminal || rec.callCount >= 2;
    try {
      const range = encodeURIComponent(`${SHEET}!${idxToCol(cols.result)}${rec.rowIndex}`);
      const res = await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${ssId}/values/${range}?valueInputOption=USER_ENTERED`,
        {
          method: 'PUT',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ values: [[newRaw]] }),
        }
      );
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error?.message || '書き込み失敗');
      }
      if (willComplete) {
        const compRange = encodeURIComponent(`${SHEET}!${idxToCol(cols.completed)}${rec.rowIndex}`);
        await fetch(
          `https://sheets.googleapis.com/v4/spreadsheets/${ssId}/values/${compRange}?valueInputOption=USER_ENTERED`,
          {
            method: 'PUT',
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ values: [['TRUE']] }),
          }
        );
      }
    } catch (e) {
      showToast(`エラー: ${e.message}`);
      return;
    }

    setRecords(prev => prev.map(r => {
      if (r.id !== modal.id) return r;
      return {
        ...r,
        callResultRaw: newRaw,
        callCount: terminal ? r.callCount : r.callCount + 1,
        callLogs: [...r.callLogs, { round: r.callCount + 1, result: form.result, note: form.note, date: today }]
      };
    }));
    showToast("架電結果を記録しました");
    closeModal();
  };

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(null), 3000); };

  const sendChat = async () => {
    const text = chatInput.trim();
    if (!text || chatLoading) return;
    const newMessages = [...chatMessages, { role: 'user', content: text }];
    setChatMessages(newMessages);
    setChatInput('');
    setChatLoading(true);
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: newMessages }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setChatMessages(prev => [...prev, { role: 'assistant', content: data.content }]);
    } catch (e) {
      setChatMessages(prev => [...prev, { role: 'assistant', content: `エラー: ${e.message}` }]);
    } finally {
      setChatLoading(false);
    }
  };

  const rec = modal ? records.find(r => r.id === modal.id) : null;
  const tabData = [
    { label: "1回目", count: filtered(1).length },
    { label: "2回目", count: filtered(2).length },
    { label: "3回目", count: filtered(3).length },
    { label: "完了", count: completed.length },
  ];
  const listToShow = activeTab <= 3 ? filtered(activeTab) : completed;

  // 全レコード中で名前が重複しているものをセット化
  const nameCounts = records.reduce((acc, r) => { acc[r.name] = (acc[r.name] || 0) + 1; return acc; }, {});
  const duplicateNames = new Set(Object.keys(nameCounts).filter(n => nameCounts[n] > 1));

  // ─── Login Screen ───────────────────────────────────────────────────────────
  if (!token) {
    return (
      <div style={{ minHeight: "100vh", background: "#F8F9FA", fontFamily: "'Noto Sans JP', sans-serif", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@400;500;700&family=Space+Grotesk:wght@600;700&display=swap" rel="stylesheet" />
        <div style={{ background: "#fff", border: "1px solid #E5E7EB", borderRadius: 20, padding: "48px 40px", textAlign: "center", boxShadow: "0 8px 32px rgba(0,0,0,0.08)", maxWidth: 380, width: "100%" }}>
          <div style={{ width: 56, height: 56, borderRadius: 16, background: "linear-gradient(135deg, #6366F1, #8B5CF6)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 28, margin: "0 auto 20px" }}>📞</div>
          <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 22, fontWeight: 700, marginBottom: 6 }}>架電リスト管理</div>
          <div style={{ fontSize: 13, color: "#6B7280", marginBottom: 32 }}>Googleアカウントでログインしてください</div>
          {error && <div style={{ color: "#EF4444", fontSize: 13, marginBottom: 16 }}>{error}</div>}
          <button onClick={login} style={{
            width: "100%", background: "#fff", border: "1px solid #E5E7EB", borderRadius: 10,
            padding: "12px 20px", fontSize: 15, fontWeight: 600, cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
            transition: "border-color 0.15s, box-shadow 0.15s",
          }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = "#6366F1"; e.currentTarget.style.boxShadow = "0 0 0 3px #EEF2FF"; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = "#E5E7EB"; e.currentTarget.style.boxShadow = "none"; }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
            Googleでログイン
          </button>
        </div>
      </div>
    );
  }

  // ─── Main App ────────────────────────────────────────────────────────────────
  return (
    <div style={{ minHeight: "100vh", background: "#F8F9FA", fontFamily: "'Noto Sans JP', sans-serif", color: "#1F2937" }}>
      <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@400;500;700&family=Space+Grotesk:wght@600;700&display=swap" rel="stylesheet" />

      {/* Header */}
      <div style={{ borderBottom: "1px solid #E5E7EB", background: "#fff", padding: "20px 32px", display: "flex", alignItems: "center", gap: 16 }}>
        <div style={{ width: 36, height: 36, borderRadius: 10, background: "linear-gradient(135deg, #6366F1, #8B5CF6)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>📞</div>
        <div>
          <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 18, fontWeight: 700, letterSpacing: "-0.02em" }}>架電リスト管理</div>
          <div style={{ fontSize: 12, color: "#6B7280" }}>Call Management System</div>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 16 }}>
          <div style={{ display: "flex", background: "#F3F4F6", borderRadius: 8, padding: 3, gap: 2 }}>
            {['EAST', 'WEST'].map(r => (
              <button key={r} onClick={() => { setRegion(r); setRecords([]); setActiveTab(1); }} style={{
                background: region === r ? "#fff" : "transparent",
                border: "none", borderRadius: 6, padding: "4px 12px",
                fontSize: 12, fontWeight: 700, cursor: "pointer",
                color: region === r ? "#4F46E5" : "#6B7280",
                boxShadow: region === r ? "0 1px 3px rgba(0,0,0,0.1)" : "none",
                transition: "all 0.15s"
              }}>{r}</button>
            ))}
          </div>
          <div style={{ fontSize: 13, color: "#6B7280" }}>総件数: <span style={{ color: "#1F2937", fontWeight: 600 }}>{records.length}</span></div>
          <button onClick={() => { setToken(null); localStorage.removeItem('gtoken'); localStorage.removeItem('gtoken_expiry'); }} style={{ background: "#F3F4F6", border: "none", borderRadius: 8, padding: "6px 12px", fontSize: 12, color: "#6B7280", cursor: "pointer" }}>ログアウト</button>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 0, borderBottom: "1px solid #E5E7EB", padding: "0 32px", background: "#fff" }}>
        {tabData.map((t, i) => (
          <button key={i} onClick={() => setActiveTab(i + 1)} style={{
            background: "none", border: "none", cursor: "pointer",
            padding: "14px 24px", fontSize: 14, fontWeight: 500,
            color: activeTab === i + 1 ? "#4F46E5" : "#6B7280",
            borderBottom: activeTab === i + 1 ? "2px solid #4F46E5" : "2px solid transparent",
            transition: "all 0.15s", display: "flex", alignItems: "center", gap: 8
          }}>
            {t.label}
            <span style={{
              background: activeTab === i + 1 ? "#EEF2FF" : "#F3F4F6",
              color: activeTab === i + 1 ? "#4F46E5" : "#9CA3AF",
              borderRadius: 20, padding: "2px 8px", fontSize: 12, fontWeight: 700
            }}>{t.count}</span>
          </button>
        ))}
      </div>

      {/* List */}
      <div style={{ padding: "24px 32px", maxWidth: 900, margin: "0 auto" }}>
        {loading ? (
          <div style={{ textAlign: "center", padding: "60px 0", color: "#6B7280" }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>⏳</div>
            <div style={{ fontSize: 15 }}>スプレッドシートを読み込み中...</div>
          </div>
        ) : error ? (
          <div style={{ textAlign: "center", padding: "60px 0", color: "#EF4444" }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>⚠️</div>
            <div style={{ fontSize: 15 }}>読み込みエラー: {error}</div>
          </div>
        ) : listToShow.length === 0 ? (
          <div style={{ textAlign: "center", padding: "60px 0", color: "#9CA3AF" }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>✓</div>
            <div style={{ fontSize: 16 }}>このリストに案件はありません</div>
          </div>
        ) : listToShow.map(r => {
          const badge = BADGE_COLORS[r.content] || { bg: "#F3F4F6", text: "#6B7280" };
          const isDup = duplicateNames.has(r.name);
          return (
            <div key={r.id} style={{
              background: isDup ? "#FFF5F5" : "#fff",
              border: `1px solid ${isDup ? "#FCA5A5" : "#E5E7EB"}`,
              borderRadius: 14,
              padding: "18px 22px", marginBottom: 12, display: "flex", alignItems: "center", gap: 18,
              transition: "border-color 0.15s",
              boxShadow: isDup ? "0 1px 6px rgba(239,68,68,0.15)" : "0 1px 3px rgba(0,0,0,0.05)",
            }}
              onMouseEnter={e => e.currentTarget.style.borderColor = isDup ? "#F87171" : "#A5B4FC"}
              onMouseLeave={e => e.currentTarget.style.borderColor = isDup ? "#FCA5A5" : "#E5E7EB"}
            >
              <div style={{
                width: 40, height: 40, borderRadius: 10, flexShrink: 0,
                background: r.callCount === 0 ? "linear-gradient(135deg,#DBEAFE,#BFDBFE)" : r.callCount === 1 ? "linear-gradient(135deg,#EDE9FE,#DDD6FE)" : "linear-gradient(135deg,#D1FAE5,#A7F3D0)",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 15, fontWeight: 700, color: r.callCount === 0 ? "#1D4ED8" : r.callCount === 1 ? "#6D28D9" : "#065F46"
              }}>
                {r.callCount + 1}回
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
                  <span style={{ fontSize: 16, fontWeight: 700 }}>{r.name}</span>
                  {r.lstepUrl && (
                    <button onClick={e => { e.stopPropagation(); setLstepConfirm({ url: r.lstepUrl, account: r.account, lineId: accountIdMap[r.account] || null }); }} style={{
                      fontSize: 11, background: "#F0FDF4", border: "1px solid #86EFAC", color: "#15803D",
                      borderRadius: 6, padding: "2px 8px", cursor: "pointer", fontWeight: 600,
                    }}>Lステップ↗</button>
                  )}
                  {r.type && (() => { const c = TYPE_COLORS[r.type] || { bg: "#F3F4F6", text: "#6B7280" }; return (
                    <span style={{ fontSize: 12, background: c.bg, color: c.text, borderRadius: 6, padding: "2px 8px", fontWeight: 700 }}>{r.type}</span>
                  ); })()}
                  {r.account && <span style={{ fontSize: 12, background: "#EFF6FF", color: "#1D4ED8", borderRadius: 6, padding: "2px 8px" }}>{r.account}</span>}
                  <span style={{ fontSize: 11, borderRadius: 6, padding: "2px 8px", background: badge.bg, color: badge.text }}>{r.content}</span>
                </div>
                <div style={{ fontSize: 13, color: "#6B7280", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.memo}</div>
                {r.callLogs.length > 0 && (
                  <div style={{ marginTop: 6, display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {r.callLogs.map((l, idx) => (
                      <span key={idx} style={{ fontSize: 11, background: "#F9FAFB", border: "1px solid #E5E7EB", borderRadius: 6, padding: "2px 8px", color: "#6B7280" }}>
                        {l.round}回目: {l.result}
                      </span>
                    ))}
                  </div>
                )}
              </div>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 8, flexShrink: 0 }}>
                <span style={{ fontSize: 12, color: "#9CA3AF" }}>{r.date}</span>
                {activeTab <= 3 && (
                  <button onClick={() => openModal(r.id)} style={{
                    background: "linear-gradient(135deg, #4F46E5, #7C3AED)", border: "none", cursor: "pointer",
                    color: "#fff", borderRadius: 8, padding: "7px 16px", fontSize: 13, fontWeight: 600,
                    letterSpacing: "-0.01em", transition: "opacity 0.15s"
                  }}
                    onMouseEnter={e => e.currentTarget.style.opacity = "0.85"}
                    onMouseLeave={e => e.currentTarget.style.opacity = "1"}
                  >
                    架電結果を入力 →
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Modal */}
      {modal && rec && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100, padding: 24 }}
          onClick={closeModal}>
          <div style={{ background: "#fff", border: "1px solid #E5E7EB", borderRadius: 20, width: "100%", maxWidth: 640, maxHeight: "90vh", display: "flex", flexDirection: "column", boxShadow: "0 20px 60px rgba(0,0,0,0.15)" }}
            onClick={e => e.stopPropagation()}>

            {/* Modal Header */}
            <div style={{ padding: "24px 28px 16px", borderBottom: "1px solid #E5E7EB", flexShrink: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 2 }}>
                <div style={{ fontSize: 18, fontWeight: 700 }}>{rec.name}</div>
                <a
                  href={`https://docs.google.com/spreadsheets/d/${ssId}/edit${sheetGid !== null ? `#gid=${sheetGid}&range=A${rec.rowIndex}` : ''}`}
                  target="_blank" rel="noopener noreferrer"
                  style={{ fontSize: 11, background: "#F0FDF4", border: "1px solid #86EFAC", color: "#15803D", borderRadius: 6, padding: "2px 8px", textDecoration: "none", fontWeight: 600 }}
                >シートで開く↗</a>
              </div>
              <div style={{ fontSize: 13, color: "#6B7280" }}>{rec.type || rec.clinic}{rec.account ? ` · ${rec.account}` : ''} · {rec.content} · {rec.callCount + 1}回目架電</div>
            </div>

            {/* Modal Body (scrollable) */}
            <div style={{ padding: "20px 28px", overflowY: "auto", flex: 1 }}>

              {/* 架電結果 */}
              <div style={sectionStyle}>
                <div style={sectionTitleStyle}>架電結果 *</div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
                  {RESULT_OPTIONS.map(opt => (
                    <button key={opt} onClick={() => setField("result", opt)} style={{
                      background: form.result === opt ? "linear-gradient(135deg,#4F46E5,#7C3AED)" : "#F9FAFB",
                      border: `1px solid ${form.result === opt ? "#6366F1" : "#E5E7EB"}`,
                      color: form.result === opt ? "#fff" : "#374151",
                      borderRadius: 8, padding: "7px 14px", fontSize: 13, cursor: "pointer", fontWeight: 500, transition: "all 0.15s"
                    }}>{opt}</button>
                  ))}
                </div>
                <label style={labelStyle}>架電メモ</label>
                <textarea value={form.note} onChange={e => setField("note", e.target.value)}
                  placeholder={`例：${new Date().toLocaleDateString("ja-JP")}　架電① 不在`} rows={2}
                  style={{ ...inputStyle, resize: "none" }} />
              </div>

              {/* 対応情報 */}
              <div style={sectionStyle}>
                <div style={sectionTitleStyle}>対応情報</div>
                <div style={rowStyle}>
                  <div>
                    <label style={labelStyle}>対応チーム</label>
                    <input value={form.team} onChange={e => setField("team", e.target.value)} style={inputStyle} placeholder="チーム名" />
                  </div>
                  <div>
                    <label style={labelStyle}>初回対応日</label>
                    <input type="date" value={form.firstResponseDate} onChange={e => setField("firstResponseDate", e.target.value)} style={inputStyle} />
                  </div>
                </div>
                <div style={rowStyle}>
                  <div>
                    <label style={labelStyle}>対応者①</label>
                    <input value={form.assignee1} onChange={e => setField("assignee1", e.target.value)} style={inputStyle} placeholder="担当者名" />
                  </div>
                  <div>
                    <label style={labelStyle}>対応者②</label>
                    <input value={form.assignee2} onChange={e => setField("assignee2", e.target.value)} style={inputStyle} placeholder="担当者名" />
                  </div>
                </div>
              </div>

              {/* 解約関連 */}
              <div style={sectionStyle}>
                <div style={sectionTitleStyle}>解約関連</div>
                <div style={rowStyle}>
                  <div>
                    <label style={labelStyle}>解約阻止日</label>
                    <input type="date" value={form.cancelStopDate} onChange={e => setField("cancelStopDate", e.target.value)} style={inputStyle} />
                  </div>
                  <div>
                    <label style={labelStyle}>解約日</label>
                    <input type="date" value={form.cancelDate} onChange={e => setField("cancelDate", e.target.value)} style={inputStyle} />
                  </div>
                </div>
                <div style={rowStyle}>
                  <div>
                    <label style={labelStyle}>解約時返金額</label>
                    <input type="number" value={form.refundAmount} onChange={e => setField("refundAmount", e.target.value)} style={inputStyle} placeholder="0" />
                  </div>
                  <div>
                    <label style={labelStyle}>着地金額</label>
                    <input type="number" value={form.landingAmount} onChange={e => setField("landingAmount", e.target.value)} style={inputStyle} placeholder="0" />
                  </div>
                </div>
                <div style={{ marginBottom: 10 }}>
                  <label style={labelStyle}>ラッカルURL</label>
                  <input value={form.laccarURL} onChange={e => setField("laccarURL", e.target.value)} style={inputStyle} placeholder="https://..." />
                </div>
                <div style={{ display: "flex", gap: 20 }}>
                  <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, cursor: "pointer" }}>
                    <input type="checkbox" checked={form.vip} onChange={e => setField("vip", e.target.checked)} />
                    VIP
                  </label>
                  <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, cursor: "pointer" }}>
                    <input type="checkbox" checked={form.ltvReservation} onChange={e => setField("ltvReservation", e.target.checked)} />
                    LTV予約
                  </label>
                </div>
              </div>

              {/* 予約・来店・契約 */}
              <div style={sectionStyle}>
                <div style={sectionTitleStyle}>予約・来店・契約</div>
                <div style={rowStyle}>
                  <div>
                    <label style={labelStyle}>予約獲得日</label>
                    <input type="date" value={form.reservationDate} onChange={e => setField("reservationDate", e.target.value)} style={inputStyle} />
                  </div>
                  <div>
                    <label style={labelStyle}>予約院</label>
                    <input value={form.reservationClinic} onChange={e => setField("reservationClinic", e.target.value)} style={inputStyle} placeholder="クリニック名" />
                  </div>
                </div>
                <div style={rowStyle}>
                  <div>
                    <label style={labelStyle}>予約日</label>
                    <input type="date" value={form.reservationDay} onChange={e => setField("reservationDay", e.target.value)} style={inputStyle} />
                  </div>
                  <div>
                    <label style={labelStyle}>予約時間</label>
                    <input type="time" value={form.reservationTime} onChange={e => setField("reservationTime", e.target.value)} style={inputStyle} />
                  </div>
                </div>
                <div style={{ marginBottom: 10 }}>
                  <label style={labelStyle}>希望施術</label>
                  <input value={form.desiredTreatment} onChange={e => setField("desiredTreatment", e.target.value)} style={inputStyle} placeholder="施術名" />
                </div>
                <div style={{ display: "flex", gap: 20, marginBottom: 10 }}>
                  <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, cursor: "pointer" }}>
                    <input type="checkbox" checked={form.visit} onChange={e => setField("visit", e.target.checked)} />
                    来店
                  </label>
                  <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, cursor: "pointer" }}>
                    <input type="checkbox" checked={form.contract} onChange={e => setField("contract", e.target.checked)} />
                    契約
                  </label>
                </div>
                {form.contract && (
                  <>
                    <div style={{ marginBottom: 10 }}>
                      <label style={labelStyle}>契約内容</label>
                      <input value={form.contractContent} onChange={e => setField("contractContent", e.target.value)} style={inputStyle} placeholder="施術・コース名" />
                    </div>
                    <div style={rowStyle}>
                      <div>
                        <label style={labelStyle}>契約金額①</label>
                        <input type="number" value={form.contractAmount1} onChange={e => setField("contractAmount1", e.target.value)} style={inputStyle} placeholder="0" />
                      </div>
                      <div>
                        <label style={labelStyle}>契約金額②</label>
                        <input type="number" value={form.contractAmount2} onChange={e => setField("contractAmount2", e.target.value)} style={inputStyle} placeholder="0" />
                      </div>
                    </div>
                  </>
                )}
              </div>

              {/* お断り */}
              <div style={sectionStyle}>
                <div style={sectionTitleStyle}>お断り</div>
                <div style={{ marginBottom: 10 }}>
                  <label style={labelStyle}>お断り施術メニュー</label>
                  <input value={form.refusalMenu} onChange={e => setField("refusalMenu", e.target.value)} style={inputStyle} placeholder="施術名" />
                </div>
                <div style={rowStyle}>
                  <div>
                    <label style={labelStyle}>お断り理由（回数）</label>
                    <input value={form.refusalReasonCount} onChange={e => setField("refusalReasonCount", e.target.value)} style={inputStyle} placeholder="" />
                  </div>
                  <div>
                    <label style={labelStyle}>お断り理由サブ</label>
                    <input value={form.refusalReasonSub} onChange={e => setField("refusalReasonSub", e.target.value)} style={inputStyle} placeholder="" />
                  </div>
                </div>
              </div>

              {/* 備考 */}
              <div style={sectionStyle}>
                <div style={sectionTitleStyle}>備考（自由記述）</div>
                <textarea value={form.freeNotes} onChange={e => setField("freeNotes", e.target.value)}
                  rows={3} placeholder="自由記述..."
                  style={{ ...inputStyle, resize: "none" }} />
              </div>

            </div>

            {/* Modal Footer */}
            <div style={{ padding: "16px 28px 24px", borderTop: "1px solid #E5E7EB", display: "flex", gap: 10, flexShrink: 0 }}>
              <button onClick={closeModal} style={{ flex: 1, background: "#F9FAFB", border: "1px solid #E5E7EB", color: "#6B7280", borderRadius: 10, padding: "11px", fontSize: 14, cursor: "pointer" }}>キャンセル</button>
              <button onClick={handleSubmit} disabled={!form.result} style={{
                flex: 2, background: form.result ? "linear-gradient(135deg,#4F46E5,#7C3AED)" : "#F3F4F6",
                border: "none", color: form.result ? "#fff" : "#9CA3AF", borderRadius: 10, padding: "11px", fontSize: 14, fontWeight: 700, cursor: form.result ? "pointer" : "not-allowed", transition: "all 0.2s"
              }}>
                記録してスプレッドシートに反映 →
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Lステップ確認モーダル */}
      {lstepConfirm && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200, padding: 24 }}
          onClick={() => setLstepConfirm(null)}>
          <div style={{ background: "#fff", borderRadius: 16, padding: "28px 32px", maxWidth: 360, width: "100%", boxShadow: "0 20px 60px rgba(0,0,0,0.15)", textAlign: "center" }}
            onClick={e => e.stopPropagation()}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>⚠️</div>
            <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 8 }}>Lステップを開く前に</div>
            <div style={{ fontSize: 14, color: "#374151", marginBottom: 6 }}>
              Lステップで以下のアカウントに切り替えてください
            </div>
            {lstepConfirm.account && (
              <div style={{ background: "#EEF2FF", borderRadius: 8, padding: "10px 16px", marginBottom: 20, display: "inline-block" }}>
                <div style={{ fontSize: 18, fontWeight: 700, color: "#4F46E5" }}>{lstepConfirm.account}</div>
                {lstepConfirm.lineId && (
                  <div style={{ fontSize: 14, color: "#6D28D9", marginTop: 4, fontWeight: 600 }}>{lstepConfirm.lineId}</div>
                )}
              </div>
            )}
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => setLstepConfirm(null)} style={{ flex: 1, background: "#F9FAFB", border: "1px solid #E5E7EB", color: "#6B7280", borderRadius: 10, padding: "10px", fontSize: 14, cursor: "pointer" }}>
                キャンセル
              </button>
              <a href={lstepConfirm.url} target="_blank" rel="noopener noreferrer"
                onClick={() => setLstepConfirm(null)}
                style={{ flex: 2, background: "linear-gradient(135deg,#4F46E5,#7C3AED)", color: "#fff", borderRadius: 10, padding: "10px", fontSize: 14, fontWeight: 700, textDecoration: "none", display: "flex", alignItems: "center", justifyContent: "center" }}>
                切り替え済み・開く →
              </a>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div style={{ position: "fixed", bottom: 32, left: "50%", transform: "translateX(-50%)", background: "#ECFDF5", border: "1px solid #6EE7B7", color: "#065F46", borderRadius: 12, padding: "12px 24px", fontSize: 14, fontWeight: 500, zIndex: 200, boxShadow: "0 8px 32px rgba(0,0,0,0.1)" }}>
          ✓ {toast}
        </div>
      )}

      {/* Chat */}
      <div style={{ position: "fixed", bottom: 24, right: 24, zIndex: 300, display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 12 }}>
        {chatOpen && (
          <div style={{ width: 360, height: 480, background: "#fff", border: "1px solid #E5E7EB", borderRadius: 20, boxShadow: "0 20px 60px rgba(0,0,0,0.15)", display: "flex", flexDirection: "column", overflow: "hidden" }}>
            <div style={{ padding: "16px 20px", borderBottom: "1px solid #E5E7EB", display: "flex", alignItems: "center", gap: 10, background: "linear-gradient(135deg,#4F46E5,#7C3AED)" }}>
              <div style={{ fontSize: 18 }}>🤖</div>
              <div style={{ color: "#fff", fontWeight: 700, fontSize: 14 }}>仕様AIアシスタント</div>
              <button onClick={() => setChatOpen(false)} style={{ marginLeft: "auto", background: "rgba(255,255,255,0.2)", border: "none", color: "#fff", borderRadius: 6, padding: "2px 8px", cursor: "pointer", fontSize: 16 }}>✕</button>
            </div>
            <div style={{ flex: 1, overflowY: "auto", padding: "16px", display: "flex", flexDirection: "column", gap: 10 }}>
              {chatMessages.length === 0 && (
                <div style={{ color: "#9CA3AF", fontSize: 13, textAlign: "center", marginTop: 40 }}>
                  アプリの仕様について<br />なんでも聞いてください
                </div>
              )}
              {chatMessages.map((m, i) => (
                <div key={i} style={{ display: "flex", justifyContent: m.role === 'user' ? "flex-end" : "flex-start" }}>
                  <div style={{
                    maxWidth: "80%", padding: "10px 14px", borderRadius: 12, fontSize: 13, lineHeight: 1.6, whiteSpace: "pre-wrap",
                    background: m.role === 'user' ? "linear-gradient(135deg,#4F46E5,#7C3AED)" : "#F3F4F6",
                    color: m.role === 'user' ? "#fff" : "#1F2937",
                    borderBottomRightRadius: m.role === 'user' ? 4 : 12,
                    borderBottomLeftRadius: m.role === 'assistant' ? 4 : 12,
                  }}>{m.content}</div>
                </div>
              ))}
              {chatLoading && (
                <div style={{ display: "flex", justifyContent: "flex-start" }}>
                  <div style={{ background: "#F3F4F6", borderRadius: 12, borderBottomLeftRadius: 4, padding: "10px 14px", fontSize: 13, color: "#6B7280" }}>考え中...</div>
                </div>
              )}
            </div>
            <div style={{ padding: "12px 16px", borderTop: "1px solid #E5E7EB", display: "flex", gap: 8 }}>
              <input
                value={chatInput}
                onChange={e => setChatInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && !e.shiftKey && sendChat()}
                placeholder="質問を入力..."
                style={{ flex: 1, background: "#F9FAFB", border: "1px solid #E5E7EB", borderRadius: 8, padding: "8px 12px", fontSize: 13, outline: "none", fontFamily: "'Noto Sans JP', sans-serif" }}
              />
              <button onClick={sendChat} disabled={!chatInput.trim() || chatLoading} style={{
                background: chatInput.trim() && !chatLoading ? "linear-gradient(135deg,#4F46E5,#7C3AED)" : "#F3F4F6",
                border: "none", borderRadius: 8, padding: "8px 14px", cursor: chatInput.trim() && !chatLoading ? "pointer" : "not-allowed",
                color: chatInput.trim() && !chatLoading ? "#fff" : "#9CA3AF", fontSize: 14, fontWeight: 700,
              }}>↑</button>
            </div>
          </div>
        )}
        <button onClick={() => setChatOpen(o => !o)} style={{
          width: 52, height: 52, borderRadius: "50%", border: "none", cursor: "pointer",
          background: "linear-gradient(135deg,#4F46E5,#7C3AED)", boxShadow: "0 4px 16px rgba(99,102,241,0.4)",
          fontSize: 22, display: "flex", alignItems: "center", justifyContent: "center", transition: "transform 0.15s",
        }}
          onMouseEnter={e => e.currentTarget.style.transform = "scale(1.1)"}
          onMouseLeave={e => e.currentTarget.style.transform = "scale(1)"}
        >🤖</button>
      </div>
    </div>
  );
}
