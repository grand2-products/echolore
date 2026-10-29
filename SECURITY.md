# Security Policy

## Reporting a Vulnerability

セキュリティ脆弱性を見つけた場合は、公開 Issue ではなく **GitHub Security Advisories** 経由で報告してください:

1. リポジトリの [Security タブ](https://github.com/grand2-products/echolore/security/advisories) を開く
2. 「Report a vulnerability」から報告

Please report vulnerabilities via [GitHub Security Advisories](https://github.com/grand2-products/echolore/security/advisories) rather than public issues.

- 検証の上、影響範囲に応じて対応します (通常 90 日以内を目安)
- 報告者のクレジットをリリースノートに記載することも可能です

## Scope

- EchoLore 本体 (apps/, packages/, skills/)
- インフラ構成 (docker-compose*.yml, scripts/)
- 認証・認可、MCP エンドポイント、外部連携

以下は対象外です:

- 自己ホスト環境での独自カスタマイズに起因する問題
- 旧バージョンの継続使用に起因する問題 (最新版で修正済みのもの)
- サーバー自体の運用ミス (公開すべきでないポートの開放など)

## Best Practices for Self-Hosters

- 常に最新版へアップデートしてください (`scripts/update.sh`)
- 管理画面のパスワードは強固なものを設定し、必要に応じて Cloudflare 等で `/admin` にアクセス制限を併用してください
- MCP エージェントトークンは最小権限 (read) で発行し、不要になったら失効させてください
