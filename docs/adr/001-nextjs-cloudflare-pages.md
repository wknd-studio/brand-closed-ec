# ADR-001: Next.js 16 App Router + Cloudflare Pages を採用する

## ステータス

Accepted

## コンテキスト

フロントエンドフレームワークとホスティング先を決定する必要があった。このサービスは招待制クローズド EC であり、グローバルな低レイテンシと低コストなホスティングが求められる。また、Server Actions による型安全なサーバー処理と、React Server Components による柔軟なレンダリング制御が必要だった。

## 決定

**Next.js 16 App Router** をフレームワークとして採用し、**Cloudflare Pages + Workers** でホスティングする。

## 代替案

| 案                      | 却下理由                                                        |
| ----------------------- | --------------------------------------------------------------- |
| Vercel ホスティング     | コストが高い。Cloudflare Pages は無料枠が広く、エッジ実行が標準 |
| Remix + Cloudflare      | Next.js のエコシステム・学習コストの観点で Next.js を優先       |
| 従来の Node.js サーバー | エッジ実行のメリットが得られない。運用コストが高い              |

## 結果

### メリット

- Cloudflare のエッジネットワークにより、世界中どこからでも低レイテンシでアクセスできる
- Cloudflare Pages は無料枠が広く、ホスティングコストを抑えられる
- Server Actions で型安全な API を別途実装せずにサーバー処理を記述できる
- React Server Components でクライアントに送るデータを細かく制御できる

### 制約・注意点

- **Edge Runtime のみ使用可能**。Node.js 固有の API（`fs`・`crypto` 等）は使えない
- 利用するライブラリはすべて Edge Runtime 互換である必要がある
- `@opennextjs/cloudflare` アダプター経由でビルドする（`pnpm build:cloudflare`）
