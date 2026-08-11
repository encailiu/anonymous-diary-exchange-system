# セットアップ

## 1. 検証環境を用意する

本番とは別に、検証用のGoogle Spreadsheet、Google Form、テスト参加者用メールアドレスを用意します。Formは組織内ログインを必須にし、回答者メールアドレスを収集してください。

SpreadsheetでGASプロジェクトを作成し、`src/` のファイルを配置します。`appsscript.json` のタイムゾーンは `Asia/Tokyo` のままにします。ローカルから配備する場合は、`.clasp.json.example` を `.clasp.json` にコピーして実際のScript IDを設定します。`.clasp.json` はコミットしません。

## 2. Script Propertiesを設定する

| キー | 値 |
| --- | --- |
| `SPREADSHEET_ID` | 検証用SpreadsheetのID |
| `ADMIN_EMAILS` | 通知先メールアドレスをカンマ区切りで指定 |
| `TIMEZONE` | `Asia/Tokyo` |
| `MAIL_PROVIDER` | `gmail` |
| `DIARY_BODY_ITEM_TITLE` | Formの日記本文質問の完全一致タイトル |
| `FORM_ID` | 検証用Google FormのID |

Apps Scriptエディタで `initializeSpreadsheet()` を一度実行し、必要なシートを作成します。次に `Participants` へテスト参加者を追加します。`participant_id` はUUID、`email` は小文字化したメールアドレス、`active` は `true` にします。

## 3. トリガーを設定する

`installTriggers()` を一度実行します。既存の `onDiaryFormSubmit` と `runDailyExchange` のプロジェクトトリガーを置き換え、以下を作成します。

- Form送信時: `onDiaryFormSubmit`
- 毎日22:05頃（JST）: `runDailyExchange`

Formの質問タイトルを変えた場合は、`DIARY_BODY_ITEM_TITLE` も更新します。

## 4. 検証する

ローカルでは `uv run --group dev python tests/test_gas_source.py` を実行し、GASの純粋ロジックを検証します。次に `runMvpSelfTests()` をApps Scriptエディタから実行し、成功メッセージを確認します。その後、検証用の2人・4人の参加者で投稿・配信・再実行を確認します。検証では実在の参加者や本番データを使用しません。

## 運用上の注意

- `DeliveryLog` に既存行がある配信は自動再送しません。`processing` または `error` は管理者がメール送信状況を確認してから対応してください。
- 参加者向けメール、Form、ログに管理用URLや内部IDを掲載しません。
- 写真、匿名コメント、アーカイブはこのMVPには含まれません。
