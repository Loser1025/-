# 解約バスター（call-manager-design）仕様書

## プロジェクト概要

| 項目 | 内容 |
|---|---|
| アプリ名 | 解約バスター |
| 場所 | `c:\Users\弁護士法人響\Desktop\-\call-manager-design\` |
| 本番URL | https://call-manager-design.vercel.app |
| 技術スタック | React (JSX) + Vite + Tailwind CSS + lucide-react + Vercel サーバーレス |
| 用途 | スプレッドシート連携の架電リスト管理ツール |
| デプロイ方法 | `cd call-manager-design && vercel --prod`（GitHub push ではなく CLI 直接） |

---

## ファイル構成

```
call-manager-design/
├── api/
│   ├── auth.js        # Google OAuth トークン交換（Vercel サーバーレス）
│   └── chat.js        # AIチャット・並び替え（Groq API）
├── src/
│   ├── App.jsx        # フロントエンド全体（単一ファイル・約560行）
│   └── index.css
├── GEMINI.md          # 本仕様書
├── vercel.json
└── package.json
```

---

## 認証設定

### Google OAuth（PKCE Authorization Code Flow）

| 項目 | 内容 |
|---|---|
| クライアントID | `87533023495-hdt3pp8ujq3p60ptgl66nqaesnli802v.apps.googleusercontent.com` |
| リダイレクトURI | `https://call-manager-design.vercel.app/`（末尾スラッシュあり・Google Cloud Console登録済み） |
| 方式 | PKCE（code_verifier + code_challenge SHA-256）→ Vercel サーバーレス `/api/auth` でトークン交換 |
| 永続化 | `gtoken` / `gtoken_expiry` を localStorage に保存、55分で期限切れ |

### Vercel 環境変数

| 変数名 | 用途 |
|---|---|
| `GOOGLE_CLIENT_SECRET` | OAuth トークン交換 |
| `GROQ_API_KEY` | AI ソート・チャット |

> ⚠️ `vercel env add` 時は必ず `printf '%s' 'value' | vercel env add KEY production` を使うこと（`echo` は末尾改行が混入して認証エラーになる）

---

## スプレッドシート設定

### リージョン切り替え（EAST / WEST / ATOM）

```js
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
```

### 対象行の条件

- 4行目以降（インデックス3〜）
- `level` 列に「阻止T」を含む行のみ表示

### 列自動検出（ヘッダー行0〜2行目から検索）

| フィールド | 検索キーワード | フォールバック列 |
|---|---|---|
| date | 日付 | 0 |
| name | 名前、顧客名 | 3 |
| clinic | クリニック、院 | 5 |
| account | アカウント | 6 |
| content | 内容、コンテンツ | 7 |
| memo | 備考、メモ | 8 |
| assignee | 担当者、対応者 | 11 |
| level | データ行から「阻止T」をスキャン | 12 |
| result | 架電結果 | 22（W列） |
| completed | 対応完了 | 13 |
| lstep | Lステップ | -1（なし） |
| team | 対応チーム | -1 |
| firstResponseDate | 対応開始日 | -1 |
| initialResponseDate | 初回対応日 | -1 |
| cancelStopDate | 解約阻止日、解約阻止 | -1 |
| refundAmount | 損害金見込み | -1 |
| landingAmount | 着地の損害金、着地損害金 | -1 |
| naCall | NA架電 | -1 |
| time | 「時間」と完全一致 | -1 |

---

## NA内容・NA日時の概念（コア設計）

### naCall列のフォーマット

案件のタブ振り分けはスプレッドシートの「NA架電」列の値で決まる。

| 値のパターン | 意味 | タブ振り分け |
|---|---|---|
| 空欄 | NA未設定 | フォロー１ |
| `アポ\|2026-03-15 14:00` | NA内容＋日時（パイプ区切り） | アポ |
| `フォロー１\|2026-03-20 10:00` | NA内容＋日時 | フォロー１ |
| `フォロー２\|...` | NA内容＋日時 | フォロー２ |
| `フォロー３\|...` | NA内容＋日時 | フォロー３ |
| `完了` | 完了 | 完了 |
| `2026-03-15 14:00`（パイプなし） | **旧形式**：手動入力されたアポ日時 | アポ（AI日時解析） |
| `TRUE` / `FALSE` | 旧形式の値 | フォロー１（NA未設定扱い） |

