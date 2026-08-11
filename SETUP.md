# 運用者向けセットアップマニュアル

この文書は、完成版の匿名日記交換システムをGoogle環境へ設置し、日常運用を開始する管理者向けです。サーバーや有料外部APIは使用しません。

実際の参加者を登録する前に、別の検証用Spreadsheet・Formで [動作確認手順書](VERIFICATION.md) を最後まで実施してください。

> [!IMPORTANT]
> Spreadsheet、Apps Script、Form編集画面、Driveアーカイブフォルダ、Script Propertiesは管理者専用です。URL、ID、参加者メールアドレスを参加者へ共有しないでください。

## 1. 用意するもの

- システムを所有する管理者Googleアカウント
- 障害通知を受ける管理者のメールアドレス一覧
- このリポジトリの `src/` 一式
- 参加者のGoogleアカウント用メールアドレス一覧
- 検証を完了した記録: [VERIFICATION.md](VERIFICATION.md)

個人の無料Googleアカウントでも構成できますが、Gmail、Apps Script、Driveには日次使用量と保存容量の上限があります。参加者数や写真量が増えた場合は、管理者がGoogleの使用量を確認してください。

## 2. 管理用Spreadsheetを作る

1. システム所有者のアカウントで [Google Sheets](https://sheets.new) を開きます。
2. 空白のSpreadsheetを作り、例として `匿名日記交換（本番）` と名付けます。
3. 右上の「共有」を開き、「一般的なアクセス」を「制限付き」にします。
4. 必要な管理者だけを編集者として追加します。
5. URLの `/d/` と `/edit` の間にある **Spreadsheet ID** を、参加者へ見えない管理メモへ控えます。

## 3. アーカイブ用Driveフォルダを作る

1. システム所有者のGoogle Driveで新しいフォルダを作り、例として `匿名日記アーカイブ（本番）` と名付けます。
2. 「共有」を開き、「一般的なアクセス」を「制限付き」にします。
3. 個別共有する場合は、障害通知先として登録する管理者だけを追加します。
4. URLの `/folders/` より後にある **フォルダID** を管理メモへ控えます。

リンク共有や組織全体への共有が残っていると、アーカイブ処理は安全のため停止します。

## 4. 投稿用Google Formを作る

1. システム所有者のアカウントで [Google Forms](https://forms.new) を開きます。
2. 空白のFormを作り、例として `匿名日記` と名付けます。
3. 必須の本文質問を追加します。
   - 種類: 「段落」
   - タイトル: `日記本文`
   - 「必須」をオン
4. 任意の写真質問を追加します。
   - 種類: 「ファイルのアップロード」
   - タイトル: `写真`
   - JPEG、PNG、GIFだけを許可
   - 説明に「最大3枚、1枚10MB以下、合計20MB以下」と記載
   - Form側で最大3枚を選べない場合は3枚以上の選択肢にし、システム側の上限検証を使用
5. Formの「設定」で次を確認します。
   - メールアドレスを「確認済み」として収集する
   - 回答を1回に制限しない
   - 対象外の組織だけに回答者を限定しない
6. 参加者が回答できるように公開します。編集権限は管理者だけにします。
7. 編集画面URLの `/d/` と `/edit` の間にある **Form ID** を管理メモへ控えます。

質問タイトルを変更した場合は、後述する `DIARY_BODY_ITEM_TITLE` と `PHOTO_ITEM_TITLE` も完全に同じ文字列にしてください。

## 5. Apps Scriptへコードを配置する

1. 手順2のSpreadsheetで「拡張機能」→「Apps Script」を開きます。
2. 最初からあるコードの内容を削除します。
3. `src/` にある各 `.gs` ファイルと同じ名前のスクリプトファイルを作り、内容を貼り付けます。
4. Apps Scriptの「プロジェクトの設定」で、マニフェストファイルをエディタに表示します。
5. `src/appsscript.json` の内容を `appsscript.json` へ貼り付けます。
6. すべて保存します。

コード更新時は既存ファイルを同名のまま更新し、更新後にWeb Appを新しいバージョンへ再デプロイしてください。

## 6. Script Propertiesを設定する

Apps Script左側の「プロジェクトの設定」→「スクリプト プロパティ」で次を登録します。

| キー | 値 |
| --- | --- |
| `SPREADSHEET_ID` | 手順2のSpreadsheet ID |
| `ADMIN_EMAILS` | 全管理者のメールアドレス。複数はカンマ区切り |
| `TIMEZONE` | `Asia/Tokyo` |
| `MAIL_PROVIDER` | `gmail` |
| `DIARY_BODY_ITEM_TITLE` | 通常は `日記本文` |
| `PHOTO_ITEM_TITLE` | 通常は `写真` |
| `FORM_ID` | 手順4のForm ID |
| `ARCHIVE_FOLDER_ID` | 手順3のDriveフォルダID |

`WEB_APP_URL` はWeb Appデプロイ後に追加します。実在の値をソースコードや共有文書へ転記しないでください。

## 7. 管理用シートを初期化する

1. Apps Script上部の関数一覧から `initializeSpreadsheet` を選びます。
2. 「実行」を押します。
3. 初回の権限確認では、システム所有者のアカウントで許可します。
4. Spreadsheetに次の6シートがあることを確認します。
   - `Participants`
   - `Diaries`
   - `Matches`
   - `DeliveryLog`
   - `RunLog`
   - `Comments`
5. Spreadsheetを再読み込みし、「匿名日記システム」メニューが表示されることを確認します。

既存環境の更新時も `initializeSpreadsheet` を1回実行してください。既存列を保持したまま、末尾へ必要な新規列を追加します。列名の変更や並べ替えがある場合は停止します。

## 8. 匿名コメントWeb Appをデプロイする

1. Apps Script右上の「デプロイ」→「新しいデプロイ」を選びます。
2. 種類として「ウェブアプリ」を選びます。
3. 実行ユーザーはシステム所有者を選びます。
4. 参加者が追加の権限承認なしで利用できるアクセス設定を選びます。
5. デプロイして、表示された `/exec` で終わるURLをコピーします。
6. Script Propertiesへ `WEB_APP_URL` を追加し、その `/exec` URLを設定します。

`/dev` URLやApps Script編集画面URLは設定しません。Web Appはコメント投稿者のGoogleユーザー情報を取得・保存しませんが、コメントURL自体が投稿権限になるため、参加者へ第三者共有しないよう案内してください。

## 9. 参加者を登録する

本番参加者を登録する前に [VERIFICATION.md](VERIFICATION.md) の必須項目がすべて合格していることを確認します。検証環境ではテスト参加者だけを登録します。

1. Spreadsheetの「匿名日記システム」→「参加者を追加」を選びます。
2. 参加者がForm回答に使うGoogleアカウントのメールアドレスを入力します。
3. 参加者全員について繰り返します。
4. `Participants` シートで、全員の `active` が `true` になっていることを確認します。

参加停止時は対象者の `active` を `false` にします。無効化後は新規マッチ、未実行配信、再送の対象になりません。行そのものは削除しないでください。

## 10. トリガーを設定する

1. Spreadsheetの「匿名日記システム」→「トリガーを設定」を選びます。
2. 権限確認が表示された場合は許可します。
3. Apps Script左側の「トリガー」で次の2件を確認します。
   - Form送信時: `onDiaryFormSubmit`
   - 時間主導型、毎日22時台（22:20付近）: `runDailyExchange`

設定メニューを再実行すると対象の2トリガーを作り直すため、重複して増えません。Apps Scriptの時間トリガーは指定分の前後約15分に実行されるため、22:20付近を指定して22:00より前の実行を防ぎます。通常の配信開始は22:05～22:35頃です。

## 11. 本番開始の判定

1. 本番とは別のGoogle環境で [VERIFICATION.md](VERIFICATION.md) を実施します。
2. 必須項目がすべて「合格」であることを確認します。
3. 不合格が1件でもあれば、本番参加者へFormを案内しません。
4. 合格後、参加者へ共有するのは回答用Form URLと利用上の注意だけです。

参加者へSpreadsheet、Apps Script、Drive、Web App管理画面、Script PropertiesのURLやIDを送らないでください。

## 12. 日常運用

### 毎日確認するもの

- 管理者宛ての緊急アラートが届いていないか
- `RunLog` の当日状態が `completed` または安全なスキップ状態か
- `DeliveryLog` に未確認の `error`、`processing` がないか
- `Comments` に未確認の `error`、`processing` がないか

### 配信の `error` を再送する

1. `DeliveryLog.error` と管理者通知から原因を解消します。
2. 「匿名日記システム」→「失敗した配信を再送」を選びます。
3. 対象日を `YYYY-MM-DD` で入力します。

### 配信の `processing` を解決する

1. Gmailの送信済みメールで、対象メールが送信済みか確認します。
2. 「processingを確認済みにする」を選びます。
3. `delivery_id` を入力します。
4. 送信済みなら `delivered`、未送信を確認できた場合だけ `error` と入力します。

確認せず `error` にすると二重送信の可能性があります。

### コメント通知を復旧する

- `error`: 「失敗したコメント通知を再送」で対象日を指定します。
- `processing`: Gmail確認後、「コメント通知のprocessingを確認」で `comment_id` と結果を入力します。

### 不完全なマッチを再構築する

「未配信のマッチを再構築」で対象日を指定します。対象日の `DeliveryLog` が1件でも存在する場合は、誤配信防止のため再構築できません。

## 13. アーカイブと削除

1. 「匿名日記システム」→「旧データをアーカイブして削除」を選びます。
2. 基準日を `YYYY-MM-DD` で入力します。
3. 画面に表示された確認文を正確に入力します。
4. 完了通知を全管理者が受信したことを確認します。
5. Driveの実行フォルダに、4つのCSVと `manifest.json` があることを確認します。

基準日当日とそれ以後は対象になりません。CSVの内容・SHA-256検証がすべて成功した後だけ削除します。CSV数式として解釈され得る本文には、安全のため先頭にシングルクォートが付きます。

## 14. コード更新時

1. 更新前にSpreadsheetとアーカイブフォルダの共有範囲を確認します。
2. `src/` のファイルを同名のApps Scriptファイルへ反映します。
3. `initializeSpreadsheet` を1回実行します。
4. Web Appを新しいバージョンへ再デプロイします。
5. `/exec` URLが変わった場合だけ `WEB_APP_URL` を更新します。
6. [VERIFICATION.md](VERIFICATION.md) の必須確認を検証環境で再実施します。

## 15. 困ったとき

| 状況 | 確認すること |
| --- | --- |
| 投稿が `rejected` | Formで収集したメールアドレスと `Participants` のメールアドレス、`active` を確認する。 |
| 日記本文・写真の質問が見つからない | Formの質問タイトルとScript Propertiesを完全一致させる。 |
| コメントリンクが開かない | `WEB_APP_URL` が最新デプロイの `/exec` URLか確認する。 |
| 写真配信が失敗 | JPEG・PNG・GIF、1枚10MB以下、合計20MB以下、最大3枚か確認する。 |
| メールが届かない | `DeliveryLog`、`RunLog`、管理者通知、Gmail送信済みを確認する。 |
| アーカイブが停止 | フォルダが「制限付き」で、個別共有先が管理者だけか確認する。完了通知エラーの場合は、再実行前に実行フォルダ、マニフェスト、対象行の削除状態を確認する。 |

解決できない場合は、参加者向け画面へエラー詳細を転載せず、管理者だけがApps Script実行ログと管理シートを確認してください。

## Google公式の参考資料

- [Google Formを公開・共有する](https://support.google.com/docs/answer/2839588)
- [Apps Script Web Appをデプロイする](https://developers.google.com/apps-script/guides/web)
- [Apps Scriptのインストール型トリガー](https://developers.google.com/apps-script/guides/triggers/installable)
- [Google Driveのファイル・フォルダ共有](https://support.google.com/drive/answer/2494822)
