# 匿名日記ランダム交換システム 実装仕様書 v1.0

## 1. モジュール分割とファイル構成
- `config.gs`: 設定値取得（複数管理者アドレス、タイムゾーン等）
- `main.gs`: メインエントリーポイント (`runDailyExchange`)
- `diary.gs`: 日記データ抽出・締切判定
- `participants.gs`: 参加者マスター検証
- `matching.gs`: ランダムマッチング・履歴回避・奇数対応ロジック
- `history.gs`: Matchesシート操作
- `mail.gs`: メール送信用抽象モジュール（将来の独自ドメイン連携に対応できる設計）
- `comments.gs`: Web Appコメント受付・通知処理
- `admin.gs`: 手動実行、アーカイブ・データ削除機能
- `errors.gs`: エラーハンドリング・複数管理者通知
- `utils.gs`: トークン生成、ロック制御、JST日時判定

## 2. アーカイブおよびデータ削除機能の実装仕様
- `archiveOldData(beforeDate)` 関数を実装。
- **手順**:
  1. `Diaries`, `Matches`, `Comments`, `DeliveryLog` より `diary_date` / `submitted_at` < `beforeDate` の行を取得。
  2. データをCSVフォーマット文字列に変換。
  3. Google Driveの専用「Archive」フォルダに `archive_YYYYMMDD.csv` として出力。
  4. 対象行を各スプレッドシートから削除（下行から詰めて削除）。
  5. 処理結果ログを管理者に通知。

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

## 4. メール配信モジュールの拡張性仕様
- `sendSystemMail(to, subject, body, htmlBody)` 関数で全メール送信を一元管理。
- 当面は内部で `GmailApp.sendEmail()` を呼び出すが、設定オプション (`MAIL_PROVIDER`) によって外部送信ロジックへの差し替えが容易な設計とする。