### parseNaCall() 解析ロジック

```
naCall値 → { naContent, naDate }

① 空欄          → { null, null }
② "完了"         → { "完了", null }
③ "X|YYYY-MM-DD HH:mm" → { "X", "YYYY-MM-DD HH:mm" }
④ TRUE/FALSE    → { null, null }
⑤ それ以外       → { null, 生の値 } ← 旧形式アポ、AI日時解析対象
```

---

## タブ構成・表示ロジック

```
アポ | フォロー１ | フォロー２ | フォロー３ | 完了済み
```

### 完了の定義

以下のいずれかを満たす案件は完了タブに表示される：

| 条件 | 判定名 | 内容 |
|---|---|---|
| naContent = "完了" | isNaDone | 結果登録時に「完了」を選択した |
| 架電結果ログに「解決済み」を含む | isTerminal | callResultRaw に "解決済み" が存在 |
| cancelStopDate あり、または team に「解約処理」含む | isDealDone | 解約関連が記録されている |

> ⚠️ `completed列`（対応完了）は結果登録時に毎回TRUEを書き込むが、**完了タブの表示条件には使用しない**

### 各タブの表示条件

| タブ | 表示条件（完了でないことが前提） |
|---|---|
| アポ | naContent = "アポ"、または naContent が未設定かつ naDate に値がある（旧形式含む） |
| フォロー１ | naContent = "フォロー１"、または naCall が空欄（未着手の新規案件） |
| フォロー２ | naContent = "フォロー２" |
| フォロー３ | naContent = "フォロー３" |
| 完了 | isTerminal OR isDealDone OR naContent = "完了" |

---

## 架電結果登録（モーダル）

### バリデーション

以下がすべて揃うまで「記録を保存」ボタンは無効：

1. **架電結果**（必須）：アポ不通 / 不在 / 解決済み / 通話アポ獲得
2. **NA内容**（必須）：アポ / フォロー１ / フォロー２ / フォロー３ / 完了
3. **NA日時・日付**（NA内容が「完了」以外の場合は必須）

> NA内容に「完了」を選んだ場合、NA日時の入力欄は非表示になる

### 架電ログ記録フォーマット

result列（架電結果列）に改行区切りで追記される。

| 架電結果 | 記録フォーマット例 |
|---|---|
| 不在 | `3/10 不在` |
| アポ不通 | `3/10アポ不通` |
| 解決済み | `3/10解決済み` |
| 通話アポ獲得（NA日時あり） | `3/10 通話アポ獲得 2026-03-20 14:00` |
| メモあり | `3/10 不在 折り返し希望` |

### スプレッドシート書き込み（handleSubmit）

| 列 | 書き込み条件 | 内容 |
|---|---|---|
| result（架電結果） | 常時 | 既存値に改行で追記 |
| completed（対応完了） | 常時 | "TRUE" を上書き |
| naCall（NA架電） | 常時 | `内容\|日付 時間` または `完了` |
| team（対応チーム） | form.team がある場合 | |
| firstResponseDate | rec.firstResponseDate が空の場合のみ | 当日日付を自動入力 |
| initialResponseDate | form.initialResponseDate がある場合 | |
| cancelStopDate | form.cancelStopDate がある場合 | |
| team | form.cancelProcess = true の場合 | "解約処理" を上書き |
| refundAmount | form.refundAmount がある場合 | |
| landingAmount | form.landingAmount がある場合 | |

### モーダルセクション構成

1. **架電結果**（必須）＋ 架電メモ textarea
2. **NA内容**（必須）＋ NA日時（完了以外で必須）
3. **対応情報**（対応チーム、初回対応日、対応者①②）
4. **解約関連**（解約阻止日、解約処理トグル、損害金見込み、着地の損害金、ラッカルURL、VIP/LTV予約）
5. **予約・来店・契約**

