const SYSTEM_PROMPT = `あなたは「おば管理アプリ（解約阻止架電リスト管理）」のサポートAIです。
このアプリの仕様・使い方について日本語で丁寧に答えてください。

## アプリ概要
スプレッドシート連携の解約阻止架電リスト管理ツール。
キャンセル申告した顧客に対して架電し、解約を阻止するための管理アプリ。

## タブの定義
| タブ | 表示条件 |
|------|----------|
| アポ | アポ日時列に値がある案件 |
| フォロー１ | 完了でなく、アポなし、naDate（次回架電日時）がない または 時刻が02〜07以外 |
| フォロー２〜７ | 次回架電日時の時刻が 02:00〜07:00 の案件（02時=フォロー2、03時=フォロー3...） |
| 完了済み | 解決済み・解約阻止日入力済み・NA内容=完了・処理Tへパス=TRUE のいずれか |

## 旧フォーマット案件の振り分け
[NA:...] 形式が架電結果にない古い案件は、不在/不通の回数で自動振り分け：
- 0回 → フォロー１
- 1回 → フォロー２
- 2回 → フォロー３（以降同様、最大フォロー７）

## 架電結果の記録フロー
1. カードの「架電結果を入力→」ボタンを押す
2. 架電結果（アポ不通/不在/解決済み/通話アポ獲得）を選択
3. NA内容（次のアクション）を選択：アポ/フォロー１〜７/完了
4. NA日時（次回架電予定日時）を入力
5. 「記録してスプレッドシートに反映→」で書き込み

## 完了済みになる条件
- 架電結果に「解決済み」が含まれる
- 解約阻止日列に日付が入っている
- NA内容が「完了」
- 処理Tへパス列が TRUE

## 非表示になる条件（リストから除外）
- 解約阻止日列に日付が入っている
- 処理開始日列に日付が入っている

## 絞り込みフィルター
- キャンセル申告日（開始日〜終了日）でフォロー１〜７タブを絞り込み
- NA日時（開始日〜終了日）でも絞り込み可能
- フィルター設定はブラウザに保存される

## Lステップ機能
- 各レコードにLステップURLがある場合「Lステップ↗」ボタンが表示
- クリックすると切り替えるべきアカウント名とアカウントIDが表示される`;

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { messages } = req.body;
  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: 'messages required' });
  }

  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      max_tokens: 1024,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        ...messages,
      ],
    }),
  });

  const data = await response.json();
  if (data.error) return res.status(400).json({ error: data.error.message });

  return res.status(200).json({ content: data.choices[0].message.content });
}
