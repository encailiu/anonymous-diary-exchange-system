# 匿名日記ランダム交換システム

固定参加者が匿名で日記を交換し、感想を送り合うための、Google Workspace 上で完結する小規模コミュニティ向けシステムです。

## 現在実装済みの機能

- Google Forms から日記本文と任意の写真を最大3枚投稿
- 毎日22:00 JST の締切後、投稿者を匿名でランダムな相互ペアにして配信
- 直近7日間の同一ペアをできる限り避け、奇数人時のスキップを公平に扱う
- 推測困難な専用トークンURLから匿名コメントを送り、書き手へ通知
- Forms、Sheets、GAS、Drive、Gmail、SlidesなどGoogle標準機能だけを使う、追加コストのない運用
- 二重送信防止、複数管理者へのエラー通知、失敗した配信の明示的な再送
- シート別CSVとSHA-256マニフェストによる検証後アーカイブ・削除
- 写真をPNGへ再描画し、元ファイル名・Drive URLを除いた匿名添付として配信

## システム構成

```text
Google Forms → Google Sheets → GAS（日次バッチ） → Gmail
                                  ├─ Google Drive（写真・アーカイブ）
                                  └─ GAS Web App（匿名コメント）
```

## 利用の流れ

1. 参加者は22:00 JSTまでに日記を投稿します。
2. 22:05頃に日次バッチが有効投稿者をランダムに1対1でマッチングします。
3. それぞれに相手の日記本文と匿名コメントリンクがメールで届きます。
4. コメントを送ると、コメント投稿者を記録せず書き手へ通知されます。

投稿者が奇数の場合は1名を当日の交換対象外とし、後日の救済を考慮します。投稿が0件または1件の日は安全に処理をスキップします。

## プライバシーと安全性

参加者向けメールとWeb画面に公開するのは日記本文、再描画済み写真、匿名コメント本文、ランダムなコメントトークンだけです。氏名、メールアドレス、参加者・日記ID、Googleアカウント情報、管理用のURLは公開しません。本文や写真の写り込みから本人を推測できる可能性までは技術的に排除できません。

誤配信・二重送信を防ぐため、配信済み状態と配信ログを管理します。`error` の配信だけを管理者が明示的に再送できます。送信結果が確定できない `processing` は二重送信防止のため自動再送しません。

## 実装構成

GAS の実装は次の責務ごとに分割します。

| ファイル | 責務 |
| --- | --- |
| `config.gs` | 設定と管理者アドレス |
| `main.gs` | 日次交換、配信状態遷移、配信の再送・復旧 |
| `diary.gs` / `participants.gs` | 投稿の抽出と参加者検証 |
| `matching.gs` / `history.gs` | マッチング、履歴、配信状態 |
| `mail.gs` / `errors.gs` | メール抽象化と障害通知 |
| `comments.gs` | 匿名コメントWeb App |
| `admin.gs` | トリガー、管理メニュー、アーカイブ、削除 |
| `utils.gs` | トークン、ロック、JST日時処理 |

## ドキュメント

- [運用者向けセットアップマニュアル](SETUP.md)
- [非エンジニア向け動作確認手順書・チェックリスト](VERIFICATION.md)
- [基本仕様](docs/1-basic-spec-v1.0.md)
- [要求仕様](docs/2-require-spec-v1.0.md)
- [基本設計](docs/3-basic-design-v1.0.md)
- [実装仕様](docs/4-impl-spec-v1.0.md)
- [エージェント開発指示](docs/5-agent-dev-inst.md)

開発時の必須ルールと確認項目は [AGENTS.md](AGENTS.md) を参照してください。

実装の進捗と次回の開始点は [実装チェックリスト](docs/implementation-checklist.md) で管理します。

## 開発用Python環境

アプリケーション本体はGASですが、スキルや補助スクリプトの検証にPythonを使います。依存は `uv` で管理します。

```bash
UV_CACHE_DIR=/tmp/anonymous-diary-uv-cache uv sync --group dev
UV_CACHE_DIR=/tmp/anonymous-diary-uv-cache uv run --group dev python /home/encailiu/.codex/skills/.system/skill-creator/scripts/quick_validate.py /home/encailiu/.codex/skills/anonymous-diary-guardrails
UV_CACHE_DIR=/tmp/anonymous-diary-uv-cache uv run --group dev python tests/test_gas_source.py
```

通常の書き込み可能な開発環境では `UV_CACHE_DIR` の指定は不要です。`.venv/` はローカル環境のためリポジトリには含めません。
