# 匿名日記ランダム交換システム

固定参加者が匿名で日記を交換し、感想を送り合うための、Google Workspace 上で完結する小規模コミュニティ向けシステムです。

## 特長

- Google Forms から日記本文と任意の写真（最大3枚）を投稿
- 毎日22:00 JST の締切後、投稿者を匿名でランダムな相互ペアにして配信
- 直近7日間の同一ペアをできる限り避け、奇数人時のスキップを公平に扱う
- 専用トークンURLを通じた匿名コメント
- Google Sheets・GAS・Drive・Gmailのみを使う、追加コストのない運用
- 二重送信防止、複数管理者へのエラー通知、CSVアーカイブと安全な削除

## システム構成

```text
Google Forms → Google Sheets → GAS（日次バッチ） → Gmail
                                  ├─ Google Drive（写真・アーカイブ）
                                  └─ GAS Web App（匿名コメント）
```

## 利用の流れ

1. 参加者は22:00 JSTまでに日記を投稿します。
2. 22:05頃に日次バッチが有効投稿者をランダムに1対1でマッチングします。
3. それぞれに相手の日記と匿名コメント用リンクがメールで届きます。
4. コメントを送ると、書き手へ投稿者を明かさずに通知されます。

投稿者が奇数の場合は1名を当日の交換対象外とし、後日の救済を考慮します。投稿が0件または1件の日は安全に処理をスキップします。

## プライバシーと安全性

参加者に公開するのは日記本文、写真、コメント用URLだけです。氏名、メールアドレス、参加者・日記ID、Googleアカウント情報、管理用のURLは公開しません。

誤配信・二重送信を防ぐため、配信済み状態と配信ログを管理します。障害時は登録済みのすべての管理者に即時通知し、手動で安全に再実行できるようにします。

## 実装予定の構成

GAS の実装は次の責務ごとに分割します。

| ファイル | 責務 |
| --- | --- |
| `config.gs` | 設定と管理者アドレス |
| `main.gs` | 日次交換のエントリーポイント |
| `diary.gs` / `participants.gs` | 投稿の抽出と参加者検証 |
| `matching.gs` / `history.gs` | マッチング、履歴、配信状態 |
| `mail.gs` / `errors.gs` | メール抽象化と障害通知 |
| `comments.gs` | 匿名コメントWeb App |
| `admin.gs` | 再実行、アーカイブ、削除 |
| `utils.gs` | トークン、ロック、JST日時処理 |

## ドキュメント

- [基本仕様](docs/1-basic-spec-v1.0.md)
- [要求仕様](docs/2-require-spec-v1.0.md)
- [基本設計](docs/3-basic-design-v1.0.md)
- [実装仕様](docs/4-impl-spec-v1.0.md)
- [エージェント開発指示](docs/5-agent-dev-inst.md)

開発時の必須ルールと確認項目は [AGENTS.md](AGENTS.md) を参照してください。

## 開発用Python環境

アプリケーション本体はGASですが、スキルや補助スクリプトの検証にPythonを使います。依存は `uv` で管理します。

```bash
UV_CACHE_DIR=/tmp/anonymous-diary-uv-cache uv sync --group dev
UV_CACHE_DIR=/tmp/anonymous-diary-uv-cache uv run --group dev python /home/encailiu/.codex/skills/.system/skill-creator/scripts/quick_validate.py /home/encailiu/.codex/skills/anonymous-diary-guardrails
```

通常の書き込み可能な開発環境では `UV_CACHE_DIR` の指定は不要です。`.venv/` はローカル環境のためリポジトリには含めません。