---

## フォームの初期値（EMPTY_FORM）

```js
{
  result: "", note: "", team: "", initialResponseDate: "",
  assignee1: "", assignee2: "", cancelStopDate: "", refundAmount: "",
  landingAmount: "", cancelProcess: false,
  naContent: "",        // ← NA内容（新）
  naCallDate: "",       // ← NA日付
  naCallTime: "",       // ← NA時間
  laccarURL: "", template: "", vip: false, ltvReservation: false,
  reservationDate: "", reservationClinic: "", reservationDay: "", reservationTime: "",
  desiredTreatment: "", visit: false, contract: false, contractContent: "",
  contractAmount1: "", contractAmount2: "",
}
```

---

## 並び替え機能

### 操作フロー

`並び替え✨` ボタン → `昇順▲` `降順▼` → `✕` でリセット
タブ切り替えでも並び替えがリセットされる。

### ソート方法

| タブ | ソート対象 | 方法 |
|---|---|---|
| アポ | naDate | Groq AI で日時解析（直接パース可能なものは自動変換、バラバラ表記のみAIへ） |
| フォロー１〜３ | naDate | `new Date(naDate)` で直接パース |
| 完了 | ソートなし | |

### AI日時解析のキャッシュ

- `apoSortMap`（state）に `naDate → ISO8601文字列` のマッピングをキャッシュ
- 同じnaDate値は2回目以降AIに送信しない
- 直接パース可能なもの（`new Date()` で有効な日付）はAIを使わず即変換

---

## UI仕様

### カラー・デザイン

| 項目 | 値 |
|---|---|
| プライマリカラー | `#4F46E5`（インディゴ） |
| 背景 | `#F8FAFC`（スレート系） |
| フォント | Plus Jakarta Sans + Noto Sans JP（Google Fonts） |
| レイアウト | 固定サイドバー（w-64）＋メインコンテンツ |

### NA内容バッジカラー

| NA内容 | 背景 | テキスト |
|---|---|---|
| アポ | オレンジ系 | `#EA580C` |
| フォロー１ | 青系 | `#2563EB` |
| フォロー２ | 紫系 | `#7C3AED` |
| フォロー３ | 緑系 | `#059669` |
| 完了 | グレー | `#64748B` |
| 未設定 | グレー | `#64748B` |

### 阻止TのA/B/Cバッジカラー

| タイプ | 背景 | テキスト |
|---|---|---|
| A | 赤系 | `#991B1B` |
| B | 黄系 | `#92400E` |
| C | 緑系 | `#065F46` |

### カード表示（RecordCard）

- 左：NA内容バッジ（未設定の場合は「未設定」表示）
- 中：顧客名、各種バッジ、メモ、NA日時、架電ログ（直近3件）
- 右：日付＋時間、「結果入力」ボタン
- 重複顧客名：赤いボーダー・背景でハイライト

### その他UI機能

- **Lステップボタン**：アカウント確認ポップアップ付き（`各アカウント一覧` シートとの紐付け）
- **チャットボタン**：✨ FAB（Groq llama-3.3-70b、仕様AIアシスタント）
- **シートで開く**：モーダルヘッダーに直リンク

---

## 既知の解決済み問題

| 問題 | 原因 | 解決策 |
|---|---|---|
| redirect_uri_mismatch | Google Cloud Console に design アプリのURLが未登録 | `https://call-manager-design.vercel.app/` を承認済みURIに追加 |
| ログインしてもログイン画面に戻る | vercel env add に echo を使ったため末尾改行が混入し invalid_client | `printf '%s'` で再登録 |

---

## 作業時の注意事項

- **コード変更前に必ずユーザーに内容を確認すること**
- デプロイは `vercel --prod` を call-manager-design ディレクトリで実行
- 環境変数追加は必ず `printf '%s' 'value' | vercel env add KEY production` を使う
- `naCall` 列の書き込みフォーマットは `内容|日付 時間`（パイプ区切り）を厳守
- 旧形式データ（パイプなし日時文字列）との後方互換を維持すること

---

*最終更新: 2026-03-10*
