# 匿名日記ランダム交換システム 実装仕様書 v1.0

## 1. モジュール分割とファイル構成

以下のうち `admin.gs` のアーカイブ・削除責務は目標構成であり、現在は未実装である。
- `config.gs`: 設定値取得（複数管理者アドレス、タイムゾーン等）
- `main.gs`: メインエントリーポイント (`runDailyExchange`)
- `diary.gs`: 日記データ抽出・締切判定
- `participants.gs`: 参加者マスター検証
- `matching.gs`: ランダムマッチング・履歴回避・奇数対応ロジック
- `history.gs`: Matchesシート操作
- `mail.gs`: Gmailを経由するメール送信の一元管理モジュール
- `comments.gs`: Web Appコメント受付・通知処理
- `admin.gs`: 手動実行、アーカイブ・データ削除機能
- `errors.gs`: エラーハンドリング・複数管理者通知
- `utils.gs`: トークン生成、ロック制御、JST日時判定

## 2. アーカイブおよびデータ削除機能の実装仕様

本節は後続フェーズで実装する予定仕様である。
- `archiveOldData(beforeDate)` 関数を実装。
- **手順**:
  1. `Diaries`, `Matches`, `Comments`, `DeliveryLog` より `diary_date` / `submitted_at` < `beforeDate` の行を取得。
  2. データをCSVフォーマット文字列に変換。
  3. Google Driveの専用「Archive」フォルダに `archive_YYYYMMDD.csv` として出力。
  4. 出力したCSVが存在し、対象データを含むことを確認する。
  5. 確認に成功した場合に限り、対象行を各スプレッドシートから下行から詰めて削除する。
  6. 処理結果ログを管理者に通知。

## 3. エラー処理と複数管理者通知の実装仕様
- `notifyAdminsOfError(errorContext, errorDetails)` 関数を実装。
- `Config` または `ScriptProperties` から `ADMIN_EMAILS` (カンマ区切りまたは配列) を取得。
- 全ての管理者アドレスに対して以下のフォーマットでメールを即時発信：
  ```text
  件名: 【緊急アラート】匿名日記システムでエラーが発生しました
  本文:
  発生時刻: YYYY-MM-DD HH:mm:ss JST
  発生処理: {errorContext}
  エラー内容: {errorDetails}
  
  管理者画面（Spreadsheet）を確認してください。
  ```

## 4. メール配信モジュール仕様
- `sendSystemMail(to, subject, body, htmlBody)` 関数で全メール送信を一元管理。
- 内部では `GmailApp.sendEmail()` を呼び出し、Googleの標準機能だけで送信する。

## 5. 配信状態と再送仕様

- 配信の正本は `DeliveryLog.status` とし、`Matches.status` は対応する2配信の集約状態として同期する。
- 新規配信は送信前に `processing` を記録し、成功後に `delivered`、送信例外時に `error` を記録する。
- 日次処理は既存の配信ログを自動再送しない。未解決の `error` または `processing` があれば処理結果を成功扱いしない。
- 管理者の明示的な再送操作では、指定日の `error` だけを対象とする。
- `processing` は、メール送信成功後に状態更新だけが失敗した可能性を排除できないため自動・手動再送の対象にしない。管理者がGmailと実行ログを確認する。
- 管理者がGmailを確認した後、対象の `delivery_id` を `delivered` または `error` に明示解決できる。未送信を確認できた場合だけ `error` とする。
- マッチング、初回配信、再送の各時点で `active=true` を確認し、無効化済み参加者へは送信しない。
- 不完全なマッチは、対象日のDeliveryLogが存在しない場合に限り、管理者の明示操作で削除・再構築できる。

## 6. 匿名コメント仕様

- 受付済み日記ごとにUUID由来の64文字ランダムトークンを発行する。
- 参加者向けURLには `comment_token` だけを含め、日記ID、参加者ID、メールアドレスを含めない。
- Web Appはコメント投稿者のGoogleアカウント情報を取得・保存しない。
- コメント本文はHTMLエスケープし、通知は `sendSystemMail` を経由する。
- 通知失敗は `error` として保存して全管理者へ通知し、管理者の明示操作で再送する。
- 送信結果不明の `processing` は二重通知防止のため自動再送しない。
